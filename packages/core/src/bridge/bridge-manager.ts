import { chmodSync, cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { TopicHubLogger } from '../common/logger';
import type { TopicHubBridgeConfig } from './openclaw-types';
import { toBridgeFileConfig } from './openclaw-types';
import {
  generateBridgeConfigFiles,
  cleanupBridgeConfigFiles,
  generateWebhookSecret,
  type GeneratedBridgeConfig,
} from './bridge-config-generator';
import { loadOpenclawGatewayEmbed } from './openclaw-embed-loader';

export const TOPICHUB_WEBHOOK_HMAC_ENV = 'TOPICHUB_WEBHOOK_HMAC_SECRET';

/** IM channel sources synced by `sync-bridge-vendor.mjs` (not the sparse `dist/extensions` vendor slice). */
function resolveVendoredBundledPluginsDir(): string {
  return resolve(__dirname, '..', '..', 'vendor', 'bridge', 'extensions');
}

/**
 * FaaS containers may extract npm tarballs with a permissive umask (0000), creating
 * world-writable directories (0o777). OpenClaw blocks world-writable plugin candidates.
 *
 * When files are root-owned and the process runs as a non-root user, `chmodSync` fails
 * with EPERM. In that case we copy the entire extensions tree to a process-owned temp
 * directory where we *can* fix permissions.
 *
 * Returns `{ dir, log }`: `dir` is the usable extensions directory (original or copy).
 */
function ensureSafeBundledPluginsDir(
  originalDir: string,
  pluginDirNames: string[],
): { dir: string; log: string; tempDir?: string } {
  if (!needsPermissionRepair(originalDir, pluginDirNames)) {
    return { dir: originalDir, log: 'permissions OK' };
  }

  if (tryChmodRepairInPlace(originalDir, pluginDirNames)) {
    return { dir: originalDir, log: 'in-place chmod repair succeeded' };
  }

  return copyToSafeTempDir(originalDir);
}

function needsPermissionRepair(baseDir: string, pluginDirNames: string[]): boolean {
  const check = (p: string) => {
    try {
      return (statSync(p).mode & 0o022) !== 0;
    } catch { return false; }
  };
  if (check(baseDir)) return true;
  for (const name of pluginDirNames) {
    if (check(join(baseDir, name))) return true;
  }
  return false;
}

function tryChmodRepairInPlace(baseDir: string, pluginDirNames: string[]): boolean {
  const repair = (p: string): boolean => {
    try {
      const mode = statSync(p).mode & 0o777;
      if ((mode & 0o022) !== 0) {
        chmodSync(p, mode & ~0o022);
      }
      return true;
    } catch { return false; }
  };

  if (!repair(baseDir)) return false;
  for (const name of pluginDirNames) {
    if (!repair(join(baseDir, name))) return false;
  }
  return true;
}

function copyToSafeTempDir(srcDir: string): { dir: string; log: string; tempDir: string } {
  const tempDir = mkdtempSync(join(tmpdir(), 'topichub-plugins-'));
  cpSync(srcDir, tempDir, { recursive: true });
  chmodRecursiveDirs(tempDir);
  linkVendoredNodeModules(srcDir, tempDir);
  return { dir: tempDir, log: `copied to ${tempDir} (in-place chmod failed on root-owned dirs)`, tempDir };
}

/**
 * Extensions import from `openclaw/plugin-sdk/...`. In the original vendored layout,
 * Node.js resolution walks up from `vendor/bridge/extensions/` to
 * `vendor/bridge/node_modules/openclaw/`. After copying to `/tmp/`, that parent
 * chain is broken. Symlink the vendored `node_modules` into the temp dir so jiti
 * can still resolve `openclaw` (and any other gateway-internal packages).
 */
function linkVendoredNodeModules(srcDir: string, tempDir: string): void {
  const vendoredNM = resolve(srcDir, '..', 'node_modules');
  if (!existsSync(vendoredNM)) return;
  const dest = join(tempDir, 'node_modules');
  try {
    symlinkSync(vendoredNM, dest, 'junction');
  } catch {
    // Fallback: if symlink fails (rare), try copying just the `openclaw` package
    // which is the critical one for extension resolution.
    try {
      const openclawSrc = join(vendoredNM, 'openclaw');
      if (existsSync(openclawSrc)) {
        const openclawDest = join(dest, 'openclaw');
        cpSync(openclawSrc, openclawDest, { recursive: true });
      }
    } catch { /* best-effort */ }
  }
}

function chmodRecursiveDirs(dir: string): void {
  try {
    const mode = statSync(dir).mode & 0o777;
    if ((mode & 0o022) !== 0) chmodSync(dir, mode & ~0o022);
  } catch { /* best-effort */ }
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) chmodRecursiveDirs(join(dir, entry.name));
    }
  } catch { /* best-effort */ }
}

