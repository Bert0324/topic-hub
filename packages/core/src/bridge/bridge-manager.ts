import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TopicHubLogger } from '../common/logger';
import type { TopicHubBridgeConfig } from './openclaw-types';
import { toBridgeFileConfig } from './openclaw-types';
import {
  generateBridgeConfigFiles,
  cleanupBridgeConfigFiles,
  generateWebhookSecret,
  type GeneratedBridgeConfig,
} from './bridge-config-generator';
import { loadOpenclawGatewayEmbed } from './openclaw-embed-loader';

export const TOPICHUB_WEBHOOK_HMAC_ENV = 'TOPICHUB_WEBHOOK_HMAC_SECRET';

/** IM channel sources synced by `sync-bridge-vendor.mjs` (not the sparse `dist/extensions` vendor slice). */
function resolveVendoredBundledPluginsDir(): string {
  return resolve(__dirname, '..', '..', 'vendor', 'bridge', 'extensions');
}

export interface BridgeManagerState {
  running: boolean;
  listenPort: number | null;
  mountPath: string | null;
  restartCount: number;
  webhookSecret: string | null;
}

export class BridgeManager {
  private generated: GeneratedBridgeConfig | null = null;
  private _webhookSecret: string | null = null;
  private _listenPort: number | null = null;
  private _mountPath: string | null = null;
  private gatewayClose: ((opts?: { reason?: string }) => Promise<void>) | null = null;
  private shuttingDown = false;

  constructor(
    private readonly bridge: TopicHubBridgeConfig,
    private readonly logger: TopicHubLogger,
  ) {}

  get webhookSecret(): string | null {
    return this._webhookSecret;
  }

  /** @deprecated Use listenPort; gateway shares the host listen port. */
  get port(): number | null {
    return this._listenPort;
  }

  get mountPath(): string | null {
    return this._mountPath;
  }

  get state(): BridgeManagerState {
    return {
      running: this.gatewayClose !== null && !this.shuttingDown,
      listenPort: this._listenPort,
      mountPath: this._mountPath,
      restartCount: 0,
      webhookSecret: this._webhookSecret,
    };
  }

  /**
   * Start OpenClaw embedded on `bridge.httpServer` under `bridge.mountPath`.
   * Call while the host `http.Server` exists and before it accepts traffic
   * (e.g. Nest `OnApplicationBootstrap` during `app.listen()`).
   */
  async start(): Promise<void> {
    this.shuttingDown = false;

    const { httpServer, listenPort, mountPath } = this.bridge;

    this._webhookSecret = generateWebhookSecret();
    this._listenPort = listenPort;
    this._mountPath = mountPath;

    const gatewayPort = this.bridge.port ?? listenPort;

    this.generated = generateBridgeConfigFiles(
      toBridgeFileConfig(this.bridge),
      this._webhookSecret,
      gatewayPort,
    );

    this.logger.log(`Bridge config generated at ${this.generated.configPath}`);

    process.env.OPENCLAW_CONFIG_PATH = this.generated.configPath;
    process.env[TOPICHUB_WEBHOOK_HMAC_ENV] = this._webhookSecret!;

    const bundledPluginsDir = resolveVendoredBundledPluginsDir();
    if (!existsSync(bundledPluginsDir)) {
      throw new Error(
        `Missing vendored OpenClaw bundled plugins directory: ${bundledPluginsDir}\n` +
          'From repo root run: node packages/core/scripts/sync-bridge-vendor.mjs --bridge',
      );
    }
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = bundledPluginsDir;

    const { startGatewayServer } = await loadOpenclawGatewayEmbed();
    const raw = mountPath.startsWith('/') ? mountPath : `/${mountPath}`;
    const pathPrefix = raw.replace(/\/+$/, '') || '/';
    if (pathPrefix === '/') {
      throw new Error('bridge mountPath must not be "/" (use e.g. /openclaw)');
    }

    const gateway = await startGatewayServer(listenPort, {
      bind: 'loopback',
      auth: { mode: 'token', token: this._webhookSecret! },
      embed: {
        httpServer,
        pathPrefix,
      },
    });

    this.gatewayClose = gateway.close.bind(gateway);

    this.logger.log(
      `OpenClaw gateway embedded (listenPort=${this._listenPort}, mount=${this._mountPath})`,
    );
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;

    if (this.gatewayClose) {
      try {
        await this.gatewayClose({ reason: 'topic-hub shutdown' });
      } catch (err) {
        this.logger.warn(
          'OpenClaw gateway close failed',
          err instanceof Error ? err.message : String(err),
        );
      }
      this.gatewayClose = null;
    }

    if (this.generated) {
      cleanupBridgeConfigFiles(this.generated.configDir);
      this.generated = null;
    }

    this.logger.log('OpenClaw gateway stopped');
  }
}
