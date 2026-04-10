import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../../api-client/api-client.js';

export function registerAddTimelineEntry(server: McpServer, api: ApiClient): void {
  const schema = {
    topicId: z.string().describe('The topic ID'),
    actionType: z.string().describe('Entry type: COMMENT, METADATA_UPDATED, AI_RESPONSE'),
    payload: z.record(z.unknown()).describe('Entry payload'),
  };

  (server as any).tool(
    'add_timeline_entry',
    'Append an entry to a topic timeline',
    schema,
    async ({ topicId, actionType, payload }: { topicId: string; actionType: string; payload: Record<string, unknown> }) => {
      try {
        const result = await api.post(`/api/v1/topics/${topicId}/timeline`, {
          actionType,
          payload,
        });
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
