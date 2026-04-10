import * as crypto from 'node:crypto';
import type {
  PlatformSkill,
  PlatformSkillManifest,
  PostCardParams,
  SetupContext,
  CardData,
  CardField,
  CardAction,
} from '@topichub/core';

interface LarkConfig {
  webhookUrl: string;
  secret?: string;
}

const configStore = new Map<string, LarkConfig>();

function computeSignature(
  secret: string,
  timestampSec: number,
): string {
  const stringToSign = `${timestampSec}\n${secret}`;
  return crypto
    .createHmac('sha256', stringToSign)
    .update(Buffer.alloc(0))
    .digest('base64');
}

async function postToLark(
  config: LarkConfig,
  body: Record<string, unknown>,
): Promise<void> {
  const payload = { ...body };

  if (config.secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    payload.timestamp = String(timestamp);
    payload.sign = computeSignature(config.secret, timestamp);
  }

  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Lark webhook failed: ${res.status} ${res.statusText}`);
  }

  const result = (await res.json()) as { code: number; msg: string };
  if (result.code !== 0) {
    throw new Error(`Lark API error ${result.code}: ${result.msg}`);
  }
}

function cardDataToLarkInteractive(card: CardData): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [];

  const fieldLines = card.fields
    .map((f: CardField) => `**${f.label}**: ${f.value}`)
    .join('\n');

  if (fieldLines) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: fieldLines },
    });
  }

  if (card.actions?.length) {
    elements.push({
      tag: 'action',
      actions: card.actions.map((a: CardAction) => ({
        tag: 'button',
        text: { tag: 'plain_text', content: a.label },
        type: 'primary',
        behaviors: [
          {
            type: 'open_url',
            default_url: a.command.startsWith('http')
              ? a.command
              : `#${a.command}`,
          },
        ],
      })),
    });
  }

  return {
    msg_type: 'interactive',
    card: {
      schema: '2.0',
      header: {
        title: { tag: 'plain_text', content: card.title },
        subtitle: { tag: 'plain_text', content: card.status },
        template: statusToColor(card.status),
      },
      body: {
        direction: 'vertical',
        elements,
      },
    },
  };
}

function statusToColor(status: string): string {
  const map: Record<string, string> = {
    open: 'blue',
    in_progress: 'wathet',
    resolved: 'green',
    closed: 'grey',
    blocked: 'red',
  };
  return map[status.toLowerCase()] ?? 'turquoise';
}

export const larkBotSkill: PlatformSkill = {
  manifest: {
    name: 'lark-bot',
    platform: 'lark',
    version: '1.0.0',
    capabilities: ['push'],
  } satisfies PlatformSkillManifest,

  async postCard(params: PostCardParams): Promise<void> {
    const config = configStore.get(params.tenantId);
    if (!config) {
      throw new Error(
        `Lark bot not configured for tenant ${params.tenantId}. Run "topichub init" to set up.`,
      );
    }

    const body = cardDataToLarkInteractive(params.card);
    await postToLark(config, body);
  },

  async sendMessage(params: {
    tenantId: string;
    groupId: string;
    message: string;
  }): Promise<void> {
    const config = configStore.get(params.tenantId);
    if (!config) {
      throw new Error(
        `Lark bot not configured for tenant ${params.tenantId}. Run "topichub init" to set up.`,
      );
    }

    await postToLark(config, {
      msg_type: 'text',
      content: { text: params.message },
    });
  },

  async runSetup(ctx: SetupContext): Promise<void> {
    ctx.log(
      '=== Lark Custom Bot Setup ===\n' +
        'Add a custom bot to your Lark group chat and copy the webhook URL.\n' +
        'See: https://open.larkoffice.com/document/client-docs/bot-v3/add-custom-bot',
    );

    const webhookUrl = await ctx.prompt(
      'Paste the webhook URL (https://open.feishu.cn/open-apis/bot/v2/hook/...):',
    );

    if (
      !webhookUrl.startsWith('https://open.feishu.cn/open-apis/bot/v2/hook/') &&
      !webhookUrl.startsWith('https://open.larksuite.com/open-apis/bot/v2/hook/')
    ) {
      throw new Error(
        'Invalid webhook URL. Expected format: https://open.feishu.cn/open-apis/bot/v2/hook/<token>',
      );
    }

    const secret = await ctx.prompt(
      'Signing secret (leave empty to skip signature verification):',
      { mask: true },
    );

    await ctx.storeSecret(`lark_webhook_url`, webhookUrl);
    if (secret) {
      await ctx.storeSecret(`lark_signing_secret`, secret);
    }

    configStore.set(ctx.tenantId, {
      webhookUrl,
      secret: secret || undefined,
    });

    ctx.log('Lark custom bot configured successfully. Sending test message...');

    try {
      await postToLark(
        { webhookUrl, secret: secret || undefined },
        { msg_type: 'text', content: { text: 'TopicHub connected!' } },
      );
      ctx.log('Test message sent successfully.');
    } catch (err) {
      ctx.log(
        `Warning: test message failed — ${err instanceof Error ? err.message : err}. Check your webhook URL and security settings.`,
      );
    }
  },
};

export default larkBotSkill;
