import { o as resolveManifestCommandAliasOwnerInRegistry } from "./manifest-DVVfeFh-.js";
import { n as loadPluginManifestRegistry } from "./manifest-registry--_2x2rrY.js";
//#region src/plugins/manifest-command-aliases.runtime.ts
function resolveManifestCommandAliasOwner(params) {
	const registry = params.registry ?? loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	return resolveManifestCommandAliasOwnerInRegistry({
		command: params.command,
		registry
	});
}
//#endregion
export { resolveManifestCommandAliasOwner as t };
