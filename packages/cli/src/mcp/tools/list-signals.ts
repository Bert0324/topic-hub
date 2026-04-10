import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../../api-client/api-client.js';

export function registerListSignals(server: McpServer, api: ApiClient): void {
  const schema = {
    topicId: z.string().describe('The topic ID'),
  };

  (server as any).tool(
    'list_signals',
    'List signals attached to a topic',
    schema,
    async ({ topicId }: { topicId: string }) => {
      try {
        const topic = await api.get<{ signals: any[] }>(`/api/v1/topics/${topicId}`);
        const signals = topic.signals ?? [];
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(signals, null, 2) }],
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