/**
 * Set OPENCLAW_BUNDLED_PLUGINS_DIR eagerly at module-load time so the OpenClaw
 * `ids` module (which freezes CHANNEL_IDS on first import) always sees it.
 *
 * If the vendored directory has world-writable permissions owned by a different user,
 * OpenClaw discovery will reject it. We pre-apply the same copy-to-tmp fallback here
 * so that even early CHANNEL_IDS initialization uses a safe directory.
 */
let _modulePluginsTempDir: string | undefined;
const _vendoredPluginsDir = resolveVendoredBundledPluginsDir();
if (existsSync(_vendoredPluginsDir) && !process.env.OPENCLAW_BUNDLED_PLUGINS_DIR) {
  const dirNames = readdirSync(_vendoredPluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  const safe = ensureSafeBundledPluginsDir(_vendoredPluginsDir, dirNames);
  _modulePluginsTempDir = safe.tempDir;
  process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = safe.dir;
}

/**
 * Pre-flight: verify that `openclaw` is resolvable from the plugins directory.
 * Extensions (feishu, discord, …) import from `openclaw/plugin-sdk/…`. If the
 * plugins were copied to /tmp for permission repair, the parent node_modules
 * chain is broken. Fail loudly here instead of letting the gateway silently
 * start without any IM channels.
 */
function assertPluginDepsResolvable(pluginsDir: string, logger: TopicHubLogger): void {
  const candidates = [
    join(pluginsDir, 'node_modules', 'openclaw', 'package.json'),
    resolve(pluginsDir, '..', 'node_modules', 'openclaw', 'package.json'),
  ];
  if (candidates.some((c) => existsSync(c))) return;

  // Try Node.js require.resolve from the plugins dir as last resort
  try {
    require.resolve('openclaw/package.json', { paths: [pluginsDir] });
    return;
  } catch { /* not resolvable */ }

  const vendoredNM = resolve(pluginsDir, '..', 'node_modules');
  logger.error(
    `[BridgeManager] openclaw package not resolvable from plugins dir ${pluginsDir}. ` +
    `Extensions will fail to load. vendored node_modules expected at ${vendoredNM}`,
  );
  throw new Error(
    `openclaw package is not resolvable from plugin extensions directory (${pluginsDir}). ` +
    'This usually means the permission-repair copy to /tmp lost the node_modules symlink. ' +
    'Upgrade @byted/topichub-core to get the automatic symlink fix.',
  );
}

export interface BridgeManagerState {
  running: boolean;
  listenPort: number | null;
  mountPath: string | null;
  restartCount: number;
  webhookSecret: string | null;
}

export class BridgeManager {
  private generated: GeneratedBridgeConfig | null = null;
  private _webhookSecret: string | null = null;
  private _listenPort: number | null = null;
  private _mountPath: string | null = null;
  private _pluginsTempDir: string | null = null;
  private gatewayClose: ((opts?: { reason?: string }) => Promise<void>) | null = null;
  private shuttingDown = false;

  constructor(
    private readonly bridge: TopicHubBridgeConfig,
    private readonly logger: TopicHubLogger,
  ) { }

  get webhookSecret(): string | null {
    return this._webhookSecret;
  }

  /** @deprecated Use listenPort; gateway shares the host listen port. */
  get port(): number | null {
    return this._listenPort;
  }

  get mountPath(): string | null {
    return this._mountPath;
  }

  get state(): BridgeManagerState {
    return {
      running: this.gatewayClose !== null && !this.shuttingDown,
      listenPort: this._listenPort,
      mountPath: this._mountPath,
      restartCount: 0,
      webhookSecret: this._webhookSecret,
    };
  }

  /**
   * Start OpenClaw embedded on `bridge.httpServer` under `bridge.mountPath`.
   * Call while the host `http.Server` exists and before it accepts traffic
   * (e.g. Nest `OnApplicationBootstrap` during `app.listen()`).
   */
  /**
   * @param webhookSecretOverride When set (e.g. from {@link EmbeddedBridgeCluster}), all instances
   * share this HMAC secret for relay verification and outbound gateway auth.
   */
  async start(webhookSecretOverride?: string): Promise<void> {
    this.shuttingDown = false;

    const { httpServer, listenPort, mountPath } = this.bridge;

    const trimmed = webhookSecretOverride?.trim();
    this._webhookSecret = trimmed && trimmed.length > 0 ? trimmed : generateWebhookSecret();
    this._listenPort = listenPort;
    this._mountPath = mountPath;

    const gatewayPort = this.bridge.port ?? listenPort;

    this.generated = generateBridgeConfigFiles(
      toBridgeFileConfig(this.bridge),
      this._webhookSecret,
      gatewayPort,
    );

    this.logger.log(`Bridge config generated at ${this.generated.configPath}`);

    process.env.OPENCLAW_CONFIG_PATH = this.generated.configPath;
    process.env[TOPICHUB_WEBHOOK_HMAC_ENV] = this._webhookSecret!;

    const vendoredDir = resolveVendoredBundledPluginsDir();
    if (!existsSync(vendoredDir)) {
      throw new Error(
        `Missing vendored OpenClaw bundled plugins directory: ${vendoredDir}\n` +
        'From repo root run: node packages/core/scripts/sync-bridge-vendor.mjs --bridge',
      );
    }

    const pluginDirs = readdirSync(vendoredDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    let bundledPluginsDir: string;
    let safeLog: string;
    if (_modulePluginsTempDir && existsSync(_modulePluginsTempDir)) {
      bundledPluginsDir = _modulePluginsTempDir;
      safeLog = `reusing module-level copy at ${_modulePluginsTempDir}`;
      this._pluginsTempDir = null;
    } else {
      const safe = ensureSafeBundledPluginsDir(vendoredDir, pluginDirs);
      bundledPluginsDir = safe.dir;
      safeLog = safe.log;
      this._pluginsTempDir = safe.tempDir ?? null;
    }
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = bundledPluginsDir;

    this.logger.log(
      `Bundled plugins dir: ${bundledPluginsDir} (${pluginDirs.join(', ') || 'EMPTY'}) [${safeLog}]`,
    );

    assertPluginDepsResolvable(bundledPluginsDir, this.logger);

    const { startGatewayServer } = await loadOpenclawGatewayEmbed();
    const raw = mountPath.startsWith('/') ? mountPath : `/${mountPath}`;
    const pathPrefix = raw.replace(/\/+$/, '') || '/';
    if (pathPrefix === '/') {
      throw new Error('bridge mountPath must not be "/" (use e.g. /openclaw)');
    }

    let gateway;
    try {
      gateway = await startGatewayServer(listenPort, {
        bind: 'loopback',
        auth: { mode: 'token', token: this._webhookSecret! },
        embed: {
          httpServer,
          pathPrefix,
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (detail.includes('unknown channel') || detail.includes('Invalid config')) {
        this.logger.error(
          `[BridgeManager] Gateway start failed.\n` +
          `  OPENCLAW_BUNDLED_PLUGINS_DIR = ${process.env.OPENCLAW_BUNDLED_PLUGINS_DIR}\n` +
          `  vendoredDir (original)       = ${vendoredDir}\n` +
          `  bundledPluginsDir (active)   = ${bundledPluginsDir}\n` +
          `  extensions found             = [${pluginDirs.join(', ')}]\n` +
          `  OPENCLAW_CONFIG_PATH         = ${process.env.OPENCLAW_CONFIG_PATH}\n` +
          `  permRepair                   = ${safeLog}\n` +
          `  process.uid                  = ${typeof process.getuid === 'function' ? process.getuid() : 'N/A'}` +
          (err instanceof Error && err.stack ? `\nStack: ${err.stack}` : ''),
        );
      }
      throw err;
    }

    this.gatewayClose = gateway.close.bind(gateway);

    this.logger.log(
      `OpenClaw gateway embedded (listenPort=${this._listenPort}, mount=${this._mountPath})`,
    );
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;

    if (this.gatewayClose) {
      try {
        await this.gatewayClose({ reason: 'topic-hub shutdown' });
      } catch (err) {
        this.logger.warn(
          'OpenClaw gateway close failed',
          err instanceof Error ? err.message : String(err),
        );
      }
      this.gatewayClose = null;
    }

    if (this.generated) {
      cleanupBridgeConfigFiles(this.generated.configDir);
      this.generated = null;
    }

    if (this._pluginsTempDir) {
      try { rmSync(this._pluginsTempDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      this._pluginsTempDir = null;
    }

    this.logger.log('OpenClaw gateway stopped');
  }
}
