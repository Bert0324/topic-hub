/**
 * Stable entry for embedding the gateway on a host-owned HTTP server (TopicHub, etc.).
 * Re-exports the same surface as `openclaw gateway run` without the CLI wrapper.
 */
export { startGatewayServer } from "./server.js";
export type { GatewayServer, GatewayServerOptions } from "./server.impl.js";
