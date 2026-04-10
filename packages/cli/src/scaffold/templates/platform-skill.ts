import type { QaResult } from '../qa-flow.js';

export function generatePlatformSkill(qa: QaResult): Record<string, string> {
  const capabilities = qa.capabilities?.length ? qa.capabilities : ['push', 'commands'];
  const platform = qa.platform || qa.name;

  const packageJson = JSON.stringify(
    {
      name: qa.name,
      version: '0.1.0',
      main: 'src/index.ts',
      topichub: {
        category: 'platform',
        platform,
        capabilities,
      },
    },
    null,
    2,
  );

  const stubMethods: string[] = [];
  if (capabilities.includes('push')) {
    stubMethods.push(
      `  async postCard(groupId: string, card: Record<string, unknown>): Promise<void> {\n    // TODO: send card message to ${platform}\n  }`,
    );
  }
  if (capabilities.includes('commands')) {
    stubMethods.push(
      `  async handleWebhook(payload: Record<string, unknown>): Promise<{ action: string; data: unknown }> {\n    // TODO: parse incoming ${platform} webhook\n    return { action: 'noop', data: null };\n  }`,
    );
  }
  if (capabilities.includes('group_management')) {
    stubMethods.push(
      `  async createGroup(name: string, memberIds: string[]): Promise<{ groupId: string }> {\n    // TODO: create ${platform} group\n    return { groupId: '' };\n  }`,
    );
  }

  const srcIndex = `export default {
  platform: '${platform}',

${stubMethods.join(',\n\n')},
};
`;

  const skillMd = `---
executor: cursor
maxTurns: 4
allowedTools:
  - search-topics
  - get-topic
---

# ${qa.name}

Platform skill for **${platform}** integration.

## Behaviour

Handles incoming webhooks from ${platform} and can send card messages
to ${platform} groups linked to topics.
`;

  const readme = `# ${qa.name}

A Topic Hub **platform** skill for **${platform}**.

## Capabilities

${capabilities.map((c) => `- \`${c}\``).join('\n')}
`;

  return {
    'package.json': packageJson,
    'src/index.ts': srcIndex,
    'SKILL.md': skillMd,
    'README.md': readme,
  };
}
