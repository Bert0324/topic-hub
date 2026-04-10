import * as crypto from 'node:crypto';
import type { TopicHubLogger } from '../common/logger';
import type {
  OpenClawConfig,
  OpenClawWebhookPayload,
  OpenClawInboundResult,
  TenantChannelEntry,
} from './openclaw-types';
import { OpenClawWebhookPayloadSchema } from './openclaw-types';
import { MessageRenderer } from './message-renderer';
import type { CardData } from '../skill/interfaces/type-skill';

const COMMAND_PREFIX = '/topichub';
const ANSWER_PREFIX = '/answer';
const DEDUP_TTL_MS = 60_000;

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
   * **without** the `signature` field, so we strip it before hashing.
   */
  verifySignature(payload: Record<string, unknown>, signature: string): boolean {
    const { signature: _sig, ...bodyWithoutSig } = payload;
    const canonical = JSON.stringify(bodyWithoutSig);
    const computed = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(canonical)
      .digest('hex');
    const expected = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;
    if (computed.length !== expected.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  handleInboundWebhook(
    payload: unknown,
    _rawBody: string,
  ): OpenClawInboundResult | null {
    const parsed = OpenClawWebhookPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn('Invalid OpenClaw webhook payload', parsed.error.message);
      return null;
    }

    const webhook: OpenClawWebhookPayload = parsed.data;

    if (!this.verifySignature(payload as Record<string, unknown>, webhook.signature)) {
      this.logger.warn('OpenClaw webhook signature verification failed');
      return null;
    }

    if (webhook.event !== 'message.received') {
      this.logger.debug(`Ignoring OpenClaw event: ${webhook.event}`);
      return null;
    }

    const { channel, user, message, sessionId } = webhook.data;

    if (!message.startsWith(COMMAND_PREFIX) && !message.startsWith(ANSWER_PREFIX)) {
      return null;
    }

    if (this.isDuplicate(sessionId, message)) {
      this.logger.debug('Duplicate webhook detected, skipping');
      return null;
    }

    const mapping = this.config.tenantMapping[channel];
    if (!mapping) {
      this.logger.warn(`No tenant mapping found for channel: ${channel}`);
      return null;
    }

    return {
      tenantId: mapping.tenantId,
      platform: mapping.platform,
      channel,
      userId: user,
      rawCommand: message,
      sessionId,
    };
  }

  async sendMessage(channel: string, target: string, message: string): Promise<void> {
    const url = `${this.config.gatewayUrl}/api/v1/send`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({
          action: 'send',
          channel,
          target,
          message,
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
