import type { QaResult } from '../qa-flow.js';

export function generateAdapterSkill(qa: QaResult): Record<string, string> {
  const sourceSystem = qa.sourceSystem || qa.name;
  const authType = qa.authType ?? 'none';
  const authScopes = qa.authScopes ?? [];

  const auth: Record<string, unknown> = { type: authType };
  if (authType === 'oauth2' && authScopes.length) {
    auth.scopes = authScopes;
  }

  const packageJson = JSON.stringify(
    {
      name: qa.name,
      version: '0.1.0',
      main: 'src/index.ts',
      topichub: {
        category: 'adapter',
        sourceSystem,
        auth,
      },
    },
    null,
    2,
  );

  const stubMethods: string[] = [
    `  async transformWebhook(payload: Record<string, unknown>): Promise<{ event: string; data: unknown }> {\n    // TODO: transform ${sourceSystem} webhook into Topic Hub event\n    return { event: 'unknown', data: payload };\n  }`,
  ];

  if (authType !== 'none') {
    stubMethods.push(
      `  async runSetup(tenantId: string): Promise<void> {\n    // TODO: configure ${authType} credentials for ${sourceSystem}\n  }`,
    );
  }

  const srcIndex = `export default {
  sourceSystem: '${sourceSystem}',

${stubMethods.join(',\n\n')},
};
`;

  const skillMd = `---
executor: cursor
maxTurns: 4
allowedTools:
  - search-topics
  - update-topic
---

# ${qa.name}

Adapter skill for **${sourceSystem}**.

## Behaviour

Receives webhooks from ${sourceSystem}, transforms them into Topic Hub events,
and routes them to the appropriate topic.
`;

  const readme = `# ${qa.name}

A Topic Hub **adapter** skill for **${sourceSystem}**.

## Auth

- Type: \`${authType}\`${authType === 'oauth2' && authScopes.length ? `\n- Scopes: ${authScopes.map((s) => `\`${s}\``).join(', ')}` : ''}
`;

  return {
    'package.json': packageJson,
    'src/index.ts': srcIndex,
    'SKILL.md': skillMd,
    'README.md': readme,
  };
}
