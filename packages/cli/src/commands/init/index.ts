import { loadConfigOrNull, saveConfig } from '../../config/config.js';
import type { LocalConfig } from '../../config/config.schema.js';
import { promptServerUrl } from './steps/server-url.js';
import { promptAdminToken } from './steps/admin-token.js';
import { promptTenantSelect } from './steps/tenant-select.js';
import { promptExecutorSelect } from './steps/executor-select.js';
import { promptSkillsDir } from './steps/skills-dir.js';

export async function handleInitCommand(): Promise<void> {
  console.log('\n  Topic Hub — Local Environment Setup\n');

  const existing = loadConfigOrNull();
  if (existing) {
    console.log('  Current configuration detected. Press Enter to keep values.\n');
  }

  try {
    // Step 1: Server URL
    console.log('  Step 1/5: Remote Server URL');
    const serverUrl = await promptServerUrl(existing?.serverUrl);

    // Step 2: Admin Token
    console.log('\n  Step 2/5: Admin Token');
    const token = await promptAdminToken(serverUrl);

    // Step 3: Tenant Selection
    console.log('\n  Step 3/5: Select Tenant');
    const tenantId = await promptTenantSelect(serverUrl, token, existing?.tenantId);

    // Step 4: Executor Selection
    console.log('\n  Step 4/5: AI Agent Executor');
    const executor = await promptExecutorSelect(existing?.executor);

    // Step 5: Skills Directory
    console.log('\n  Step 5/5: Skills Directory');
    const skillsDir = await promptSkillsDir(existing?.skillsDir);

    // Save
    const config: LocalConfig = { serverUrl, tenantId, executor, skillsDir };
    saveConfig(config);

    console.log('\n  ✓ Configuration saved to ~/.topichub/config.json\n');
  } catch (err) {
    if (err instanceof Error && err.message.includes('User force closed')) {
      console.log('\n  Init cancelled.\n');
      process.exit(0);
    }
    console.error(`\n  ✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
