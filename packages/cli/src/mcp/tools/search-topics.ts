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
        const queryParts: string[] = [];
        if (params.query) queryParts.push(`q=${encodeURIComponent(params.query)}`);
        if (params.type) queryParts.push(`type=${encodeURIComponent(params.type)}`);
        if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
        if (params.tags) queryParts.push(`tags=${params.tags.map(encodeURIComponent).join(',')}`);
        if (params.limit) queryParts.push(`limit=${params.limit}`);

        const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
        const results = await api.get(`/api/v1/search/topics${qs}`);
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
