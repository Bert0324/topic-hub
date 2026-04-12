import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../../api-client/api-client.js';

export function registerSearchTopics(server: McpServer, api: ApiClient): void {
  const schema = {
    query: z.string().optional().describe('Free-text search query'),
    type: z.string().optional().describe('Filter by topic type'),
    status: z.string().optional().describe('Filter by status'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
    limit: z.number().optional().describe('Max results (default: 10, max: 50)'),
  };

  (server as any).tool(
    'search_topics',
    'Search for topics matching criteria',
    schema,
    async (params: { query?: string; type?: string; status?: string; tags?: string[]; limit?: number }) => {
      try {
        const results = await api.nativeGateway('topics.search', {
          q: params.query,
          type: params.type,
          status: params.status,
          tags: params.tags,
          page: 1,
          pageSize: params.limit ?? 10,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
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
