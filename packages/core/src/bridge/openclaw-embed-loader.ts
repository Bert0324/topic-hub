import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Resolves monorepo + published npm layout: this file lives under `dist/bridge/`. */
let cachedCorePackageRoot: string | undefined;

function resolvePublishedCorePackageRoot(): string {
  if (cachedCorePackageRoot) {
    return cachedCorePackageRoot;
  }
  const candidate = join(__dirname, '..', '..');
  const pkgPath = join(candidate, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error(
      `@topichub/core: cannot resolve package root (no package.json next to vendor tree). Expected near ${candidate} (embed loader dir: ${__dirname}).`,
    );
  }
  let name: string | undefined;
  try {
    name = (JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }).name;
  } catch {
    throw new Error(`@topichub/core: unreadable package.json at ${pkgPath}`);
  }
  if (!name || !name.includes('topichub-core')) {
    throw new Error(
      `@topichub/core: wrong package at ${pkgPath} (name was "${name ?? ''}", expected package name to include "topichub-core").`,
    );
  }
  cachedCorePackageRoot = candidate;
  return cachedCorePackageRoot;
}

/** Avoid TS `module: commonjs` emitting `require(file://…)`, which cannot load the OpenClaw ESM bundle. */
const importEsm = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<{ startGatewayServer?: StartGatewayServerFn }>;

export type EmbeddedGateway = {
  close: (opts?: { reason?: string; restartExpectedMs?: number | null }) => Promise<void>;
};

export type StartGatewayServerFn = (
  port?: number,
  opts?: Record<string, unknown>,
) => Promise<EmbeddedGateway>;

const embedOverrideEnv = 'TOPICHUB_OPENCLAW_EMBED';

/**
 * Resolve OpenClaw ESM embed (`startGatewayServer`) from the vendored tree shipped with
 * `@topichub/core` (`vendor/bridge/dist`, populated by `sync-bridge-vendor.mjs`).
 *
 * Optional override: absolute path to `embed-export.js` via {@link embedOverrideEnv} (dev only).
 */
export async function loadOpenclawGatewayEmbed(): Promise<{ startGatewayServer: StartGatewayServerFn }> {
  const override = process.env[embedOverrideEnv]?.trim();
  const bundledRel = 'vendor/bridge/dist/gateway/embed-export.js';
  const candidates =
    override && override.length > 0
      ? [override]
      : [join(resolvePublishedCorePackageRoot(), bundledRel)];

  let resolved: string | undefined;
  for (const c of candidates) {
    if (existsSync(c)) {
      resolved = c;
      break;
    }
  }
  if (!resolved) {
    throw new Error(
      'OpenClaw embed runtime not found under @topichub/core (expected vendor/bridge).\n' +
      'From monorepo root:\n' +
      '  pnpm bridge:build-vendor\n' +
      '  node packages/core/scripts/sync-bridge-vendor.mjs --bridge\n' +
      `Or set ${embedOverrideEnv}=</abs/path/to/embed-export.js> for a custom build.\n` +
      'Expected:\n' +
      candidates.map((c) => `  - ${c}`).join('\n'),
    );
  }
  const mod = await importEsm(pathToFileURL(resolved).href);
  return { startGatewayServer: mod.startGatewayServer as StartGatewayServerFn };
}
