import { SkillCategory } from '../common/enums';
import type { ParsedCommand } from './command-parser';
import type { DispatchMeta } from '../services/dispatch.service';

export interface CommandContext {
  platform: string;
  groupId: string;
  userId: string;
  hasActiveTopic: boolean;
  dispatchMeta?: DispatchMeta;
}

export interface RouteResult {
  handler: string;
  error?: string;
}

export interface SkillRegistryPort {
  getTypeSkillForType(topicType: string): any | undefined;
  getByCategory(category: SkillCategory): Array<{ skill: any; registration: any }>;
}

const GLOBAL_COMMANDS = ['create', 'search', 'help'];
const TOPIC_COMMANDS = [
  'update',
  'assign',
  'show',
  'timeline',
  'reopen',
  'history',
];

export class CommandRouter {
  constructor(private readonly skillRegistry: SkillRegistryPort) {}

  route(parsed: ParsedCommand, context: CommandContext): RouteResult {
    const { action } = parsed;

    if (GLOBAL_COMMANDS.includes(action)) {
      return this.routeGlobal(parsed, context);
    }

    if (TOPIC_COMMANDS.includes(action)) {
      return this.routeTopicCommand(parsed, context);
    }

    return { handler: action, error: `Unknown command: ${action}. Use /topichub help to see available commands.` };
  }

  private routeGlobal(parsed: ParsedCommand, context: CommandContext): RouteResult {
    const { action } = parsed;

    if (action === 'create') {
      if (context.hasActiveTopic) {
        return {
          handler: 'create',
          error: 'An active topic already exists in this group. Close or resolve it before creating a new one.',
        };
      }

      if (parsed.type) {
        const typeSkill = this.skillRegistry.getTypeSkillForType(parsed.type);
        if (!typeSkill) {
          const available = this.skillRegistry
            .getByCategory(SkillCategory.TYPE)
            .map((s) => (s.registration.metadata as any)?.topicType)
            .filter(Boolean);
          return {
            handler: 'create',
            error: `Unknown topic type: ${parsed.type}. Available types: ${available.join(', ') || 'none'}`,
          };
        }
      }
    }

    return { handler: action };
  }

  private routeTopicCommand(parsed: ParsedCommand, context: CommandContext): RouteResult {
    if (!context.hasActiveTopic) {
      return {
        handler: parsed.action,
        error: 'No active topic in this group. Create one first with /topichub create <type>.',
      };
    }

    return { handler: parsed.action };
  }
}
