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
      commands: {
        native: false,
        nativeSkills: false,
      },
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

  const config = {
    gateway: {
      port,
      mode: 'local',
      auth: { token: webhookSecret },
      reload: { mode: 'off' },
    },
    // Topic Hub handles /topichub via relay → webhook; disable OpenClaw command surfaces so
    // Discord slash / text /foo is not routed to the gateway agent (model "none" would error).
    commands: {
      native: false,
      nativeSkills: false,
      text: false,
    },
    agents: {
      defaults: {
        model: { primary: 'none' },
        skills: [],
      },
    },
    channels,
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
  for (;;) {
    const m = s.match(/^(<@!?\d+>|<@&\d+>)\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }
  return s;
}

const handler = async (event) => {
  if (event.type !== "message" || event.action !== "received") return;

  const ctx = event.context || {};
  const content = normalizeImCommandMessage(ctx.content ?? "");

  // HMAC covers exact POST body bytes; signature is sent in X-TopicHub-Signature.
  const body = {
    event: "message.received",
    timestamp: new Date().toISOString(),
    data: {
      channel: String(ctx.channelId ?? ""),
      user: String(ctx.metadata?.senderId ?? ctx.from ?? ""),
      message: String(content),
      sessionId: String(event.sessionKey ?? ""),
    },
  };

  const bodyStr = JSON.stringify(body);
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(bodyStr).digest("hex");

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
