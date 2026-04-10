import { spawn, type ChildProcess } from 'node:child_process';
import type { TopicHubLogger } from '../common/logger';
import type { BridgeConfig } from './openclaw-types';
import {
  generateBridgeConfigFiles,
  cleanupBridgeConfigFiles,
  generateWebhookSecret,
  findAvailablePort,
  type GeneratedBridgeConfig,
} from './bridge-config-generator';

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESTART_RETRIES = 3;
const HEALTH_CHECK_INTERVAL_MS = 15_000;
const RESTART_BASE_DELAY_MS = 2_000;
const SHUTDOWN_GRACE_MS = 5_000;

export interface BridgeManagerState {
  running: boolean;
  port: number | null;
  pid: number | null;
  restartCount: number;
  webhookSecret: string | null;
}

export class BridgeManager {
  private process: ChildProcess | null = null;
  private generated: GeneratedBridgeConfig | null = null;
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private restartCount = 0;
  private shuttingDown = false;
  private _webhookSecret: string | null = null;
  private _port: number | null = null;

  constructor(
    private readonly bridgeConfig: BridgeConfig,
    private readonly logger: TopicHubLogger,
  ) {}

  get webhookSecret(): string | null {
    return this._webhookSecret;
  }

  get port(): number | null {
    return this._port;
  }

  get state(): BridgeManagerState {
    return {
      running: this.process !== null && !this.shuttingDown,
      port: this._port,
      pid: this.process?.pid ?? null,
      restartCount: this.restartCount,
      webhookSecret: this._webhookSecret,
    };
  }

  async start(): Promise<void> {
    this.shuttingDown = false;
    this.restartCount = 0;

    this._webhookSecret = generateWebhookSecret();
    this._port = this.bridgeConfig.port ?? await findAvailablePort();

    this.generated = generateBridgeConfigFiles(
      this.bridgeConfig,
      this._webhookSecret,
      this._port,
    );

    this.logger.log(`Bridge config generated at ${this.generated.configPath}`);

    await this.spawnGateway();
    await this.waitForHealthy();
    this.startHealthCheck();

    this.logger.log(
      `OpenClaw gateway started (pid=${this.process?.pid}, port=${this._port})`,
    );
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    this.stopHealthCheck();

    if (this.process) {
      await this.killProcess();
    }

    if (this.generated) {
      cleanupBridgeConfigFiles(this.generated.configDir);
      this.generated = null;
    }

    this.logger.log('OpenClaw gateway stopped');
  }

  private resolveOpenClawBin(): string {
    try {
      const resolved = require.resolve('openclaw/package.json');
      const pkgDir = require('node:path').dirname(resolved);
      const binPath = require('node:path').join(pkgDir, 'openclaw.mjs');
      const fs = require('node:fs');
      if (fs.existsSync(binPath)) return binPath;
    } catch {
      // fall through
    }
    return 'openclaw';
  }

  private async spawnGateway(): Promise<void> {
    if (!this.generated) {
      throw new Error('Bridge config not generated');
    }

    const bin = this.resolveOpenClawBin();
    const args = bin === 'openclaw'
      ? ['gateway', '--config', this.generated.configPath, '--port', String(this._port), '--force']
      : [bin, 'gateway', '--config', this.generated.configPath, '--port', String(this._port), '--force'];
    const cmd = bin === 'openclaw' ? bin : process.execPath;

    this.process = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      detached: false,
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n').filter(Boolean)) {
        this.logger.debug(`[OpenClaw] ${line}`);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n').filter(Boolean)) {
        this.logger.warn(`[OpenClaw] ${line}`);
      }
    });

    this.process.on('exit', (code, signal) => {
      this.logger.warn(
        `OpenClaw gateway exited (code=${code}, signal=${signal})`,
      );
      this.process = null;

      if (!this.shuttingDown) {
        this.handleCrash();
      }
    });
  }

  private async waitForHealthy(): Promise<void> {
    const timeout = this.bridgeConfig.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    const deadline = Date.now() + timeout;
    const pollInterval = 500;

    while (Date.now() < deadline) {
      if (await this.isHealthy()) return;
      await sleep(pollInterval);
    }

    // If process exited, throw immediately
    if (!this.process) {
      throw new Error(
        'OpenClaw gateway failed to start — process exited before becoming healthy. ' +
        'Ensure openclaw is installed: npm install openclaw',
      );
    }

    throw new Error(
      `OpenClaw gateway did not become healthy within ${timeout}ms. ` +
      `Check that port ${this._port} is available.`,
    );
  }

  private async isHealthy(): Promise<boolean> {
    if (!this._port) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${this._port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private startHealthCheck(): void {
    this.healthTimer = setInterval(async () => {
      if (this.shuttingDown || !this.process) return;
      const healthy = await this.isHealthy();
      if (!healthy && this.process) {
        this.logger.warn('OpenClaw gateway health check failed');
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    if (this.healthTimer.unref) {
      this.healthTimer.unref();
    }
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
  }

  private handleCrash(): void {
    const maxRetries = this.bridgeConfig.maxRestartRetries ?? DEFAULT_MAX_RESTART_RETRIES;
    if (this.restartCount >= maxRetries) {
      this.logger.error(
        `OpenClaw gateway crashed ${this.restartCount} times — giving up. ` +
        'Restart the application to retry.',
      );
      return;
    }

    this.restartCount++;
    const delay = RESTART_BASE_DELAY_MS * Math.pow(2, this.restartCount - 1);
    this.logger.warn(
      `Restarting OpenClaw gateway in ${delay}ms (attempt ${this.restartCount}/${maxRetries})`,
    );

    setTimeout(async () => {
      if (this.shuttingDown) return;
      try {
        await this.spawnGateway();
        await this.waitForHealthy();
        this.logger.log(
          `OpenClaw gateway restarted (pid=${this.process?.pid})`,
        );
      } catch (err) {
        this.logger.error(
          'Failed to restart OpenClaw gateway',
          err instanceof Error ? err.message : String(err),
        );
      }
    }, delay);
  }

  private async killProcess(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;
    this.process = null;

    return new Promise<void>((resolve) => {
      const forceTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // already dead
        }
        resolve();
      }, SHUTDOWN_GRACE_MS);

      proc.once('exit', () => {
        clearTimeout(forceTimer);
        resolve();
      });

      try {
        proc.kill('SIGTERM');
      } catch {
        clearTimeout(forceTimer);
        resolve();
      }
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
