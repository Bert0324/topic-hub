import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { BridgeConfig } from './openclaw-types';

export interface GeneratedBridgeConfig {
  configPath: string;
  configDir: string;
  webhookSecret: string;
  gatewayPort: number;
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Derives the OpenClaw HTTP base from the webhook URL: any path segment(s) before
 * `/webhooks/openclaw` (e.g. reverse-proxy mount) must also prefix `…/v1/chat/completions`,
 * or the client hits `/v1/…` on the origin and gets 404.
 */
export function openClawTopichubHttpBaseFromWebhookUrl(webhookUrl: string): string {
  const u = new URL(webhookUrl);
  const marker = '/webhooks/openclaw';
  const i = u.pathname.indexOf(marker);
  if (i < 0) {
    return u.origin;
  }
  const prefix = u.pathname.slice(0, i).replace(/\/+$/, '');
  return prefix ? `${u.origin}${prefix}` : u.origin;
}

export async function findAvailablePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('Failed to allocate port'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function buildOpenClawJson(
  bridgeConfig: BridgeConfig,
  webhookSecret: string,
  port: number,
  hooksDir: string,
): string {
  const channels: Record<string, unknown> = {};

  if (bridgeConfig.channels.feishu) {
    const f = bridgeConfig.channels.feishu;
    // Per-channel `commands` is rejected by OpenClaw FeishuConfigSchema (.strict());
    // disabling built-in commands is done via root-level `commands` below.
    channels.feishu = {
      enabled: true,
      dmPolicy: 'open',
      allowFrom: ['*'],
      groupPolicy: 'open',
      ...(f.domain ? { domain: f.domain } : {}),
      accounts: {
        default: {
          appId: f.appId,
          appSecret: f.appSecret,
          ...(f.name ? { name: f.name } : {}),
          ...(f.domain ? { domain: f.domain } : {}),
        },
      },
    };
  }

  if (bridgeConfig.channels.discord) {
    const d = bridgeConfig.channels.discord;
    const discordEntry: Record<string, unknown> = {
      enabled: true,
      dmPolicy: 'open',
      allowFrom: ['*'],
      groupPolicy: 'open',
      token: d.botToken,
    };
    if (d.guildId) {
      discordEntry.guilds = {
        [d.guildId]: { requireMention: true },
      };
    }
    channels.discord = discordEntry;
  }

  if (bridgeConfig.channels.telegram) {
    channels.telegram = {
      enabled: true,
      dmPolicy: 'open',
      allowFrom: ['*'],
      groupPolicy: 'open',
      botToken: bridgeConfig.channels.telegram.botToken,
    };
  }

  if (bridgeConfig.channels.slack) {
    const s = bridgeConfig.channels.slack;
    channels.slack = {
      enabled: true,
      dmPolicy: 'open',
      allowFrom: ['*'],
      groupPolicy: 'open',
      botToken: s.botToken,
      appToken: s.appToken,
    };
  }

  if (bridgeConfig.channels.weixin) {
    channels['openclaw-weixin'] = {
      enabled: true,
      dmPolicy: 'open',
      allowFrom: ['*'],
      groupPolicy: 'open',
    };
  }

  const plugins: Record<string, unknown> = {};
  if (bridgeConfig.channels.weixin) {
    plugins['openclaw-weixin'] = { enabled: true };
  }

  const config = {
    gateway: {
      port,
      mode: 'local',
      auth: { token: webhookSecret },
      reload: { mode: 'off' },
    },
    // Topic Hub handles all commands via the inbound-relay hook → webhook; disable
    // OpenClaw's own command surfaces completely (including built-in /help).
    commands: {
      native: false,
      nativeSkills: false,
      text: false,
    },
    models: {
      providers: {
        topichub: {
          baseUrl: `${openClawTopichubHttpBaseFromWebhookUrl(bridgeConfig.webhookUrl)}/v1`,
          apiKey: 'noop',
          api: 'openai-completions',
          models: [
            {
              id: 'noop',
              name: 'Noop',
              reasoning: false,
              input: ['text'],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 128000,
              maxTokens: 1,
            },
          ],
        },
      },
    },
    agents: {
      defaults: {
        model: { primary: 'topichub/noop' },
        skills: [],
      },
    },
    channels,
    ...(Object.keys(plugins).length > 0 ? { plugins: { entries: plugins } } : {}),
    hooks: {
      enabled: true,
      token: crypto.randomBytes(32).toString('hex'),
      path: '/hooks',
      internal: {
        enabled: true,
        load: {
          extraDirs: [hooksDir],
        },
        entries: {
          'topic-hub-inbound-relay': { enabled: true },
        },
      },
    },
  };

  return JSON.stringify(config, null, 2);
}

export function generateBridgeConfigFiles(
  bridgeConfig: BridgeConfig,
  webhookSecret: string,
  port: number,
): GeneratedBridgeConfig {
  const configDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'topichub-bridge-'),
  );

