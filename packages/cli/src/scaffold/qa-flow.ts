import { select, input, confirm, checkbox } from '@inquirer/prompts';

export interface QaResult {
  name: string;
  category: 'type' | 'adapter';
  topicType?: string;
  hooks?: string[];
  sourceSystem?: string;
  authType?: 'oauth2' | 'api_key' | 'none';
  authScopes?: string[];
}

export async function runQaFlow(options?: { category?: string; name?: string; nonInteractive?: boolean }): Promise<QaResult> {
  const name = options?.name ?? await input({
    message: 'Skill name:',
    validate: (val) => /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/.test(val) || 'Use lowercase, hyphens, 3-64 chars',
  });

  const category = (options?.category as QaResult['category']) ?? await select({
    message: 'Category:',
    choices: [
      { value: 'type' as const, name: 'Topic Type — defines topic types with lifecycle hooks' },
      { value: 'adapter' as const, name: 'Adapter — external system connector' },
    ],
  });

  if (options?.nonInteractive) {
    return { name, category };
  }

  switch (category) {
    case 'type': {
      const topicType = await input({ message: 'Topic type name (e.g., bug-report):' });
      const hooks = await checkbox({
        message: 'Lifecycle hooks:',
        choices: [
          { value: 'created', checked: true },
          { value: 'updated', checked: true },
          { value: 'deleted' },
        ],
      });
      return { name, category, topicType, hooks };
    }
    case 'adapter': {
      const sourceSystem = await input({ message: 'External system (e.g., github, jira):' });
      const authType = await select({
        message: 'Authentication requirement:',
        choices: [
          { value: 'none' as const, name: 'None — public data only' },
          { value: 'oauth2' as const, name: 'OAuth2 — user login required' },
          { value: 'api_key' as const, name: 'API Key — token-based access' },
        ],
      });
      let authScopes: string[] = [];
      if (authType === 'oauth2') {
        const scopesStr = await input({ message: 'OAuth scopes (comma-separated):' });
        authScopes = scopesStr.split(',').map((s) => s.trim()).filter(Boolean);
      }
      return { name, category, sourceSystem, authType, authScopes };
    }
  }
}
