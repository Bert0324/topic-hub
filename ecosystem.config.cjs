/**
 * PM2: N independent forks (`topic-hub-0` … `topic-hub-(N-1)`), ports `TOPICHUB_BASE_PORT` … `+N-1`.
 *
 * Env (optional, set before `pm2 start ecosystem.config.cjs`):
 *   TOPICHUB_PM2_INSTANCES — instance count (default 2, max 256)
 *   TOPICHUB_BASE_PORT     — first HTTP port (default 3000); used as embedded-gateway base for followers
 *
 * Each app gets `TOPICHUB_EMBEDDED_LEADER_PORT` = base port; `start-remote.sh` sets
 * `TOPICHUB_PUBLIC_GATEWAY_BASE_URL` when `PORT !== TOPICHUB_EMBEDDED_LEADER_PORT`.
 *
 * If the Mongo lease leader is not on the base port, set `TOPICHUB_PUBLIC_GATEWAY_BASE_URL`
 * yourself (e.g. load balancer URL) in env or `.env.local`.
 */

const basePort = (() => {
  const n = Number.parseInt(process.env.TOPICHUB_BASE_PORT ?? '3000', 10);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : 3000;
})();

const instanceCount = (() => {
  const n = Number.parseInt(process.env.TOPICHUB_PM2_INSTANCES ?? '2', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 256);
})();

const maxPort = basePort + instanceCount - 1;
if (maxPort > 65535) {
  throw new Error(
    `ecosystem: TOPICHUB_BASE_PORT (${basePort}) + TOPICHUB_PM2_INSTANCES (${instanceCount}) exceeds 65535`,
  );
}

const apps = [];
for (let i = 0; i < instanceCount; i++) {
  apps.push({
    name: `topic-hub-${i}`,
    cwd: __dirname,
    script: 'start-remote.sh',
    interpreter: 'bash',
    autorestart: true,
    env: {
      PORT: String(basePort + i),
      TOPICHUB_EMBEDDED_LEADER_PORT: String(basePort),
    },
  });
}

module.exports = { apps };