  const hooksDir = path.join(configDir, 'hooks');
  const hookDir = path.join(hooksDir, 'topic-hub-inbound-relay');
  fs.mkdirSync(hookDir, { recursive: true });

  fs.writeFileSync(
    path.join(hookDir, 'HOOK.md'),
    `---
name: topic-hub-inbound-relay
description: "Forward channel messages to the TopicHub server"
metadata:
  { "openclaw": { "emoji": "📡", "events": ["message:received"] } }
---
# topic-hub-inbound-relay
Forwards inbound channel messages to the TopicHub webhook endpoint.
`,
  );

  const handlerCode = buildRelayHandler(bridgeConfig.webhookUrl, webhookSecret);
  fs.writeFileSync(path.join(hookDir, 'handler.ts'), handlerCode);

  const content = buildOpenClawJson(bridgeConfig, webhookSecret, port, hooksDir);

  const configPath = path.join(configDir, 'openclaw.json');
  fs.writeFileSync(configPath, content, 'utf-8');

  return { configPath, configDir, webhookSecret, gatewayPort: port };
}

function buildRelayHandler(webhookUrl: string, secret: string): string {
  return `import * as crypto from "node:crypto";

const WEBHOOK_URL = ${JSON.stringify(webhookUrl)};
// Prefer env (set by BridgeManager on the OpenClaw child) so HMAC always matches Topic Hub.
const SECRET = process.env.TOPICHUB_WEBHOOK_HMAC_SECRET ?? ${JSON.stringify(secret)};

function normalizeImCommandMessage(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/\\uFF0F/g, "/");
  // Discord / Slack raw mentions: <@id>, <@!id>, <@&id> (alphanumeric IDs)
  for (;;) {
    const m = s.match(/^(<@[!&]?[\\w]+>)\\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }
  // Feishu/Lark self-closing <at …/> (before paired tags and before indexOf("/"))
  for (;;) {
    const m = s.match(/^<at\\b[^>]*\\/>\\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }
  // Feishu/Lark rich-text <at> tags
  for (;;) {
    const m = s.match(/^<at\\b[^>]*>.*?<\\/at>\\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }
  // Telegram: /command@BotName → /command
  s = s.replace(/^(\\/\\w+)@\\S+/, "$1");
  // Short label before /command (e.g. Feishu "Topic Hub /help")
  {
    const slashIdx = s.indexOf("/");
    if (slashIdx > 0) {
      const prefix = s.slice(0, slashIdx).trim();
      const tail = s.slice(slashIdx).trimStart();
      if (
        prefix.indexOf("/") === -1 &&
        new RegExp("^/[A-Za-z0-9_-]+").test(tail) &&
        prefix.length > 0 &&
        prefix.length <= 48
      ) {
        const words = prefix.split(/\\s+/).filter(Boolean);
        if (words.length >= 1 && words.length <= 3) {
          const last = words[words.length - 1];
          if (last && /^#\\d+$/.test(last)) {
            s = last + " " + tail;
          } else {
            s = tail;
          }
        }
      }
    }
  }
  // Plain @-mention before slash: keep agent slot #N (e.g. @Bot #2 /skill args)
  if (s.startsWith("@")) {
    const atAgentSlash = s.match(/^@(.+?)\\s+(#\\d+)\\s+(\\/.*)$/s);
    if (atAgentSlash) {
      s = atAgentSlash[2] + " " + atAgentSlash[3].trimStart();
    } else {
      const idx = s.indexOf("/");
      if (idx > 0) s = s.slice(idx);
    }
  }
  return s;
}

const handler = async (event) => {
  if (event.type !== "message" || event.action !== "received") return;

  const ctx = event.context || {};
  const content = normalizeImCommandMessage(ctx.content ?? "");

  const sk = String(event.sessionKey ?? "");
  const senderId = String(ctx.metadata?.senderId ?? ctx.from ?? "");
  const ctxChannelId = String(ctx.channelId ?? "").trim();

  function inferPlatformFromSessionKey(sessionKey) {
    const low = String(sessionKey || "").toLowerCase();
    if (low.includes(":feishu:") || low.includes(":lark:")) return "feishu";
    if (low.includes(":discord:")) return "discord";
    if (low.includes(":telegram:")) return "telegram";
    if (low.includes(":slack:")) return "slack";
    if (low.includes("weixin")) return "openclaw-weixin";
    return "";
  }

  const PLUGIN_IDS = new Set(["feishu", "lark", "discord", "telegram", "slack", "openclaw-weixin"]);
  const platformOut =
    inferPlatformFromSessionKey(sk)
    || (PLUGIN_IDS.has(ctxChannelId.toLowerCase()) ? ctxChannelId : "");

  // Resolve the reply target (chat or user ID) for the IM provider.
  // 1) ctx.metadata.chatId — set by Feishu/Discord plugins
  // 2) session key group segment — agent:main:<provider>:group:<chatId>
  // 3) session key dm segment — agent:main:<provider>:dm:<userId>
  // 4) ctx.channelId when it is NOT a plugin id (some runtimes put chat id here)
  // 5) "user:<senderId>" — DM fallback (Feishu user:openId format)
  let replyTarget = "";
  if (ctx.metadata?.chatId) {
    replyTarget = String(ctx.metadata.chatId);
  } else {
    const skParts = sk.split(":");
    const grpIdx = skParts.indexOf("group");
    const chIdx = skParts.indexOf("channel");
    const dmIdx = skParts.indexOf("dm");
    if (grpIdx >= 0 && grpIdx + 1 < skParts.length) {
      replyTarget = skParts[grpIdx + 1];
    } else if (chIdx >= 0 && chIdx + 1 < skParts.length) {
      replyTarget = skParts[chIdx + 1];
    } else if (dmIdx >= 0 && dmIdx + 1 < skParts.length) {
      replyTarget = "user:" + skParts[dmIdx + 1];
    } else if (ctxChannelId && !PLUGIN_IDS.has(ctxChannelId.toLowerCase())) {
      replyTarget = ctxChannelId;
    } else if (senderId) {
      replyTarget = "user:" + senderId;
    }
  }

  // DM detection: OpenClaw sets ctx.scope or we infer from session key structure.
  // Group sessions: agent:main:<provider>:group:<chatId>
  // DM sessions:   agent:main:main  or  agent:main:<provider>:dm:<userId>
  const isDm = ctx.scope === "dm"
    || (ctx.scope !== "group" && !sk.includes(":group:"));

  const imChannel = replyTarget || (senderId ? "user:" + senderId : "");

  const body = {
    event: "message.received",
    timestamp: new Date().toISOString(),
    data: {
      channel: imChannel,
      user: senderId,
      message: String(content),
      sessionId: sk,
      ...(platformOut ? { platform: platformOut } : {}),
      isDm,
    },
  };

  const bodyStr = JSON.stringify(body);
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(bodyStr).digest("hex");

  console.log("[topichub-relay] forwarding:", JSON.stringify({ platform: platformOut, target: imChannel, content }));

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TopicHub-Signature": sig,
      },
      body: bodyStr,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("[topichub-relay] webhook POST failed:", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[topichub-relay] webhook POST error:", err?.message ?? err);
  }

};

export default handler;
`;
}

export function cleanupBridgeConfigFiles(configDir: string): void {
  try {
    fs.rmSync(configDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}
