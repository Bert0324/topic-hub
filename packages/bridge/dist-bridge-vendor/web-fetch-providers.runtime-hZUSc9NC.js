import { a as mapRegistryProviders, s as resolveManifestDeclaredWebProviderCandidatePluginIds } from "./web-search-providers.shared-Bi0WA7YQ.js";
import { n as sortWebFetchProviders, t as resolveBundledWebFetchResolutionConfig } from "./web-fetch-providers.shared-Dj7Ke-sq.js";
import { i as resolvePluginWebProviders, r as createWebProviderSnapshotCache } from "./web-search-providers.runtime-DnWMfnd7.js";
//#region src/plugins/web-fetch-providers.runtime.ts
let webFetchProviderSnapshotCache = createWebProviderSnapshotCache();
function resolveWebFetchCandidatePluginIds(params) {
	return resolveManifestDeclaredWebProviderCandidatePluginIds({
		contract: "webFetchProviders",
		configKey: "webFetch",
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		onlyPluginIds: params.onlyPluginIds,
		origin: params.origin
	});
}
function mapRegistryWebFetchProviders(params) {
	return mapRegistryProviders({
		entries: params.registry.webFetchProviders,
		onlyPluginIds: params.onlyPluginIds,
		sortProviders: sortWebFetchProviders
	});
}
function resolvePluginWebFetchProviders(params) {
	return resolvePluginWebProviders(params, {
		snapshotCache: webFetchProviderSnapshotCache,
		resolveBundledResolutionConfig: resolveBundledWebFetchResolutionConfig,
		resolveCandidatePluginIds: resolveWebFetchCandidatePluginIds,
		mapRegistryProviders: mapRegistryWebFetchProviders
	});
}
//#endregion
export { resolvePluginWebFetchProviders as t };
