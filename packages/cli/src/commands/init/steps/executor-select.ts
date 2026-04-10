import { select } from '@inquirer/prompts';
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
