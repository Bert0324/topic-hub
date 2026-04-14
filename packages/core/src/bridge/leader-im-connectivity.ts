import { TopicHubError } from '../common/errors';
import type { BridgeConfig, LeaderImConnectivityPlatform } from './openclaw-types';
import { assertFeishuBridgeReachable } from './feishu-bridge-connectivity';

const DEFAULT_TIMEOUT_MS = 12_000;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function assertDiscordBotReachable(botToken: string, timeoutMs: number): Promise<void> {
  await withTimeout(async (signal) => {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${botToken}` },
      signal,
    });
    const text = await res.text();
    let body: { id?: string; message?: string };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      throw new Error(`Discord non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(body.message ?? `Discord HTTP ${res.status}`);
    }
    if (!body.id) {
      throw new Error('Discord @me response missing id');
    }
  }, timeoutMs);
}

async function assertTelegramBotReachable(botToken: string, timeoutMs: number): Promise<void> {
  await withTimeout(async (signal) => {
    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/getMe`;
    const res = await fetch(url, { signal });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      throw new Error(data.description ?? 'Telegram getMe failed');
    }
  }, timeoutMs);
}

async function assertSlackBotReachable(botToken: string, timeoutMs: number): Promise<void> {
  await withTimeout(async (signal) => {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: '{}',
      signal,
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!data.ok) {
      throw new Error(data.error ?? 'Slack auth.test failed');
    }
  }, timeoutMs);
}

/**
 * Before holding the embedded OpenClaw **lease leader**, optionally verify IM APIs succeed.
 * - `undefined` or `[]`: skip (no checks).
 * - Non-empty: every listed platform must pass; missing channel config throws {@link TopicHubError}.
 */
export async function assertLeaderImConnectivityChecks(
  checks: LeaderImConnectivityPlatform[] | undefined,
  channels: BridgeConfig['channels'],
  opts?: { timeoutMs?: number },
): Promise<void> {
  if (!checks?.length) return;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const unique = [...new Set(checks)];

  for (const platform of unique) {
    switch (platform) {
      case 'feishu': {
        const f = channels.feishu;
        if (!f) {
          throw new TopicHubError(
            'leaderImConnectivityChecks includes "feishu" but bridge.channels.feishu is not configured',
          );
        }
        await assertFeishuBridgeReachable(
          { appId: f.appId, appSecret: f.appSecret, domain: f.domain },
          { timeoutMs },
        );
        break;
      }
      case 'discord': {
        const d = channels.discord;
        if (!d) {
          throw new TopicHubError(
            'leaderImConnectivityChecks includes "discord" but bridge.channels.discord is not configured',
          );
        }
        await assertDiscordBotReachable(d.botToken, timeoutMs);
        break;
      }
      case 'telegram': {
        const t = channels.telegram;
        if (!t) {
          throw new TopicHubError(
            'leaderImConnectivityChecks includes "telegram" but bridge.channels.telegram is not configured',
          );
        }
        await assertTelegramBotReachable(t.botToken, timeoutMs);
        break;
      }
      case 'slack': {
        const s = channels.slack;
        if (!s) {
          throw new TopicHubError(
            'leaderImConnectivityChecks includes "slack" but bridge.channels.slack is not configured',
          );
        }
        await assertSlackBotReachable(s.botToken, timeoutMs);
        break;
      }
      default: {
        const _exhaustive: never = platform;
        throw new TopicHubError(`Unsupported leaderImConnectivityChecks entry: ${String(_exhaustive)}`);
      }
    }
  }
}
