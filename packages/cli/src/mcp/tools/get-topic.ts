import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../../api-client/api-client.js';

export function registerGetTopic(server: McpServer, api: ApiClient): void {
  const schema = { topicId: z.string().describe('The topic ID to retrieve') };

  (server as any).tool(
    'get_topic',
    'Retrieve full details of a topic',
    schema,
    async ({ topicId }: { topicId: string }) => {
      try {
        const topic = await api.get(`/api/v1/topics/${topicId}`);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(topic, null, 2) }],
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
