import { t as resolvePluginProviders } from "./provider-auth-choice.runtime-J8MahTnB.js";
import { o as normalizeTokenProviderInput } from "./provider-auth-input-CtSfIwNT.js";
import { i as resolveProviderMatch } from "./provider-auth-choice-helpers-Cbb7mb5i.js";
import { r as normalizeLegacyOnboardAuthChoice, s as resolveManifestProviderAuthChoice } from "./auth-choice-legacy-BZCAuxQG.js";
import "./auth-choice.apply-helpers-fS4qr61c.js";
//#region src/commands/auth-choice.apply.api-providers.ts
function resolveProviderAuthChoiceByKind(params) {
	return resolveProviderMatch(resolvePluginProviders({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		mode: "setup"
	}), params.providerId)?.auth.find((method) => method.kind === params.kind)?.wizard?.choiceId;
}
function normalizeApiKeyTokenProviderAuthChoice(params) {
	if (!params.tokenProvider) return params.authChoice;
	const normalizedTokenProvider = normalizeTokenProviderInput(params.tokenProvider);
	if (!normalizedTokenProvider) return params.authChoice;
	if (params.authChoice === "token" || params.authChoice === "setup-token") return resolveProviderAuthChoiceByKind({
		providerId: normalizedTokenProvider,
		kind: "token",
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	}) ?? params.authChoice;
	if (params.authChoice !== "apiKey") return params.authChoice;
	return resolveProviderAuthChoiceByKind({
		providerId: normalizedTokenProvider,
		kind: "api_key",
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	}) ?? params.authChoice;
}
async function applyAuthChoiceApiProviders(_params) {
	return null;
}
//#endregion
//#region src/plugins/provider-auth-choice-preference.ts
function normalizeLegacyAuthChoice(choice, env) {
	return normalizeLegacyOnboardAuthChoice(choice, { env }) ?? choice;
}
async function resolvePreferredProviderForAuthChoice(params) {
	const choice = normalizeLegacyAuthChoice(params.choice, params.env) ?? params.choice;
	const manifestResolved = resolveManifestProviderAuthChoice(choice, params);
	if (manifestResolved) return manifestResolved.providerId;
	const { resolveProviderPluginChoice, resolvePluginProviders } = await import("./provider-auth-choice.runtime-UYLGG81j.js");
	const pluginResolved = resolveProviderPluginChoice({
		providers: resolvePluginProviders({
			config: params.config,
			workspaceDir: params.workspaceDir,
			env: params.env,
			mode: "setup",
			includeUntrustedWorkspacePlugins: params.includeUntrustedWorkspacePlugins
		}),
		choice
	});
	if (pluginResolved) return pluginResolved.provider.id;
	if (choice === "custom-api-key") return "custom";
}
//#endregion
export { applyAuthChoiceApiProviders as n, normalizeApiKeyTokenProviderAuthChoice as r, resolvePreferredProviderForAuthChoice as t };
