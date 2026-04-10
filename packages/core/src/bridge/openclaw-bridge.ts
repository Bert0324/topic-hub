import * as crypto from 'node:crypto';
import type { TopicHubLogger } from '../common/logger';
import type {
  OpenClawConfig,
  OpenClawWebhookPayload,
  OpenClawWebhookUnsignedPayload,
  OpenClawInboundResult,
  TenantChannelEntry,
} from './openclaw-types';
import {
  OpenClawWebhookPayloadSchema,
  OpenClawWebhookUnsignedPayloadSchema,
} from './openclaw-types';
import { MessageRenderer } from './message-renderer';
import type { CardData } from '../skill/interfaces/type-skill';

const COMMAND_PREFIX = '/topichub';
const ANSWER_PREFIX = '/answer';
const DEDUP_TTL_MS = 60_000;

/**
 * Strip leading Discord mentions so `/topichub` / `/answer` still match when users write `@Bot /topichub …`.
 * Handles user mentions `<@id>`, `<@!id>` and role `<@&id>`.
 */
export function normalizeImCommandMessage(raw: string): string {
  let s = raw.trim();
  // Strip raw Discord mentions: <@id>, <@!id>, <@&id>
  for (;;) {
    const m = s.match(/^(<@!?\d+>|<@&\d+>)\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }
  // OpenClaw resolves <@id> to @DisplayName before hooks see the content.
  // Strip leading @mention text before the first /topichub or /answer command.
  if (s.startsWith('@')) {
    const cmdIdx = s.indexOf('/topichub');
    const ansIdx = s.indexOf('/answer');
    const idx = cmdIdx >= 0 && ansIdx >= 0 ? Math.min(cmdIdx, ansIdx) : cmdIdx >= 0 ? cmdIdx : ansIdx;
    if (idx > 0) {
      s = s.slice(idx);
    }
  }
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
  private readonly dedup = new Map<string, number>();
  private readonly renderer = new MessageRenderer();
  private dedupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly config: OpenClawConfig,
    private readonly logger: TopicHubLogger,
  ) {
    this.dedupTimer = setInterval(() => this.cleanupDedup(), DEDUP_TTL_MS);
    if (this.dedupTimer.unref) {
      this.dedupTimer.unref();
    }
  }

  /**
   * Create an OpenClawBridge configured for an auto-managed (embedded) gateway.
   * The gatewayUrl, token, and webhookSecret are derived from the BridgeManager's state.
   */
  static fromBridgeManager(
    port: number,
    webhookSecret: string,
    tenantMapping: Record<string, TenantChannelEntry>,
    logger: TopicHubLogger,
  ): OpenClawBridge {
    return new OpenClawBridge(
      {
        gatewayUrl: `http://127.0.0.1:${port}`,
        token: webhookSecret,
        webhookSecret,
        tenantMapping,
      },
      logger,
    );
  }

  destroy(): void {
    if (this.dedupTimer) {
      clearInterval(this.dedupTimer);
      this.dedupTimer = undefined;
    }
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

    const { channel, user, message, sessionId } = webhook.data;
    const normalized = normalizeImCommandMessage(message);

    this.logger.debug(`Inbound webhook: channel=${channel} user=${user} message=${JSON.stringify(normalized)} sessionId=${sessionId}`);

    if (!normalized.startsWith(COMMAND_PREFIX) && !normalized.startsWith(ANSWER_PREFIX)) {
      this.logger.debug(`Message does not start with ${COMMAND_PREFIX} or ${ANSWER_PREFIX}, ignoring`);
      return null;
    }

    if (this.isDuplicate(sessionId, normalized)) {
      this.logger.debug('Duplicate webhook detected, skipping');
      return null;
    }

    const mapping = this.config.tenantMapping[channel];
    if (!mapping) {
      this.logger.warn(`No tenant mapping found for channel: ${channel} (available: ${Object.keys(this.config.tenantMapping).join(', ')})`);
      return null;
    }

    return {
      tenantId: mapping.tenantId,
      platform: mapping.platform,
      channel,
      userId: user,
      rawCommand: normalized,
      sessionId,
    };
  }

  async sendMessage(channel: string, target: string, message: string): Promise<void> {
    const url = `${this.config.gatewayUrl}/tools/invoke`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({
          tool: 'message',
          action: 'send',
          args: {
            to: target,
            message,
          },
          sessionKey: `agent:main:${channel}:channel:${target}`,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(
          `OpenClaw send failed: ${res.status} ${res.statusText}`,
          body,
        );
      }
    } catch (err) {
      this.logger.error(
        'OpenClaw send request failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async notifyTenantChannels(
    tenantId: string,
    card: CardData,
    topicType?: string,
  ): Promise<void> {
    const markdown = this.renderer.renderCard(card, topicType);

    const channels = Object.entries(this.config.tenantMapping).filter(
      ([, entry]) => entry.tenantId === tenantId,
    );

    for (const [channelId, entry] of channels) {
      await this.sendMessage(entry.platform, channelId, markdown);
    }
  }

  getRenderer(): MessageRenderer {
    return this.renderer;
  }

  resolveTenant(channel: string): { tenantId: string; platform: string } | undefined {
    return this.config.tenantMapping[channel];
  }

  private isDuplicate(sessionId: string, message: string): boolean {
    const hash = crypto
      .createHash('sha256')
      .update(message)
      .digest('hex')
      .substring(0, 16);
    const key = `${sessionId}:${hash}`;
    const now = Date.now();

    if (this.dedup.has(key)) {
      return true;
    }

    this.dedup.set(key, now);
    return false;
  }

  private cleanupDedup(): void {
    const cutoff = Date.now() - DEDUP_TTL_MS;
    for (const [key, ts] of this.dedup) {
      if (ts < cutoff) {
        this.dedup.delete(key);
      }
    }
  }
}
