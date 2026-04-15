#!/usr/bin/env node
/**
 * Copies @topichub/bridge build output into packages/core/vendor/bridge for npm publish.
 * Self-contained tree: no runtime dependency on repo `packages/bridge`.
 *
 * - `dist/` ← `packages/bridge/dist` or pruned `dist-bridge-vendor` (--bridge)
 * - `docs/reference/templates/` ← workspace bootstrap templates (AGENTS.md, …) for embedded gateway
 * - Root `package.json` stub (`name: @topichub/bridge`) for gateway package-root resolution
 * - `extensions/{discord,feishu,telegram,slack}/`
 * - `bundled_modules/` ← full `packages/bridge/node_modules` (dereferenced, renamed to
 *   avoid npm's unconditional `node_modules` exclusion during publish)
 * - `bundled_modules/openclaw/` ← shim: same `dist/` + `exports` as @topichub/bridge but `name: openclaw`
 *   so bundled extensions keep `import "openclaw/plugin-sdk/…"`.
 *
 * Run from repo root: node packages/core/scripts/sync-bridge-vendor.mjs [--bridge]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Packages/scopes that are NOT needed at runtime by the embedded IM gateway.
 * They exist in packages/bridge/node_modules because bridge supports many
 * channels and AI providers, but the embedded gateway only uses: server core,
 * jiti (extension loader), zod, ws, yaml, and channel-specific SDKs like the
 * Feishu/Lark SDK.  Excluding these keeps the published tarball under ~100 MB
 * so pnpm doesn't OOM during integrity checks.
 */
const VENDOR_EXCLUDE_SCOPES = new Set([
  '@anthropic-ai', '@aws', '@aws-sdk', '@buape', '@discordjs', '@google',
  '@grammyjs', '@homebridge', '@lancedb', '@line', '@lydell',
  '@mariozechner', '@matrix-org', '@typescript', '@vitest',
]);
const VENDOR_EXCLUDE_PACKAGES = new Set([
  'discord-api-types', 'grammy', 'jimp', 'jscpd', 'jsdom',
  'madge', 'matrix-js-sdk', 'mpg123-decoder', 'node-edge-tts',
  'node-llama-cpp', 'nostr-tools', 'openai', 'opusscript', 'oxfmt',
  'oxlint', 'oxlint-tsgolint', 'pdfjs-dist', 'playwright-core',
  'sharp', 'signal-utils', 'silk-wasm', 'sqlite-vec',
  'tsdown', 'tsx', 'typescript', 'vitest',
]);

function shouldExcludeVendorEntry(name) {
  if (VENDOR_EXCLUDE_PACKAGES.has(name)) return true;
  const scope = name.startsWith('@') ? name.split('/')[0] : null;
  return scope != null && VENDOR_EXCLUDE_SCOPES.has(scope);
}

function copyBridgeNodeModulesBundle(vendorBridgeRoot) {
  const from = path.join(bridgeRoot, 'node_modules');
  // npm unconditionally excludes directories named `node_modules` from
  // published tarballs.  Use `bundled_modules` so the files survive publish.
  // At runtime, bridge-manager creates a `node_modules` symlink pointing here
  // for Node.js bare-specifier resolution.
  const destRoot = path.join(vendorBridgeRoot, 'bundled_modules');
  if (!existsSync(from)) {
    console.error(
      'Missing packages/bridge/node_modules (run `pnpm install` from repo root with workspace packages/bridge).',
    );
    process.exit(1);
  }
  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(vendorBridgeRoot, { recursive: true });

  let excluded = 0;
  cpSync(from, destRoot, {
    recursive: true,
    force: true,
    dereference: true,
    filter: (src) => {
      const rel = path.relative(from, src);
      if (!rel) return true; // root dir
      const parts = rel.split(path.sep);
      // pnpm may leave a `.ignored/` tree with optional/native deps (e.g. @discordjs/opus)
      // containing broken `.bin` symlinks; copying it breaks cpSync even with dereference.
      if (parts.includes('.ignored')) return false;
      let name;
      if (parts[0].startsWith('@') && parts.length >= 2) {
        name = `${parts[0]}/${parts[1]}`;
      } else {
        name = parts[0];
      }
      if (shouldExcludeVendorEntry(name)) {
        if (parts.length <= 2) excluded++;
        return false;
      }
      return true;
    },
  });
  console.log(`Copied bridge node_modules bundle -> ${destRoot} (excluded ${excluded} unnecessary packages)`);

  const roots = discoverDistExternalRoots(destDist, destRoot);
  vendorTransitiveDepsFor(destRoot, roots);
}

