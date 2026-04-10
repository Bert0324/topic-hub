import type { QaResult } from '../qa-flow.js';

export function generateTopicSkill(qa: QaResult): Record<string, string> {
  const hooks = qa.hooks?.length ? qa.hooks : ['created', 'updated'];
  const topicType = qa.topicType || qa.name;

  const packageJson = JSON.stringify(
    {
      name: qa.name,
      version: '0.1.0',
      main: 'src/index.ts',
      topichub: {
        category: 'type',
        topicType,
        hooks,
      },
    },
    null,
    2,
  );

  const hookMethods = hooks
    .map((h) => {
      const methodName = `onTopic${h.charAt(0).toUpperCase()}${h.slice(1)}`;
      return `  async ${methodName}(topic: { id: string; type: string; data: Record<string, unknown> }): Promise<void> {\n    // TODO: implement ${h} hook\n  }`;
    })
    .join(',\n\n');

  const srcIndex = `import type { TypeSkill } from './type-skill.js';

export default {
  topicType: '${topicType}',

${hookMethods},
} satisfies TypeSkill;
`;

  const typeSkillInterface = `export interface TypeSkill {
  topicType: string;
${hooks.map((h) => `  onTopic${h.charAt(0).toUpperCase()}${h.slice(1)}(topic: { id: string; type: string; data: Record<string, unknown> }): Promise<void>;`).join('\n')}
}
`;

  const skillMd = `---
executor: cursor
maxTurns: 6
allowedTools:
  - search-topics
  - update-topic
  - add-timeline-entry
---

# ${qa.name}

Topic type skill for **${topicType}** topics.

## Behaviour

When a ${topicType} topic is ${hooks.join(' or ')}, this skill processes it
and performs the appropriate actions.
`;

  const readme = `# ${qa.name}

A Topic Hub **type** skill that handles **${topicType}** topics.

## Hooks

${hooks.map((h) => `- \`${h}\``).join('\n')}
`;

  return {
    'package.json': packageJson,
    'src/index.ts': srcIndex,
    'src/type-skill.ts': typeSkillInterface,
    'SKILL.md': skillMd,
    'README.md': readme,
  };
}
