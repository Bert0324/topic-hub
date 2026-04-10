import { execFileSync } from 'child_process';
import { existsSync } from 'fs';

export interface DetectedAgent {
  type: 'claude-code' | 'codex';
  command: string;
  version: string;
  path: string;
}

function which(cmd: string): string | null {
  try {
    return execFileSync('which', [cmd], { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function getVersion(cmd: string, flag = '--version'): string {
  try {
    const output = execFileSync(cmd, [flag], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const match = output.match(/[\d]+\.[\d]+\.[\d]+/);
    return match ? match[0] : output.split('\n')[0];
  } catch {
    return 'unknown';
  }
}

export function detectAgents(): DetectedAgent[] {
  const agents: DetectedAgent[] = [];

  const claudePath = which('claude');
  if (claudePath) {
    agents.push({
      type: 'claude-code',
      command: 'claude',
      version: getVersion('claude', '--version'),
      path: claudePath,
    });
  }

  const codexPath = which('codex');
  if (codexPath) {
    agents.push({
      type: 'codex',
      command: 'codex',
      version: getVersion('codex', '--version'),
      path: codexPath,
    });
  }

  return agents;
}

export function isAgentAvailable(type: 'claude-code' | 'codex'): boolean {
  const cmd = type === 'claude-code' ? 'claude' : 'codex';
  return which(cmd) !== null;
}
