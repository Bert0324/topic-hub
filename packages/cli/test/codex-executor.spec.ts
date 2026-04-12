/// <reference types="jest" />

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { codexMcpConfigOverridesFromPath } from '../src/executors/codex-mcp-overrides';
import { codexSpawnBaseOptions, parseCodexJsonlOutput } from '../src/executors/codex.executor';

describe('codexMcpConfigOverridesFromPath', () => {
  it('converts mcpServers JSON into codex -c overrides', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-mcp-test-'));
    const configPath = path.join(dir, 'mcp-config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          topichub: {
            command: 'node',
            args: ['mcp-server.js', '--server-url', 'http://localhost:3000'],
          },
        },
      }),
    );

    const overrides = codexMcpConfigOverridesFromPath(configPath);
    expect(overrides).toEqual([
      'mcp_servers.topichub.command="node"',
      'mcp_servers.topichub.args=["mcp-server.js","--server-url","http://localhost:3000"]',
    ]);
  });
});

describe('CodexExecutor', () => {
  it('uses ignored stdin so headless codex exec can terminate', () => {
    const opts = codexSpawnBaseOptions();
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'pipe']);
  });

  it('parses dot-style codex jsonl events into final assistant text', () => {
    const stdout = [
      '{"type":"thread.started","thread_id":"tid"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hey! 👋"}}',
      '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":20}}',
    ].join('\n');

    const parsed = parseCodexJsonlOutput(stdout);
    expect(parsed.text).toBe('Hey! 👋');
    expect(parsed.tokenUsage).toEqual({ input: 10, output: 20 });
  });
});
