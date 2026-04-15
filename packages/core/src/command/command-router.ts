import type { ParsedCommand } from './command-parser';
import type { DispatchMeta } from '../services/dispatch.service';

export type PublishedSkillRoutingPayload =
  | { status: 'hit'; name: string }
  | { status: 'miss'; token: string };

export interface CommandContext {
  platform: string;
  groupId: string;
  userId: string;
  hasActiveTopic: boolean;
  dispatchMeta?: DispatchMeta;
  /** Original user text (for freeform relay). */
  relayText?: string;
  /**
   * Normalized IM line (mentions stripped) used for routing; prefer when forwarding to the executor
   * so lines like `@Topic Hub /home/...` keep the `/home/...` segment.
   */
  imChatLine?: string;
  /** True when the normalized inbound line starts with `/` (explicit slash-command). */
  imCommandUsedSlash?: boolean;
  /** Set by router when routing `/RegisteredSkillName` to {@link SkillInvokeHandler}. */
  skillInvocationName?: string;
  /**
   * When the IM line used optional prefix `/agent #N …`, Hub forces this roster slot on the inner relay
   * or slash invoke (overrides inner `#M` / default).
   */
  imTargetAgentSlot?: number;
  /** Relay hint: how the first slash token matched the Skill Center catalog (see IM dispatch contract). */
  publishedSkillRouting?: PublishedSkillRoutingPayload;
}

export interface RouteResult {
  handler: string;
  error?: string;
  /** Canonical skill name for `skill_invoke` handler. */
  skillInvocationName?: string;
  /**
   * When relaying a slash line in a topic, first token that did not resolve to a skill after
   * built-in routing (used to populate `publishedSkillRouting` miss in the webhook).
   */
  publishedSkillMissToken?: string;
}

const GLOBAL_COMMANDS = ['create', 'search', 'help', 'use', 'skills', 'agent'];
const TOPIC_COMMANDS = [
  'update',
  'assign',
  'show',
  'timeline',
  'reopen',
  'history',
];

export class CommandRouter {
  constructor(
    private readonly matchSkillCommandToken: (token: string) => string | undefined = () => undefined,
  ) {}

  route(parsed: ParsedCommand, context: CommandContext): RouteResult {
    const { action } = parsed;

    if (GLOBAL_COMMANDS.includes(action)) {
      return this.routeGlobal(parsed, context);
    }

    if (TOPIC_COMMANDS.includes(action)) {
      return this.routeTopicCommand(parsed, context);
    }

    // `/SkillName …` where SkillName is a registered skill (not a built-in command)
    if (context.imCommandUsedSlash && context.hasActiveTopic) {
      const skillName = this.matchSkillCommandToken(action);
      if (skillName) {
        return { handler: 'skill_invoke', skillInvocationName: skillName };
      }
      // Any other `/…` line (e.g. `/home/...` natural language) → same as freeform relay to the bound executor.
      return { handler: 'relay', publishedSkillMissToken: action };
    }

    // Freeform text in a topic group → local executor (not a slash-command)
    if (!context.imCommandUsedSlash) {
      if (context.hasActiveTopic) {
        return { handler: 'relay' };
      }
      return {
        handler: 'relay',
        error: 'No active topic in this group. Create one first with /create <type>.',
      };
    }

    // Slash command in a group without an active topic (and not handled above)
    return { handler: action, error: `Unknown command: ${action}. Use /help to see available commands.` };
  }

  private routeGlobal(parsed: ParsedCommand, context: CommandContext): RouteResult {
    if (parsed.action === 'agent') {
      if (!context.hasActiveTopic) {
        return {
          handler: 'agent',
          error: 'No active topic in this group. Create one first with /create <type>.',
        };
      }
      const sub = parsed.type?.toLowerCase();
      if (!sub || !['list', 'create', 'delete'].includes(sub)) {
        return {
          handler: 'agent',
          error: 'Usage: `/agent list`, `/agent create`, or `/agent delete #N`.',
        };
      }
      return { handler: 'agent' };
    }

    if (parsed.action === 'create' && context.hasActiveTopic) {
      return {
        handler: 'create',
        error: 'An active topic already exists in this group. Close or resolve it before creating a new one.',
      };
    }

    if (parsed.action === 'use') {
      const name = parsed.type;
      if (!name) {
        return { handler: 'use', error: 'Usage: /use <skill-name> [args]' };
      }
      if (!context.hasActiveTopic) {
        return {
          handler: 'use',
          error: 'No active topic in this group. Create one first with /create <type>.',
        };
      }
      const canonical = this.matchSkillCommandToken(name);
      if (!canonical) {
        return { handler: 'use', error: `Unknown skill "${name}".` };
      }
      return { handler: 'skill_invoke', skillInvocationName: canonical };
    }

    if (parsed.action === 'skills') {
      const sub = parsed.type?.toLowerCase();
      if (sub !== 'list' && sub !== 'star') {
        return {
          handler: 'skills',
          error:
            'Usage: `/skills list` [--page N] [--limit N] [--sort popular|recent|usage] · `/skills star <skill-name>`',
        };
      }
      return { handler: 'skills' };
    }

    return { handler: parsed.action };
  }

  private routeTopicCommand(parsed: ParsedCommand, context: CommandContext): RouteResult {
    if (!context.hasActiveTopic) {
      return {
        handler: parsed.action,
        error: 'No active topic in this group. Create one first with /create <type>.',
      };
    }

    return { handler: parsed.action };
  }
}
