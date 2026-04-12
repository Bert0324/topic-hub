import * as fs from 'node:fs';
import {
  cleanupBridgeConfigFiles,
  generateBridgeConfigFiles,
  generateWebhookSecret,
} from '../src/bridge/bridge-config-generator';

describe('bridge discord mention policy', () => {
  it('does not require mention in configured guild channels', async () => {
    const guildId = '1492830688851005450';
    const generated = generateBridgeConfigFiles(
      {
        webhookUrl: 'http://127.0.0.1:3000/webhooks/openclaw',
        channels: {
          discord: {
            botToken: 'discord-token',
            guildId,
          },
        },
      },
      generateWebhookSecret(),
      56889,
    );

    try {
      const raw = fs.readFileSync(generated.configPath, 'utf8');
      const parsed = JSON.parse(raw) as {
        channels?: {
          discord?: {
            guilds?: Record<string, { requireMention?: boolean }>;
          };
        };
      };
      expect(parsed.channels?.discord?.guilds?.[guildId]?.requireMention).toBe(false);
    } finally {
      cleanupBridgeConfigFiles(generated.configDir);
    }
  });
});
