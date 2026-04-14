#!/usr/bin/env node
/**
 * Verifies bundled IM channel extensions ship in-repo under `packages/bridge/extensions/`.
 * Topic Hub bridge build is fully offline: no git clone, no registry fetch from this script.
 *
 * Required markers: `extensions/<id>/src/channel.ts` for each id in {@link BRIDGE_BUNDLED_EXTENSION_IDS}.
 *
 * Env:
 * - OPENCLAW_SKIP_BRIDGE_EXTENSURE=1 — skip checks (maintainers only; breaks build if sources missing)
 *
 * Extensions used by Topic Hub embedded bridge (see packages/core scripts/sync-bridge-vendor.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Channel extensions Topic Hub enables in generated openclaw.json */
export const BRIDGE_BUNDLED_EXTENSION_IDS = ["discord", "feishu", "telegram", "slack"];

function markerFor(id) {
  return path.join(ROOT, "extensions", id, "src", "channel.ts");
}

function allPresent() {
  return BRIDGE_BUNDLED_EXTENSION_IDS.every((id) => fs.existsSync(markerFor(id)));
}

export function ensureBridgeBundledExtensions() {
  if (process.env.OPENCLAW_SKIP_BRIDGE_EXTENSURE === "1") {
    return;
  }
  if (allPresent()) {
    return;
  }

  const missing = BRIDGE_BUNDLED_EXTENSION_IDS.filter((id) => !fs.existsSync(markerFor(id)));
  console.error(
    "[ensure-bridge-bundled-extensions] missing bundled extension source(s):",
    missing.join(", "),
  );
  console.error(
    "Bridge builds must not fetch from the network. Commit or restore these trees under:\n",
    `  ${path.join(ROOT, "extensions", "<id>", "src", "channel.ts")}`,
  );
  process.exit(1);
}

function isMainModule() {
  const a = process.argv[1];
  if (!a) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(path.resolve(a)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  ensureBridgeBundledExtensions();
}
