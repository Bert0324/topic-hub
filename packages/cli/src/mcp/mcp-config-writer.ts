import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface McpConfigOptions {
  serverUrl: string;
  token: string;
  allowedTools?: string[];
}

/**
 * Write a temporary MCP config JSON file that tells the agent how to connect
 * to the topichub MCP server. Returns the path to the temp file.
 */
export function writeMcpConfig(options: McpConfigOptions): string {
  const cliEntryPath = path.resolve(
    __dirname,
    'mcp-server.js',
  );

  const config = {
    mcpServers: {
      topichub: {
        command: 'node',
        args: [
          cliEntryPath,
          '--server-url', options.serverUrl,
          '--token', options.token,
          ...(options.allowedTools
            ? ['--allowed-tools', options.allowedTools.join(',')]
            : []),
        ],
      },
    },
  };

  const tmpDir = path.join(os.tmpdir(), 'topichub-mcp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const configPath = path.join(tmpDir, `mcp-config-${process.pid}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  return configPath;
}

export function cleanupMcpConfig(configPath: string): void {
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  } catch {
    // Best-effort cleanup
  }
}
