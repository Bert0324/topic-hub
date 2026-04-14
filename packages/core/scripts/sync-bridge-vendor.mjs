#!/usr/bin/env node
/**
 * Copies @topichub/bridge build output into packages/core/vendor/bridge for npm publish.
 * Self-contained tree: no runtime dependency on repo `packages/bridge`.
 *
 * - `dist/` ← `packages/bridge/dist` or pruned `dist-bridge-vendor` (--bridge)
 * - `docs/reference/templates/` ← workspace bootstrap templates (AGENTS.md, …) for embedded gateway
 * - Root `package.json` stub (`name: @topichub/bridge`) for gateway package-root resolution
 * - `extensions/{discord,feishu,telegram,slack}/`
 * - `node_modules/` ← full `packages/bridge/node_modules` (dereferenced)
 * - `node_modules/openclaw/` ← shim: same `dist/` + `exports` as @topichub/bridge but `name: openclaw`
 *   so bundled extensions keep `import "openclaw/plugin-sdk/…"`.
 *
 * Run from repo root: node packages/core/scripts/sync-bridge-vendor.mjs [--bridge]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.join(__dirname, '..');
const repoRoot = path.join(coreRoot, '../..');
const bridgeRoot = path.join(repoRoot, 'packages/bridge');
const useBridge = process.argv.includes('--bridge');
const src = useBridge
  ? path.join(bridgeRoot, 'dist-bridge-vendor')
  : path.join(bridgeRoot, 'dist');
const destDist = path.join(coreRoot, 'vendor/bridge/dist');

/** Must match packages/bridge/scripts/ensure-bridge-bundled-extensions.mjs */
const BRIDGE_EXTENSION_IDS = ['discord', 'feishu', 'telegram', 'slack'];

function readBridgeVersion() {
  try {
    const p = path.join(bridgeRoot, 'package.json');
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return typeof j.version === 'string' ? j.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function writeBridgeRootPackageJson(vendorBridgeRoot) {
  mkdirSync(vendorBridgeRoot, { recursive: true });
  const p = path.join(vendorBridgeRoot, 'package.json');
  writeFileSync(
    p,
    `${JSON.stringify(
      {
        name: '@topichub/bridge',
        version: readBridgeVersion(),
        type: 'module',
        private: true,
        description: 'Vendored @topichub/bridge for @topichub/core (embedded IM gateway)',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function copyBundledExtensions(vendorBridgeRoot) {
  const extDestRoot = path.join(vendorBridgeRoot, 'extensions');
  mkdirSync(extDestRoot, { recursive: true });

  for (const id of BRIDGE_EXTENSION_IDS) {
    const from = path.join(bridgeRoot, 'extensions', id);
    if (!existsSync(path.join(from, 'src', 'channel.ts'))) {
      console.error(
        'Missing extension sources:',
        from,
        '\nEnsure packages/bridge/extensions/<id>/src/channel.ts exists (vendored in repo).',
      );
      process.exit(1);
    }
    const to = path.join(extDestRoot, id);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, {
      recursive: true,
      force: true,
      filter: (s) => !s.split(path.sep).includes('node_modules'),
    });
  }
  console.log('Copied bundled channel extensions ->', extDestRoot);
}

function copyBridgeNodeModulesBundle(vendorBridgeRoot) {
  const from = path.join(bridgeRoot, 'node_modules');
  const destRoot = path.join(vendorBridgeRoot, 'node_modules');
  if (!existsSync(from)) {
    console.error(
      'Missing packages/bridge/node_modules (run `pnpm install` from repo root with workspace packages/bridge).',
    );
    process.exit(1);
  }
  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(vendorBridgeRoot, { recursive: true });
  cpSync(from, destRoot, { recursive: true, force: true, dereference: true });
  console.log('Copied bridge node_modules bundle ->', destRoot);
}

/**
 * Extensions use bare specifier `openclaw` (historical). Publish a sibling folder `openclaw`
 * with identical dist + exports but package name `openclaw` so Node resolves those imports.
 */
function copyWorkspaceTemplatesToVendorRoots(vendorBridgeRoot) {
  const templatesSrc = path.join(bridgeRoot, 'docs', 'reference', 'templates');
  if (!existsSync(templatesSrc)) {
    console.error('Missing bridge workspace templates (required for agent workspace bootstrap):', templatesSrc);
    process.exit(1);
  }
  const destRoots = [
    vendorBridgeRoot,
    path.join(vendorBridgeRoot, 'node_modules', 'openclaw'),
  ];
  for (const root of destRoots) {
    if (!existsSync(root)) {
      continue;
    }
    const templatesDest = path.join(root, 'docs', 'reference', 'templates');
    rmSync(templatesDest, { recursive: true, force: true });
    mkdirSync(path.dirname(templatesDest), { recursive: true });
    cpSync(templatesSrc, templatesDest, { recursive: true, force: true });
  }
  console.log('Copied workspace templates ->', path.join(vendorBridgeRoot, 'docs', 'reference', 'templates'));
}

function installOpenclawAliasHostIntoVendorNodeModules(vendorBridgeRoot) {
  const dest = path.join(vendorBridgeRoot, 'node_modules', 'openclaw');
  const distFrom = path.join(bridgeRoot, 'dist');
  if (!existsSync(distFrom)) {
    console.error('Missing packages/bridge/dist — build bridge before sync:', distFrom);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(path.join(bridgeRoot, 'package.json'), path.join(dest, 'package.json'));
  cpSync(distFrom, path.join(dest, 'dist'), { recursive: true, force: true });
  const entry = path.join(bridgeRoot, 'openclaw.mjs');
  if (existsSync(entry)) {
    cpSync(entry, path.join(dest, 'openclaw.mjs'));
  }
  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = 'openclaw';
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log('Installed openclaw alias host (for extension imports) ->', dest);
}

if (!existsSync(src)) {
  console.error('Missing bridge build output:', src);
  console.error(
    useBridge
      ? 'Run: pnpm bridge:build-vendor (from repo root)'
      : 'Run: pnpm --dir packages/bridge run build',
  );
  process.exit(1);
}

mkdirSync(path.dirname(destDist), { recursive: true });
// Replace dist atomically so stale hashed chunks (e.g. old server.impl-*.js) cannot be
// loaded alongside the new graph — merge-only cpSync leaves orphans that break embed.
rmSync(destDist, { recursive: true, force: true });
cpSync(src, destDist, { recursive: true, force: true });
console.log(useBridge ? 'Synced bridge-vendor ->' : 'Synced bridge dist ->', destDist);

const vendorBridgeRoot = path.dirname(destDist);
writeBridgeRootPackageJson(vendorBridgeRoot);
copyBundledExtensions(vendorBridgeRoot);
copyBridgeNodeModulesBundle(vendorBridgeRoot);
installOpenclawAliasHostIntoVendorNodeModules(vendorBridgeRoot);
copyWorkspaceTemplatesToVendorRoots(vendorBridgeRoot);
