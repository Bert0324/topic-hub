#!/usr/bin/env node
/**
 * After a normal `dist/` build, copy only files reachable from the gateway embed
 * entry plus a small set of static asset trees into `dist-bridge-vendor/`.
 *
 * Intended for Topic Hub (and similar) vendoring: sync this directory into
 * `@topichub/core/vendor/bridge/dist` instead of the full `dist/`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isUnderDir(fileAbs, dirAbs) {
  const a = path.resolve(fileAbs);
  const b = path.resolve(dirAbs);
  if (a === b) {
    return true;
  }
  const rel = path.relative(b, a);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Relative ESM specifiers from built `.js` (same-line patterns only). */
const REL_SPEC_PATTERNS = [
  /\bfrom\s+["'](\.[^"']+)["']/g,
  /\bimport\s+["'](\.[^"']+)["']/g,
  /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  /\bexport\s+\*\s+from\s+["'](\.[^"']+)["']/g,
  /\bexport\s+\{[^}]+\}\s+from\s+["'](\.[^"']+)["']/g,
  /\bexport\s+[^;\n]+\s+from\s+["'](\.[^"']+)["']/g,
];

/**
 * Trees and root files under `dist/` that are not reliably discoverable via
 * static import scanning but are required at runtime for the embedded gateway.
 */
export const BRIDGE_VENDOR_STATIC_RELATIVE_PATHS = [
  "control-ui",
  "export-html",
  "hooks/bundled",
  "channel-catalog.json",
  // `resolvePluginRuntimeModulePath` (sdk-alias) loads `dist/plugins/runtime/index.js` for bundled channels (e.g. Feishu); not always reachable from embed static import graph.
  "plugins/runtime",
  // `tts-runtime` resolves `dist/extensions/speech-core/runtime-api.js` via `public-surface-runtime`, not static imports.
  "extensions/speech-core",
];

/**
 * @param {string} fromAbs
 * @param {string} spec
 * @returns {string | null} absolute path under dist, or null
 */
export function resolveRelativeDistModule(fromAbs, spec, distDir) {
  if (!spec.startsWith(".")) {
    return null;
  }
  const distAbs = path.resolve(distDir);
  const raw = path.normalize(path.join(path.dirname(fromAbs), spec));
  const candidates = [];
  if (fs.existsSync(raw) && fs.statSync(raw).isFile()) {
    candidates.push(path.resolve(raw));
  }
  const withJs = raw.endsWith(".js") ? raw : `${raw}.js`;
  if (fs.existsSync(withJs) && fs.statSync(withJs).isFile()) {
    candidates.push(path.resolve(withJs));
  }
  const indexJs = path.join(raw, "index.js");
  if (fs.existsSync(indexJs) && fs.statSync(indexJs).isFile()) {
    candidates.push(path.resolve(indexJs));
  }
  for (const c of candidates) {
    if (isUnderDir(c, distAbs)) {
      return c;
    }
  }
  return null;
}

/**
 * @param {string} fileAbs
 * @param {string} distDir
 * @returns {Generator<string>}
 */
/**
 * Copy every `*.runtime.js` under dist (preserving relative paths). Chunks often load
 * these via `createRequire`/`jiti` with string literals that static import tracing misses
 * (e.g. `facade-activation-check.runtime.js`).
 * @returns {number} number of files copied
 */
function copyAllRuntimeJsArtifacts(distAbs, outAbs) {
  let count = 0;
  /** @param {string} dirAbs */
  function walk(dirAbs) {
    let entries;
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dirAbs, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".runtime.js")) {
        const rel = path.relative(distAbs, full);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          continue;
        }
        const dest = path.join(outAbs, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(full, dest);
        count += 1;
      }
    }
  }
  walk(distAbs);
  return count;
}

export function* extractRelativeSpecifiers(fileAbs, distDir) {
  let content;
  try {
    content = fs.readFileSync(fileAbs, "utf8");
  } catch {
    return;
  }
  for (const re of REL_SPEC_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const spec = m[1];
      const resolved = resolveRelativeDistModule(fileAbs, spec, distDir);
      if (resolved) {
        yield resolved;
      }
    }
  }
}

/**
 * @param {string} dirAbs
 * @returns {string[]} absolute paths to `.js` files under dirAbs
 */
function walkJsFilesRecursive(dirAbs) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} d */
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".js")) {
        out.push(path.resolve(full));
      }
    }
  }
  walk(dirAbs);
  return out;
}

/**
 * @param {object} params
 * @param {string} [params.rootDir]
 * @param {string} [params.distDir]
 * @param {string} [params.outDir]
 * @param {string[]} [params.extraStaticRelativePaths]
 * @param {(msg: string) => void} [params.log]
 */
export function pruneBridgeVendorOutput(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const distDir = params.distDir ?? path.join(rootDir, "dist");
  const outDir = params.outDir ?? path.join(rootDir, "dist-bridge-vendor");
  const log = params.log ?? ((m) => console.error(`[prune-bridge-vendor] ${m}`));
  const staticExtras = [
    ...BRIDGE_VENDOR_STATIC_RELATIVE_PATHS,
    ...(params.extraStaticRelativePaths ?? []),
  ];

  const entry = path.join(distDir, "gateway", "embed-export.js");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Missing embed entry (run tsdown first): ${entry}`,
    );
  }

  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const queue = [path.resolve(entry)];
  const distAbs = path.resolve(distDir);

  function drainImportGraph() {
    while (queue.length > 0) {
      const fileAbs = queue.pop();
      if (!fileAbs || seen.has(fileAbs)) {
        continue;
      }
      seen.add(fileAbs);
      for (const next of extractRelativeSpecifiers(fileAbs, distDir)) {
        if (!seen.has(next)) {
          queue.push(next);
        }
      }
    }
  }

  drainImportGraph();

  // Static trees (e.g. `extensions/speech-core`) are not reachable from the embed entry's import
  // graph, but their chunks may import siblings under `dist/` (hashed chunk names). Trace those.
  for (const rel of staticExtras) {
    const src = path.join(distDir, rel);
    if (!fs.existsSync(src)) {
      log(`skip missing static path: ${rel}`);
      continue;
    }
    const stat = fs.statSync(src);
    if (stat.isFile() && src.endsWith(".js")) {
      queue.push(path.resolve(src));
    } else if (stat.isDirectory()) {
      queue.push(...walkJsFilesRecursive(path.resolve(src)));
    }
  }
  drainImportGraph();

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const abs of seen) {
    const rel = path.relative(distAbs, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      continue;
    }
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
  }

  for (const rel of staticExtras) {
    const src = path.join(distDir, rel);
    const dest = path.join(outDir, rel);
    if (!fs.existsSync(src)) {
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, dereference: true, force: true });
  }

  const runtimeCopied = copyAllRuntimeJsArtifacts(distAbs, path.resolve(outDir));
  if (runtimeCopied > 0) {
    log(`copied ${runtimeCopied} *.runtime.js sidecar(s) (createRequire/jiti)`);
  }

  const dts = path.join(distDir, "gateway", "embed-export.d.ts");
  if (fs.existsSync(dts)) {
    const destDts = path.join(outDir, "gateway", "embed-export.d.ts");
    fs.mkdirSync(path.dirname(destDts), { recursive: true });
    fs.copyFileSync(dts, destDts);
  }

  log(`wrote ${outDir} (${seen.size} traced .js modules + static trees)`);
  return { tracedModules: seen.size, outDir };
}

function isMainModule() {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(path.resolve(argv1)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    pruneBridgeVendorOutput();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
