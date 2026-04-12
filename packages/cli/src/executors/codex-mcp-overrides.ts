type McpServerConfig = {
  command?: unknown;
  args?: unknown;
};

type McpConfigFileShape = {
  mcpServers?: Record<string, McpServerConfig>;
};

/**
 * Codex CLI does not support `--mcp-config <file>`; it expects config overrides (`-c key=value`).
 * Convert our JSON MCP file shape into `mcp_servers.<name>.*` overrides.
 */
export function codexMcpConfigOverridesFromPath(configPath: string): string[] {
  const fs = require('fs') as typeof import('fs');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as McpConfigFileShape;
  const servers = parsed?.mcpServers ?? {};
  const overrides: string[] = [];

  for (const [name, cfg] of Object.entries(servers)) {
    if (!cfg || typeof cfg !== 'object') continue;
    if (typeof cfg.command === 'string' && cfg.command.trim()) {
      overrides.push(`mcp_servers.${name}.command=${JSON.stringify(cfg.command)}`);
    }
    if (Array.isArray(cfg.args) && cfg.args.every((v) => typeof v === 'string')) {
      overrides.push(`mcp_servers.${name}.args=${JSON.stringify(cfg.args)}`);
    }
  }

  return overrides;
}
