import * as crypto from 'node:crypto';
import type { TopicHubLogger } from '../common/logger';
import type {
  OpenClawConfig,
  OpenClawWebhookPayload,
  OpenClawWebhookUnsignedPayload,
  OpenClawInboundResult,
} from './openclaw-types';
import {
  OpenClawWebhookPayloadSchema,
  OpenClawWebhookUnsignedPayloadSchema,
} from './openclaw-types';

/**
 * Strip leading IM-platform mentions so `/create`, `/answer`, etc. still match
 * when users write `@Bot /create …`.
 *
 * Handles:
 *  - Discord user `<@id>` / `<@!id>`, role `<@&id>`
 *  - Slack user `<@UABC123>` (alphanumeric IDs)
 *  - Feishu/Lark rich-text `<at user_id="…">Name</at>` tags
 *  - Telegram trailing `@BotName` on commands (e.g. `/help@MyBot`)
 *  - Plain `@DisplayName` text (OpenClaw resolves raw IDs before hooks see content)
 *  - Short leading label + slash command (e.g. Feishu pick-bot line `Topic Hub /help`)
 */
export function normalizeImCommandMessage(raw: string): string {
  let s = raw.trim();
  // IME / copy-paste sometimes uses full-width slash (Feishu, mobile keyboards)
  s = s.replace(/\uFF0F/g, '/');

  // Discord / Slack raw mentions: <@id>, <@!id>, <@&id> (IDs may be alphanumeric)
  for (;;) {
    const m = s.match(/^(<@[!&]?[\w]+>)\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }

  // Feishu/Lark self-closing rich-text mentions: `<at user_id="…"/>` (must run before
  // paired-tag strip and before "short prefix" logic — otherwise `indexOf('/')` hits `/>`).
  for (;;) {
    const m = s.match(/^<at\b[^>]*\/>\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }

  // Feishu/Lark rich-text <at>…</at> tags
  for (;;) {
    const m = s.match(/^<at\b[^>]*>.*?<\/at>\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }

  // Telegram: `/command@BotName` → `/command`
  s = s.replace(/^(\/\w+)@\S+/, '$1');

  // "Topic Hub /help" / "@Topic Hub /create …" — short prefix (≤3 words) before first `/command`
  {
    const slashIdx = s.indexOf('/');
    if (slashIdx > 0) {
      const prefix = s.slice(0, slashIdx).trim();
      const tail = s.slice(slashIdx).trimStart();
      if (
        !prefix.includes('/') &&
        /^\/[A-Za-z0-9_-]+/.test(tail) &&
        prefix.length > 0 &&
        prefix.length <= 48
      ) {
        const words = prefix.split(/\s+/).filter(Boolean);
        if (words.length >= 1 && words.length <= 3) {
          const last = words[words.length - 1]!;
          // Keep `agent #N` when the label is "Bot #2 /skill …" or even "#2 /skill …" (slot before slash).
          if (/^#\d+$/.test(last)) {
            s = `${last} ${tail}`;
          } else {
            s = tail;
          }
        }
      }
    }
  }

  // Plain @mention text before a slash command — preserve leading `#N` for `@Bot #2 /Skill …`
  if (s.startsWith('@')) {
    const atAgentSlash = s.match(/^@(.+?)\s+(#\d+)\s+(\/.*)$/s);
    if (atAgentSlash) {
      s = `${atAgentSlash[2]} ${atAgentSlash[3].trimStart()}`;
    } else {
      const slashIdx = s.indexOf('/');
      if (slashIdx > 0) {
        s = s.slice(slashIdx);
      }
    }
  }

  // "@BotName hello" / "@Topic Hub hi" → "hello" / "hi" (no slash; freeform after display mention)
  s = s.replace(/^@\S+(?:\s+\S+)*\s+(?=\S)/, '').trim();

  return s;
}

/**
 * Exact JSON bytes used for HMAC — must stay in sync with `topichub-relay` handler.ts
 * (`JSON.stringify(body)` before the signature field is appended).
 */
export function canonicalOpenClawWebhookSigningString(webhook: {
  event: string;
  timestamp: string;
  data: { channel: string; user: string; message: string; sessionId: string };
}): string {
  return JSON.stringify({
    event: String(webhook.event),
    timestamp: String(webhook.timestamp),
    data: {
      channel: String(webhook.data.channel),
      user: String(webhook.data.user),
      message: String(webhook.data.message),
      sessionId: String(webhook.data.sessionId),
    },
  });
}

export class OpenClawBridge {
  constructor(
    private readonly config: OpenClawConfig,
    private readonly logger: TopicHubLogger,
  ) {}

  /** Outbound tool calls against an embedded gateway (same host port + mount path). */
  static forEmbeddedGateway(params: {
    gatewayBaseUrl: string;
    webhookSecret: string;
    platforms: string[];
    logger: TopicHubLogger;
  }): OpenClawBridge {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    return new OpenClawBridge(
      {
        gatewayUrl: base,
        token: params.webhookSecret,
        webhookSecret: params.webhookSecret,
        platforms: params.platforms,
      },
      params.logger,
    );
  }

  /**
   * Verify HMAC-SHA256 signature.  The signature covers the JSON body
   * **without** the `signature` field, using the same canonical serialization as topichub-relay.
   */
  verifySignature(payload: Record<string, unknown>, signature: string): boolean {
    const parsed = OpenClawWebhookPayloadSchema.safeParse(payload);
    if (!parsed.success) return false;
    const { signature: sig, ...body } = parsed.data;
    if (sig !== signature) return false;
    return this.verifyParsedPayloadSignature(body, sig);
  }

  /** Verify HMAC for validated fields (same bytes as topichub-relay `JSON.stringify(body)`). */
  verifyParsedPayloadSignature(
    body: Omit<OpenClawWebhookPayload, 'signature'>,
    signature: string,
  ): boolean {
    const canonical = canonicalOpenClawWebhookSigningString(body);
    const computed = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(canonical)
      .digest('hex');
    const expected = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    if (computed.length !== expected.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  private static readTopicHubSignatureHeader(
    headers?: Record<string, string | string[] | undefined>,
  ): string | undefined {
    if (!headers) return undefined;
    const raw =
      headers['x-topichub-signature'] ??
      headers['X-TopicHub-Signature'];
    if (Array.isArray(raw)) return raw[0];
    return typeof raw === 'string' ? raw : undefined;
  }

  private toRawBodyBuffer(rawBody: Buffer | string | undefined): Buffer | null {
    if (rawBody === undefined || rawBody === null) return null;
    return Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  }

  /** HMAC over exact POST body bytes (must match embedded relay). */
  private verifyRawBodyHmac(buf: Buffer, signatureHeader: string): boolean {
    const computed = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(buf)
      .digest('hex');
    const expected = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;
    if (computed.length !== expected.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  handleInboundWebhook(
    payload: unknown,
    rawBody?: Buffer | string,
    headers?: Record<string, string | string[] | undefined>,
  ): OpenClawInboundResult | null {
    const sigHeader = OpenClawBridge.readTopicHubSignatureHeader(headers);
    const buf = this.toRawBodyBuffer(rawBody);

    let webhook: OpenClawWebhookPayload;

    if (sigHeader) {
      const fromParsedBody = OpenClawWebhookUnsignedPayloadSchema.safeParse(payload);
      const signingCandidates: Buffer[] = [];
      if (buf && buf.length > 0) {
        signingCandidates.push(buf);
      }
      if (fromParsedBody.success) {
        signingCandidates.push(
          Buffer.from(
            canonicalOpenClawWebhookSigningString(fromParsedBody.data),
            'utf8',
          ),
        );
      }

      const matched = signingCandidates.find((b) => this.verifyRawBodyHmac(b, sigHeader));
      if (!matched) {
        this.logger.warn(
          'OpenClaw webhook signature verification failed (X-TopicHub-Signature; tried raw body and canonical JSON)',
        );
        return null;
      }

      let unsigned: OpenClawWebhookUnsignedPayload;
      if (buf && matched.equals(buf)) {
        try {
          const json: unknown = JSON.parse(buf.toString('utf8'));
          const u = OpenClawWebhookUnsignedPayloadSchema.safeParse(json);
          if (!u.success) {
            this.logger.warn('Invalid OpenClaw webhook payload', u.error.message);
            return null;
          }
          unsigned = u.data;
        } catch {
          this.logger.warn('Invalid OpenClaw webhook JSON body');
          return null;
        }
      } else if (fromParsedBody.success) {
        unsigned = fromParsedBody.data;
      } else {
        this.logger.warn('OpenClaw webhook payload could not be validated for signed request');
        return null;
      }

      webhook = { ...unsigned, signature: sigHeader };
    } else {
      const parsed = OpenClawWebhookPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        this.logger.warn('Invalid OpenClaw webhook payload', parsed.error.message);
        return null;
      }

      const { signature, ...body } = parsed.data;

      if (!this.verifyParsedPayloadSignature(body, signature)) {
        this.logger.warn('OpenClaw webhook signature verification failed');
        return null;
      }

      webhook = parsed.data;
    }

    if (webhook.event !== 'message.received') {
      this.logger.debug(`Ignoring OpenClaw event: ${webhook.event}`);
      return null;
    }

    const { channel, user, message, sessionId, platform: webhookPlatform, displayName: webhookDisplayName } =
      webhook.data;
    const normalized = normalizeImCommandMessage(message);

    this.logger.debug(`Inbound webhook: channel=${channel} user=${user} message=${JSON.stringify(normalized)} sessionId=${sessionId}`);

    const platform =
      webhookPlatform && String(webhookPlatform).trim()
        ? String(webhookPlatform).trim()
        : OpenClawBridge.inferPlatformFromSessionKey(sessionId)
          ?? this.inferPlatform(channel);
    if (!platform) {
      this.logger.warn(
        `Cannot determine platform (sessionId=${sessionId}, channel=${channel}). ` +
          'Ensure the embedded relay sets data.platform or that sessionKey contains a channel id (feishu, discord, …).',
      );
      return null;
    }

    return {
      platform,
      channel,
      userId: user,
      rawCommand: normalized,
      originalMessage: message,
      sessionId,
      isDm: !!webhook.data.isDm,
      ...(webhookDisplayName ? { imDisplayName: webhookDisplayName } : {}),
    };
  }

  /**
   * @param channel IM plugin id (e.g. `feishu`) — sent as `X-OpenClaw-Message-Channel`.
   * @param target Delivery peer id (chat id, `user:…`, etc.).
   * @param opts.sessionKey When set, must be the inbound OpenClaw session key so replies route to the same DM/group.
   */
  /** @returns true when OpenClaw accepted the send (HTTP 2xx). */
  async sendMessage(
    channel: string,
    target: string,
    message: string,
    opts?: { sessionKey?: string },
  ): Promise<boolean> {
    const url = `${this.config.gatewayUrl}/tools/invoke`;
    const sessionKey =
      opts?.sessionKey?.trim()
      || `agent:main:${channel}:channel:${target}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.token}`,
          'X-OpenClaw-Message-Channel': channel,
        },
        body: JSON.stringify({
          tool: 'message',
          action: 'send',
          args: {
            to: target,
            message,
          },
          sessionKey,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(
          `OpenClaw send failed: ${res.status} ${res.statusText}`,
          body,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(
        'OpenClaw send request failed',
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  private inferPlatform(channel?: string): string | undefined {
    const platforms = this.config.platforms;
    if (!platforms || platforms.length === 0) return undefined;
    if (platforms.length === 1) return platforms[0];
    if (channel) {
      const match = platforms.find((p) => channel.toLowerCase().startsWith(p.toLowerCase()));
      if (match) return match;
    }
    this.logger.warn(`Multiple platforms configured (${platforms.join(', ')}) but webhook did not include platform field`);
    return undefined;
  }

  /** Parse OpenClaw `agent:…` session keys for embedded bridge + multi-channel setups. */
  static inferPlatformFromSessionKey(sessionId: string): string | undefined {
    const parts = String(sessionId || '')
      .toLowerCase()
      .split(':')
      .filter(Boolean);
    if (parts.includes('feishu') || parts.includes('lark')) return 'feishu';
    if (parts.includes('discord')) return 'discord';
    if (parts.includes('telegram')) return 'telegram';
    if (parts.includes('slack')) return 'slack';
    if (parts.some((p) => p.includes('weixin'))) return 'openclaw-weixin';
    return undefined;
  }
}
