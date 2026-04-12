import { select, input } from '@inquirer/prompts';
import { detectAgents, type DetectedAgent } from '../../../executors/detector.js';
import type { ExecutorType } from '../../../config/config.schema.js';

export async function promptExecutorSelect(
  currentValue?: ExecutorType,
): Promise<ExecutorType> {
  const agents = detectAgents();

  const choices: Array<{ name: string; value: ExecutorType }> = [];

  for (const agent of agents) {
    choices.push({
      name: `${agent.type} (${agent.command} v${agent.version} at ${agent.path})`,
      value: agent.type,
    });
  }

  choices.push({
    name: 'none (disable AI execution)',
    value: 'none',
  });

  if (agents.length === 0) {
    console.log(
      '  ⚠ No AI agents detected on PATH. Install Claude Code or Codex for agent execution.',
    );
  }

  const executor = await select({
    message: 'AI agent executor',
    choices,
    default: currentValue ?? (agents.length > 0 ? agents[0].type : 'none'),
  });

  console.log(`  ✓ Executor: ${executor}`);
  return executor;
}

export async function promptExecutorArgs(
  currentValue?: string[],
): Promise<string[] | undefined> {
  const currentDisplay = currentValue?.length ? currentValue.join(' ') : '';

  const raw = await input({
    message: 'Extra executor arguments (optional, e.g. --settings ~/.claude/llmbox.json)',
    default: currentDisplay,
  });

  const trimmed = raw.trim();
  if (!trimmed) {
    console.log('  ✓ Executor args: (none)');
    return undefined;
  }

  const parsed = parseShellArgs(trimmed);
  console.log(`  ✓ Executor args: ${parsed.join(' ')}`);
  return parsed;
}

function parseShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}
