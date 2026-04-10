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
    channels.discord = {
      enabled: true,
      dmPolicy: 'open',
      allowFrom: ['*'],
      groupPolicy: 'open',
      botToken: d.botToken,
      ...(d.applicationId ? { applicationId: d.applicationId } : {}),
    };
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
    agents: {
      defaults: {
        model: { primary: 'none' },
        skills: [],
      },
    },
    channels,
    hooks: {
      enabled: true,
      token: webhookSecret,
      path: '/hooks',
      mappings: [
        {
          match: { path: 'message-relay' },
          action: 'webhook',
          webhook: {
            url: bridgeConfig.webhookUrl,
            secret: webhookSecret,
            events: ['message.received'],
          },
        },
      ],
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
  const configPath = path.join(configDir, 'openclaw.json');

  const content = buildOpenClawJson(bridgeConfig, webhookSecret, port);
  fs.writeFileSync(configPath, content, 'utf-8');

  return { configPath, configDir, webhookSecret, gatewayPort: port };
}

export function cleanupBridgeConfigFiles(configDir: string): void {
  try {
    fs.rmSync(configDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}
