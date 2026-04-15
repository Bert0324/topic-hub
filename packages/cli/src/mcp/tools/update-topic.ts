import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../../api-client/api-client.js';

export function registerUpdateTopic(server: McpServer, api: ApiClient): void {
  const schema = {
    topicId: z.string().describe('The topic ID to update'),
    status: z.string().optional().describe('New status'),
    metadata: z.record(z.unknown()).optional().describe('Metadata fields to merge'),
    tags: z.array(z.string()).optional().describe('Replace tags array'),
  };

  (server as any).tool(
    'update_topic',
    'Update fields on a topic',
    schema,
    async ({ topicId, ...updates }: { topicId: string; status?: string; metadata?: Record<string, unknown>; tags?: string[] }) => {
      try {
        const result = await api.nativeGateway('topics.patch', { id: topicId, patch: updates });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