/**
 * Scan the dist bundle to discover which npm packages are imported as external
 * dependencies (i.e. not bundled), then return the subset that actually exists
 * in the vendored node_modules.  These are the roots whose transitive dep
 * trees must also be vendored.
 *
 * The Feishu/Lark SDK is always included since it's loaded at runtime by jiti
 * from the channel extension source (not via the pre-built dist).
 */
function discoverDistExternalRoots(distDir, destRoot) {
  const ALWAYS_INCLUDE = ['@larksuiteoapi/node-sdk'];
  const seen = new Set(ALWAYS_INCLUDE);

  if (!existsSync(distDir)) return [...seen];

  for (const file of readdirSync(distDir).filter((f) => f.endsWith('.js'))) {
    const content = readFileSync(path.join(distDir, file), 'utf8');
    const re = /from\s+["']([^"'./][^"']*)["']/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      let spec = m[1];
      // Normalise scoped package names: @scope/pkg/sub → @scope/pkg
      if (spec.startsWith('@')) {
        const parts = spec.split('/');
        spec = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
      } else {
        spec = spec.split('/')[0];
      }
      seen.add(spec);
    }
  }

  // Only keep roots that exist in the vendored node_modules
  return [...seen].filter((s) => existsSync(path.join(destRoot, s, 'package.json')));
}

/**
 * Starting from a specific set of root packages, walk their dependency trees
 * and copy any missing transitive deps from the pnpm store.
 * Unlike scanning ALL vendored packages, this only resolves deps for the
 * listed roots — keeping the published package small.
 */
function vendorTransitiveDepsFor(destRoot, roots) {
  const pnpmStore = path.join(repoRoot, 'node_modules', '.pnpm');
  const seen = new Set();
  const queue = [...roots];
  let copied = 0;

  while (queue.length > 0) {
    const pkg = queue.shift();
    if (seen.has(pkg)) continue;
    seen.add(pkg);

    const pkgDir = path.join(destRoot, pkg);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;

    let deps;
    try {
      const j = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      deps = Object.keys(j.dependencies || {});
    } catch {
      continue;
    }

    for (const dep of deps) {
      const depDir = path.join(destRoot, dep);
      if (existsSync(depDir)) {
        queue.push(dep);
        continue;
      }

      const resolved = findInPnpmStore(pnpmStore, dep, pkgDir);
      if (resolved) {
        mkdirSync(path.dirname(depDir), { recursive: true });
        cpSync(resolved, depDir, { recursive: true, force: true, dereference: true });
        copied++;
        queue.push(dep);
      }
    }
  }
  console.log(`Vendored ${copied} transitive deps for [${roots.join(', ')}]`);
}

function findInPnpmStore(pnpmStore, depName, fromPkgDir) {
  // Strategy 1: check the pnpm virtual store for the parent package
  // pnpm resolves sub-deps as siblings in node_modules/.pnpm/<parent>/node_modules/<dep>
  try {
    const realFrom = realpathSync(fromPkgDir);
    const sibling = path.join(path.dirname(realFrom), depName);
    if (existsSync(path.join(sibling, 'package.json'))) {
      return realpathSync(sibling);
    }
  } catch { /* not found via sibling resolution */ }

  // Strategy 2: check the hoisted pnpm node_modules
  const hoisted = path.join(pnpmStore, 'node_modules', depName);
  if (existsSync(path.join(hoisted, 'package.json'))) {
    try { return realpathSync(hoisted); } catch { return hoisted; }
  }

  console.warn(`  ⚠ transitive dep not found: ${depName} (needed by package at ${fromPkgDir})`);
  return null;
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
    path.join(vendorBridgeRoot, 'bundled_modules', 'openclaw'),
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
  const dest = path.join(vendorBridgeRoot, 'bundled_modules', 'openclaw');
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
