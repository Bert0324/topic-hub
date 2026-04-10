import { loadConfigOrNull, saveConfig } from '../../config/config.js';
import type { LocalConfig } from '../../config/config.schema.js';
import { saveAdminToken } from '../../auth/auth.js';
import { promptServerUrl } from './steps/server-url.js';
import { promptAdminToken } from './steps/admin-token.js';
import { promptTenantSelect } from './steps/tenant-select.js';
import { promptExecutorSelect, promptExecutorArgs } from './steps/executor-select.js';
import { promptSkillsDir } from './steps/skills-dir.js';

export async function handleInitCommand(): Promise<void> {
  console.log('\n  Topic Hub — Local Environment Setup\n');

  const existing = loadConfigOrNull();
  if (existing) {
    console.log('  Current configuration detected. Press Enter to keep values.\n');
  }

  try {
    // Step 1: Server URL
    console.log('  Step 1/6: Remote Server URL');
    const serverUrl = await promptServerUrl(existing?.serverUrl);

    // Step 2: Admin Token
    console.log('\n  Step 2/6: Admin Token');
    const token = await promptAdminToken(serverUrl);

    // Step 3: Tenant Selection (may create a new tenant)
    console.log('\n  Step 3/6: Select Tenant');
    const { tenantId, newApiKey } = await promptTenantSelect(serverUrl, token, existing?.tenantId);

    // If a new tenant was created, save its apiKey as the auth token
    if (newApiKey) {
      await saveAdminToken(newApiKey);
    }

    // Step 4: Executor Selection
    console.log('\n  Step 4/6: AI Agent Executor');
    const executor = await promptExecutorSelect(existing?.executor);

    // Step 5: Executor Arguments
    let executorArgs: string[] | undefined;
    if (executor !== 'none') {
      console.log('\n  Step 5/6: Executor Arguments');
      executorArgs = await promptExecutorArgs(existing?.executorArgs);
    }

    // Step 6: Skills Directory
    console.log(`\n  Step ${executor !== 'none' ? '6/6' : '5/5'}: Skills Directory`);
    const skillsDir = await promptSkillsDir(existing?.skillsDir);

    // Save
    const config: LocalConfig = { serverUrl, tenantId, executor, executorArgs, skillsDir };
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
