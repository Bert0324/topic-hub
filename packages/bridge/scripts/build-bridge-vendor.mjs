#!/usr/bin/env node
/**
 * Build path optimized for embedding the OpenClaw gateway in Topic Hub (bridge):
 * - Skips canvas A2UI bundle, plugin-sdk .dts pipeline, CLI startup metadata, npm sidecars, etc.
 * - Still runs tsdown + runtime-postbuild so `dist/gateway/embed-export.js` matches production.
 * - Optionally prunes `dist/` into `dist-bridge-vendor/` (smaller directory to vendor into core).
 * - Requires `extensions/{discord,feishu,telegram,slack}/` sources in-repo (see ensure-bridge-bundled-extensions; no network).
 *
 * Usage from topic-hub repo root:
 *   pnpm bridge:build-vendor
 * From packages/bridge: node scripts/build-bridge-vendor.mjs [--no-prune]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pruneBridgeVendorOutput } from "./prune-bridge-vendor.mjs";
import { ensureBridgeBundledExtensions } from "./ensure-bridge-bundled-extensions.mjs";

const nodeBin = process.execPath;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** When bridge is at `<repo>/packages/bridge`, repo root is two levels up. */
const CANDIDATE_TOPIC_HUB_ROOT = path.resolve(ROOT, "..", "..");

function resolveTopicHubWorkspaceTsdownRun() {
  const hubPkg = path.join(CANDIDATE_TOPIC_HUB_ROOT, "package.json");
  const tsdownRun = path.join(CANDIDATE_TOPIC_HUB_ROOT, "node_modules", "tsdown", "dist", "run.mjs");
  try {
    const meta = JSON.parse(fs.readFileSync(hubPkg, "utf8"));
    if (meta?.name !== "topic-hub") {
      return null;
    }
  } catch {
    return null;
  }
  return fs.existsSync(tsdownRun) ? tsdownRun : null;
}

export const BRIDGE_VENDOR_BUILD_STEPS = [
  { label: "tsdown", args: ["scripts/tsdown-build.mjs"] },
  { label: "runtime-postbuild", args: ["scripts/runtime-postbuild.mjs"] },
  { label: "build-stamp", args: ["scripts/build-stamp.mjs"] },
  {
    label: "copy-hook-metadata",
    args: ["--import", "tsx", "scripts/copy-hook-metadata.ts"],
  },
  {
    label: "copy-export-html-templates",
    args: ["--import", "tsx", "scripts/copy-export-html-templates.ts"],
  },
  {
    label: "write-build-info",
    args: ["--import", "tsx", "scripts/write-build-info.ts"],
  },
];

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

function runStep(label, args) {
  console.error(`[build-bridge-vendor] ${label}`);
  const env = { ...process.env, OPENCLAW_BUILD_BRIDGE_VENDOR: "1" };
  if (label === "tsdown") {
    const tsdownRun = resolveTopicHubWorkspaceTsdownRun();
    if (tsdownRun) {
      env.OPENCLAW_TSDOWN_NODE_ENTRY = tsdownRun;
    }
  }
  const result = spawnSync(nodeBin, args, {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (isMainModule()) {
  const noPrune = process.argv.includes("--no-prune");

  ensureBridgeBundledExtensions();

  for (const step of BRIDGE_VENDOR_BUILD_STEPS) {
    runStep(step.label, step.args);
  }

  if (!noPrune) {
    const marker = path.join(ROOT, "dist-bridge-vendor", ".openclaw-bridge-vendor.json");
    pruneBridgeVendorOutput({ rootDir: ROOT });
    try {
      fs.writeFileSync(
        marker,
        JSON.stringify(
          {
            kind: "openclaw-bridge-vendor",
            builtAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch {
      /* optional marker */
    }
  } else {
    console.error("[build-bridge-vendor] skipped prune (--no-prune); full dist/ is the output");
  }
}
