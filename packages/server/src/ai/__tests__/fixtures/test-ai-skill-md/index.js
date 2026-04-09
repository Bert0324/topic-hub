const { z } = require('zod');

const testSchema = z.object({
  description: z.string().optional(),
});

module.exports = {
  manifest: {
    name: 'test-ai-nl',
    topicType: 'test-ai-nl',
    version: '0.0.1',
    fieldSchema: testSchema,
    groupNamingTemplate: '[test-ai-nl] {title}',
    cardTemplate: {
      headerTemplate: 'Test AI NL: {title}',
      fields: [{ label: 'Description', value: '{description}', type: 'text' }],
      actions: [],
    },
    ai: true,
  },
  renderCard(topic) {
    return {
      title: `Test AI NL: ${topic.title}`,
      fields: [
        { label: 'Description', value: topic.metadata?.description ?? '', type: 'text' },
      ],
      status: topic.status,
    };
  },
  validateMetadata(metadata) {
    const result = testSchema.safeParse(metadata);
    if (result.success) return { valid: true };
    return {
      valid: false,
      errors: result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    };
  },
};
