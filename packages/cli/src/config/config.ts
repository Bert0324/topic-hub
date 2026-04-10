import * as fs from 'fs';
import * as path from 'path';
import { LocalConfigSchema, type LocalConfig } from './config.schema.js';

const CONFIG_DIR = path.join(process.env.HOME ?? '~', '.topichub');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): LocalConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(
      'Configuration not found. Run `topichub-admin init` first to configure your environment.',
    );
  }

  const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid configuration file at ${CONFIG_FILE}. Run \`topichub-admin init\` to reconfigure.`,
    );
  }

  const result = LocalConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(
      `Configuration is incomplete or invalid:\n${issues}\nRun \`topichub-admin init\` to fix.`,
    );
  }

  return result.data;
}

export function loadConfigOrNull(): LocalConfig | null {
  try {
    return loadConfig();
  } catch {
    return null;
  }
}

export function saveConfig(config: LocalConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  const tmpFile = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2) + '\n', {
    mode: 0o600,
  });
  fs.renameSync(tmpFile, CONFIG_FILE);
}

export function requireConfig(): LocalConfig {
  return loadConfig();
}
