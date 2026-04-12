import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ApiClient } from '../api-client/api-client.js';
import { registerGetTopic } from './tools/get-topic.js';
import { registerSearchTopics } from './tools/search-topics.js';
import { registerUpdateTopic } from './tools/update-topic.js';
import { registerAddTimelineEntry } from './tools/add-timeline-entry.js';
import { registerListSignals } from './tools/list-signals.js';

export interface McpServerOptions {
  serverUrl: string;
  token: string;
  allowedTools?: string[];
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const api = new ApiClient(options.serverUrl);
  api.setToken(options.token);

  const server = new McpServer({
    name: 'topichub',
    version: '1.0.0',
  });

  const allowed = options.allowedTools
    ? new Set(options.allowedTools)
    : null;

  const shouldRegister = (toolName: string) =>
    !allowed || allowed.has(`mcp__topichub__${toolName}`) || allowed.has(toolName);

  if (shouldRegister('get_topic')) registerGetTopic(server, api);
  if (shouldRegister('search_topics')) registerSearchTopics(server, api);
  if (shouldRegister('update_topic')) registerUpdateTopic(server, api);
  if (shouldRegister('add_timeline_entry')) registerAddTimelineEntry(server, api);
  if (shouldRegister('list_signals')) registerListSignals(server, api);

  return server;
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
