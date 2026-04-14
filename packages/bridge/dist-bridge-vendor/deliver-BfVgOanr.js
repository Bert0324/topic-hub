import { i as normalizeLowercaseStringOrEmpty, o as normalizeOptionalLowercaseString, s as normalizeOptionalString } from "./string-coerce-D8LAEut5.js";
import { m as normalizeWindowsPathForComparison } from "./boundary-file-read-4GSqtybS.js";
import { m as resolveUserPath } from "./utils-BpVTx0yp.js";
import { i as formatErrorMessage } from "./errors-BTh8VBsl.js";
import { t as createSubsystemLogger } from "./subsystem-BM4rdzkv.js";
import { t as getChannelPlugin } from "./registry-BkswxGUu.js";
import { h as sendMediaWithLeadingCaption, p as resolveSendableOutboundReplyParts } from "./reply-payload-sTLdO-KP.js";
import { C as parseThreadSessionSuffix, S as parseRawSessionConversationRef, c as normalizeAgentId, u as resolveAgentIdFromSessionKey } from "./session-key-CprbVBQX.js";
import { i as resolveAgentConfig, m as resolveAgentWorkspaceDir } from "./agent-scope-D2A6iYD-.js";
import { l as normalizeToolName } from "./tool-policy-DekfzodU.js";
import { r as resolveSandboxInputPath } from "./sandbox-paths-BpWrwuiS.js";
import { d as normalizeMessageChannel } from "./message-channel-BsZYykgY.js";
import "./plugins-C60yWwZy.js";
import { c as resolveTextChunkLimit, i as chunkMarkdownTextWithMode, n as chunkByParagraph, s as resolveChunkMode } from "./chunk-Nshu4GGn.js";
import { t as parseInlineDirectives } from "./directive-tags-DoZ1tyHd.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-CWxC3y8-.js";
import { m as triggerInternalHook, n as createInternalHookEvent } from "./internal-hooks-0tvOr1P0.js";
import { t as resolveSessionConversation } from "./session-conversation-D0x0jUff.js";
import { i as resolveMirroredTranscriptText } from "./transcript-CxvrT_cw.js";
import { r as isSilentReplyPayloadText } from "./tokens-BwgrIC7s.js";
import { r as splitMediaFromOutput } from "./parse-BbMNIE4d.js";
import { d as readLocalFileSafely } from "./fs-safe-Co_6GYrb.js";
import { n as isToolAllowedByPolicyName, r as pickSandboxToolPolicy, t as isToolAllowedByPolicies } from "./tool-policy-match-KGmAd_zv.js";
import { i as getAgentScopedMediaLocalRootsForSources, s as resolveEffectiveToolFsRootExpansionAllowed } from "./local-roots-Bgfqr3vS.js";
import { i as hasReplyPayloadContent, n as hasReplyChannelData, t as hasInteractiveReplyBlocks } from "./payload-3OXuvJHe.js";
import { r as resolveChannelGroupToolsPolicy } from "./group-policy-LemWswm1.js";
import { t as resolveStoredSubagentCapabilities } from "./subagent-capabilities-CpMuNDpV.js";
import { t as loadChannelOutboundAdapter } from "./load-DTm4Wyb4.js";
import { a as toInternalMessageSentContext, d as toPluginMessageSentEvent, f as fireAndForgetHook, l as toPluginMessageContext, t as buildCanonicalSentMessageHookContext } from "./message-hook-mappers-CpVrS909.js";
import { l as failDelivery, o as ackDelivery, s as enqueueDelivery } from "./delivery-queue-BdhkQeAo.js";
import { a as shouldSuppressReasoningPayload, i as isRenderablePayload, r as formatBtwTextForExternalDelivery } from "./reply-payloads-CFyAzeE7.js";
import path from "node:path";
//#region src/auto-reply/reply/reply-directives.ts
function parseReplyDirectives(raw, options = {}) {
	const split = splitMediaFromOutput(raw);
	let text = split.text ?? "";
	const replyParsed = parseInlineDirectives(text, {
		currentMessageId: options.currentMessageId,
		stripAudioTag: false,
		stripReplyTags: true
	});
	if (replyParsed.hasReplyTag) text = replyParsed.text;
	const silentToken = options.silentToken ?? "NO_REPLY";
	const isSilent = isSilentReplyPayloadText(text, silentToken);
	if (isSilent) text = "";
	return {
		text,
		mediaUrls: split.mediaUrls,
		mediaUrl: split.mediaUrl,
		replyToId: replyParsed.replyToId,
		replyToCurrent: replyParsed.replyToCurrent,
		replyToTag: replyParsed.hasReplyTag,
		audioAsVoice: split.audioAsVoice,
		isSilent
	};
}
//#endregion
//#region src/agents/path-policy.ts
function throwPathEscapesBoundary(params) {
	const boundary = params.options?.boundaryLabel ?? "workspace root";
	const suffix = params.options?.includeRootInError ? ` (${params.rootResolved})` : "";
	throw new Error(`Path escapes ${boundary}${suffix}: ${params.candidate}`);
}
function validateRelativePathWithinBoundary(params) {
	if (params.relativePath === "" || params.relativePath === ".") {
		if (params.options?.allowRoot) return "";
		throwPathEscapesBoundary({
			options: params.options,
			rootResolved: params.rootResolved,
			candidate: params.candidate
		});
	}
	if (params.relativePath.startsWith("..") || params.isAbsolutePath(params.relativePath)) throwPathEscapesBoundary({
		options: params.options,
		rootResolved: params.rootResolved,
		candidate: params.candidate
	});
	return params.relativePath;
}
function toRelativePathUnderRoot(params) {
	const resolvedInput = resolveSandboxInputPath(params.candidate, params.options?.cwd ?? params.root);
	if (process.platform === "win32") {
		const rootResolved = path.win32.resolve(params.root);
		const resolvedCandidate = path.win32.resolve(resolvedInput);
		const rootForCompare = normalizeWindowsPathForComparison(rootResolved);
		const targetForCompare = normalizeWindowsPathForComparison(resolvedCandidate);
		return validateRelativePathWithinBoundary({
			relativePath: path.win32.relative(rootForCompare, targetForCompare),
			isAbsolutePath: path.win32.isAbsolute,
			options: params.options,
			rootResolved,
			candidate: params.candidate
		});
	}
	const rootResolved = path.resolve(params.root);
	const resolvedCandidate = path.resolve(resolvedInput);
	return validateRelativePathWithinBoundary({
		relativePath: path.relative(rootResolved, resolvedCandidate),
		isAbsolutePath: path.isAbsolute,
		options: params.options,
		rootResolved,
		candidate: params.candidate
	});
}
function toRelativeBoundaryPath(params) {
	return toRelativePathUnderRoot({
		root: params.root,
		candidate: params.candidate,
		options: {
			allowRoot: params.options?.allowRoot,
			cwd: params.options?.cwd,
			boundaryLabel: params.boundaryLabel,
			includeRootInError: params.includeRootInError
		}
	});
}
function toRelativeWorkspacePath(root, candidate, options) {
	return toRelativeBoundaryPath({
		root,
		candidate,
		options,
		boundaryLabel: "workspace root"
	});
}
function toRelativeSandboxPath(root, candidate, options) {
	return toRelativeBoundaryPath({
		root,
		candidate,
		options,
		boundaryLabel: "sandbox root",
		includeRootInError: true
	});
}
function resolvePathFromInput(filePath, cwd) {
	return path.normalize(resolveSandboxInputPath(filePath, cwd));
}
//#endregion
//#region src/agents/workspace-dir.ts
function normalizeWorkspaceDir(workspaceDir) {
	const trimmed = workspaceDir?.trim();
	if (!trimmed) return null;
	const expanded = trimmed.startsWith("~") ? resolveUserPath(trimmed) : trimmed;
	const resolved = path.resolve(expanded);
	if (resolved === path.parse(resolved).root) return null;
	return resolved;
}
function resolveWorkspaceRoot(workspaceDir) {
	return normalizeWorkspaceDir(workspaceDir) ?? process.cwd();
}
//#endregion
//#region src/agents/pi-tools.policy.ts
/**
* Tools always denied for sub-agents regardless of depth.
* These are system-level or interactive tools that sub-agents should never use.
*/
const SUBAGENT_TOOL_DENY_ALWAYS = [
	"gateway",
	"agents_list",
	"whatsapp_login",
	"session_status",
	"cron",
	"sessions_send"
];
/**
* Additional tools denied for leaf sub-agents (depth >= maxSpawnDepth).
* These are tools that only make sense for orchestrator sub-agents that can spawn children.
*/
const SUBAGENT_TOOL_DENY_LEAF = [
	"subagents",
	"sessions_list",
	"sessions_history",
	"sessions_spawn"
];
/**
* Build the deny list for a sub-agent at a given depth.
*
* - Depth 1 with maxSpawnDepth >= 2 (orchestrator): allowed to use sessions_spawn,
*   subagents, sessions_list, sessions_history so it can manage its children.
* - Depth >= maxSpawnDepth (leaf): denied subagents, sessions_spawn, and
*   session management tools.
*/
function resolveSubagentDenyList(depth, maxSpawnDepth) {
	if (depth >= Math.max(1, Math.floor(maxSpawnDepth))) return [...SUBAGENT_TOOL_DENY_ALWAYS, ...SUBAGENT_TOOL_DENY_LEAF];
	return [...SUBAGENT_TOOL_DENY_ALWAYS];
}
function resolveSubagentDenyListForRole(role) {
	if (role === "leaf") return [...SUBAGENT_TOOL_DENY_ALWAYS, ...SUBAGENT_TOOL_DENY_LEAF];
	return [...SUBAGENT_TOOL_DENY_ALWAYS];
}
function resolveSubagentToolPolicy(cfg, depth) {
	const configured = cfg?.tools?.subagents?.tools;
	const maxSpawnDepth = cfg?.agents?.defaults?.subagents?.maxSpawnDepth ?? 1;
	const baseDeny = resolveSubagentDenyList(typeof depth === "number" && depth >= 0 ? depth : 1, maxSpawnDepth);
	const allow = Array.isArray(configured?.allow) ? configured.allow : void 0;
	const alsoAllow = Array.isArray(configured?.alsoAllow) ? configured.alsoAllow : void 0;
	const explicitAllow = new Set([...allow ?? [], ...alsoAllow ?? []].map((toolName) => normalizeToolName(toolName)));
	const deny = [...baseDeny.filter((toolName) => !explicitAllow.has(normalizeToolName(toolName))), ...Array.isArray(configured?.deny) ? configured.deny : []];
	return {
		allow: allow && alsoAllow ? Array.from(new Set([...allow, ...alsoAllow])) : allow,
		deny
	};
}
function resolveSubagentToolPolicyForSession(cfg, sessionKey) {
	const configured = cfg?.tools?.subagents?.tools;
	const capabilities = resolveStoredSubagentCapabilities(sessionKey, { cfg });
	const allow = Array.isArray(configured?.allow) ? configured.allow : void 0;
	const alsoAllow = Array.isArray(configured?.alsoAllow) ? configured.alsoAllow : void 0;
	const explicitAllow = new Set([...allow ?? [], ...alsoAllow ?? []].map((toolName) => normalizeToolName(toolName)));
	const deny = [...resolveSubagentDenyListForRole(capabilities.role).filter((toolName) => !explicitAllow.has(normalizeToolName(toolName))), ...Array.isArray(configured?.deny) ? configured.deny : []];
	return {
		allow: allow && alsoAllow ? Array.from(new Set([...allow, ...alsoAllow])) : allow,
		deny
	};
}
function filterToolsByPolicy(tools, policy) {
	if (!policy) return tools;
	return tools.filter((tool) => isToolAllowedByPolicyName(tool.name, policy));
}
function normalizeProviderKey(value) {
	return normalizeLowercaseStringOrEmpty(value);
}
function collectUniqueStrings(values) {
	const seen = /* @__PURE__ */ new Set();
	const resolved = [];
	for (const value of values) {
		const trimmed = value?.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		resolved.push(trimmed);
	}
	return resolved;
}
function buildScopedGroupIdCandidates(groupId) {
	const raw = groupId?.trim();
	if (!raw) return [];
	const topicSenderMatch = raw.match(/^(.+):topic:([^:]+):sender:([^:]+)$/i);
	if (topicSenderMatch) {
		const [, chatId, topicId] = topicSenderMatch;
		return collectUniqueStrings([
			raw,
			`${chatId}:topic:${topicId}`,
			chatId
		]);
	}
	const topicMatch = raw.match(/^(.+):topic:([^:]+)$/i);
	if (topicMatch) {
		const [, chatId, topicId] = topicMatch;
		return collectUniqueStrings([`${chatId}:topic:${topicId}`, chatId]);
	}
	const senderMatch = raw.match(/^(.+):sender:([^:]+)$/i);
	if (senderMatch) {
		const [, chatId] = senderMatch;
		return collectUniqueStrings([raw, chatId]);
	}
	return [raw];
}
function resolveGroupContextFromSessionKey(sessionKey) {
	const raw = (sessionKey ?? "").trim();
	if (!raw) return {};
	const { baseSessionKey, threadId } = parseThreadSessionSuffix(raw);
	const conversationKey = threadId ? baseSessionKey : raw;
	const conversation = parseRawSessionConversationRef(conversationKey);
	if (conversation) {
		const resolvedConversation = /:(?:sender|thread|topic):/iu.test(conversation.rawId) ? resolveSessionConversation({
			channel: conversation.channel,
			kind: conversation.kind,
			rawId: conversation.rawId
		}) : null;
		return {
			channel: conversation.channel,
			groupIds: collectUniqueStrings([
				...buildScopedGroupIdCandidates(conversation.rawId),
				resolvedConversation?.id,
				resolvedConversation?.baseConversationId,
				...resolvedConversation?.parentConversationCandidates ?? []
			])
		};
	}
	const parts = (conversationKey ?? raw).split(":").filter(Boolean);
	let body = parts[0] === "agent" ? parts.slice(2) : parts;
	if (body[0] === "subagent") body = body.slice(1);
	if (body.length < 3) return {};
	const [channel, kind, ...rest] = body;
	if (kind !== "group" && kind !== "channel") return {};
	const groupId = rest.join(":").trim();
	if (!groupId) return {};
	return {
		channel: normalizeLowercaseStringOrEmpty(channel),
		groupIds: buildScopedGroupIdCandidates(groupId)
	};
}
function resolveProviderToolPolicy(params) {
	const provider = params.modelProvider?.trim();
	if (!provider || !params.byProvider) return;
	const entries = Object.entries(params.byProvider);
	if (entries.length === 0) return;
	const lookup = /* @__PURE__ */ new Map();
	for (const [key, value] of entries) {
		const normalized = normalizeProviderKey(key);
		if (!normalized) continue;
		lookup.set(normalized, value);
	}
	const normalizedProvider = normalizeProviderKey(provider);
	const rawModelId = normalizeOptionalLowercaseString(params.modelId);
	const fullModelId = rawModelId && !rawModelId.includes("/") ? `${normalizedProvider}/${rawModelId}` : rawModelId;
	const candidates = [...fullModelId ? [fullModelId] : [], normalizedProvider];
	for (const key of candidates) {
		const match = lookup.get(key);
		if (match) return match;
	}
}
function resolveExplicitProfileAlsoAllow(tools) {
	return Array.isArray(tools?.alsoAllow) ? tools.alsoAllow : void 0;
}
function hasExplicitToolSection(section) {
	return section !== void 0 && section !== null;
}
function resolveImplicitProfileAlsoAllow(params) {
	const implicit = /* @__PURE__ */ new Set();
	if (hasExplicitToolSection(params.agentTools?.exec) || hasExplicitToolSection(params.globalTools?.exec)) {
		implicit.add("exec");
		implicit.add("process");
	}
	if (hasExplicitToolSection(params.agentTools?.fs) || hasExplicitToolSection(params.globalTools?.fs)) {
		implicit.add("read");
		implicit.add("write");
		implicit.add("edit");
	}
	return implicit.size > 0 ? Array.from(implicit) : void 0;
}
function resolveEffectiveToolPolicy(params) {
	const agentId = (typeof params.agentId === "string" && params.agentId.trim() ? normalizeAgentId(params.agentId) : void 0) ?? (params.sessionKey ? resolveAgentIdFromSessionKey(params.sessionKey) : void 0);
	const agentTools = (params.config && agentId ? resolveAgentConfig(params.config, agentId) : void 0)?.tools;
	const globalTools = params.config?.tools;
	const profile = agentTools?.profile ?? globalTools?.profile;
	const providerPolicy = resolveProviderToolPolicy({
		byProvider: globalTools?.byProvider,
		modelProvider: params.modelProvider,
		modelId: params.modelId
	});
	const agentProviderPolicy = resolveProviderToolPolicy({
		byProvider: agentTools?.byProvider,
		modelProvider: params.modelProvider,
		modelId: params.modelId
	});
	const explicitProfileAlsoAllow = resolveExplicitProfileAlsoAllow(agentTools) ?? resolveExplicitProfileAlsoAllow(globalTools);
	const implicitProfileAlsoAllow = resolveImplicitProfileAlsoAllow({
		globalTools,
		agentTools
	});
	const profileAlsoAllow = explicitProfileAlsoAllow || implicitProfileAlsoAllow ? Array.from(new Set([...explicitProfileAlsoAllow ?? [], ...implicitProfileAlsoAllow ?? []])) : void 0;
	return {
		agentId,
		globalPolicy: pickSandboxToolPolicy(globalTools),
		globalProviderPolicy: pickSandboxToolPolicy(providerPolicy),
		agentPolicy: pickSandboxToolPolicy(agentTools),
		agentProviderPolicy: pickSandboxToolPolicy(agentProviderPolicy),
		profile,
		providerProfile: agentProviderPolicy?.profile ?? providerPolicy?.profile,
		profileAlsoAllow,
		providerProfileAlsoAllow: Array.isArray(agentProviderPolicy?.alsoAllow) ? agentProviderPolicy?.alsoAllow : Array.isArray(providerPolicy?.alsoAllow) ? providerPolicy?.alsoAllow : void 0
	};
}
function resolveGroupToolPolicy(params) {
	if (!params.config) return;
	const sessionContext = resolveGroupContextFromSessionKey(params.sessionKey);
	const spawnedContext = resolveGroupContextFromSessionKey(params.spawnedBy);
	const groupIds = collectUniqueStrings([
		...buildScopedGroupIdCandidates(params.groupId),
		...sessionContext.groupIds ?? [],
		...spawnedContext.groupIds ?? []
	]);
	if (groupIds.length === 0) return;
	const channel = normalizeMessageChannel(params.messageProvider ?? sessionContext.channel ?? spawnedContext.channel);
	if (!channel) return;
	let plugin;
	try {
		plugin = getChannelPlugin(channel);
	} catch {
		plugin = void 0;
	}
	for (const groupId of groupIds) {
		const toolsConfig = plugin?.groups?.resolveToolPolicy?.({
			cfg: params.config,
			groupId,
			groupChannel: params.groupChannel,
			groupSpace: params.groupSpace,
			accountId: params.accountId,
			senderId: params.senderId,
			senderName: params.senderName,
			senderUsername: params.senderUsername,
			senderE164: params.senderE164
		});
		const policy = pickSandboxToolPolicy(toolsConfig);
		if (policy) return policy;
	}
	return pickSandboxToolPolicy(resolveChannelGroupToolsPolicy({
		cfg: params.config,
		channel,
		groupId: groupIds[0],
		groupIdCandidates: groupIds.slice(1),
		accountId: params.accountId,
		senderId: params.senderId,
		senderName: params.senderName,
		senderUsername: params.senderUsername,
		senderE164: params.senderE164
	}));
}
//#endregion
//#region src/media/read-capability.ts
function isAgentScopedHostMediaReadAllowed(params) {
	if (!resolveEffectiveToolFsRootExpansionAllowed({
		cfg: params.cfg,
		agentId: params.agentId
	})) return false;
	const groupPolicy = resolveGroupToolPolicy({
		config: params.cfg,
		sessionKey: params.sessionKey,
		messageProvider: params.messageProvider,
		groupId: params.groupId,
		groupChannel: params.groupChannel,
		groupSpace: params.groupSpace,
		accountId: params.accountId,
		senderId: normalizeOptionalString(params.requesterSenderId),
		senderName: normalizeOptionalString(params.requesterSenderName),
		senderUsername: normalizeOptionalString(params.requesterSenderUsername),
		senderE164: normalizeOptionalString(params.requesterSenderE164)
	});
	if (groupPolicy && !isToolAllowedByPolicies("read", [groupPolicy])) return false;
	return true;
}
function createAgentScopedHostMediaReadFile(params) {
	if (!isAgentScopedHostMediaReadAllowed(params)) return;
	const workspaceRoot = resolveWorkspaceRoot(params.workspaceDir ?? (params.agentId ? resolveAgentWorkspaceDir(params.cfg, params.agentId) : void 0));
	return async (filePath) => {
		return (await readLocalFileSafely({ filePath: resolvePathFromInput(filePath, workspaceRoot) })).buffer;
	};
}
function resolveAgentScopedOutboundMediaAccess(params) {
	const localRoots = params.mediaAccess?.localRoots ?? getAgentScopedMediaLocalRootsForSources({
		cfg: params.cfg,
		agentId: params.agentId,
		mediaSources: params.mediaSources
	});
	const resolvedWorkspaceDir = params.workspaceDir ?? params.mediaAccess?.workspaceDir ?? (params.agentId ? resolveAgentWorkspaceDir(params.cfg, params.agentId) : void 0);
	const readFile = params.mediaAccess?.readFile ?? params.mediaReadFile ?? createAgentScopedHostMediaReadFile({
		cfg: params.cfg,
		agentId: params.agentId,
		workspaceDir: resolvedWorkspaceDir,
		sessionKey: params.sessionKey,
		messageProvider: params.messageProvider,
		groupId: params.groupId,
		groupChannel: params.groupChannel,
		groupSpace: params.groupSpace,
		accountId: params.accountId,
		requesterSenderId: params.requesterSenderId,
		requesterSenderName: params.requesterSenderName,
		requesterSenderUsername: params.requesterSenderUsername,
		requesterSenderE164: params.requesterSenderE164
	});
	return {
		...localRoots?.length ? { localRoots } : {},
		...readFile ? { readFile } : {},
		...resolvedWorkspaceDir ? { workspaceDir: resolvedWorkspaceDir } : {}
	};
}
//#endregion
//#region src/infra/outbound/abort.ts
/**
* Utility for checking AbortSignal state and throwing a standard AbortError.
*/
/**
* Throws an AbortError if the given signal has been aborted.
* Use at async checkpoints to support cancellation.
*/
function throwIfAborted(abortSignal) {
	if (abortSignal?.aborted) {
		const err = /* @__PURE__ */ new Error("Operation aborted");
		err.name = "AbortError";
		throw err;
	}
}
//#endregion
//#region src/infra/outbound/payloads.ts
function mergeMediaUrls(...lists) {
	const seen = /* @__PURE__ */ new Set();
	const merged = [];
	for (const list of lists) {
		if (!list) continue;
		for (const entry of list) {
			const trimmed = entry?.trim();
			if (!trimmed) continue;
			if (seen.has(trimmed)) continue;
			seen.add(trimmed);
			merged.push(trimmed);
		}
	}
	return merged;
}
function createOutboundPayloadPlanEntry(payload) {
	if (shouldSuppressReasoningPayload(payload)) return null;
	const parsed = parseReplyDirectives(payload.text ?? "");
	const explicitMediaUrls = payload.mediaUrls ?? parsed.mediaUrls;
	const explicitMediaUrl = payload.mediaUrl ?? parsed.mediaUrl;
	const mergedMedia = mergeMediaUrls(explicitMediaUrls, explicitMediaUrl ? [explicitMediaUrl] : void 0);
	if (parsed.isSilent && mergedMedia.length === 0) return null;
	const resolvedMediaUrl = (explicitMediaUrls?.length ?? 0) > 1 ? void 0 : explicitMediaUrl;
	const normalizedPayload = {
		...payload,
		text: formatBtwTextForExternalDelivery({
			...payload,
			text: parsed.text ?? ""
		}) ?? "",
		mediaUrls: mergedMedia.length ? mergedMedia : void 0,
		mediaUrl: resolvedMediaUrl,
		replyToId: payload.replyToId ?? parsed.replyToId,
		replyToTag: payload.replyToTag || parsed.replyToTag,
		replyToCurrent: payload.replyToCurrent || parsed.replyToCurrent,
		audioAsVoice: Boolean(payload.audioAsVoice || parsed.audioAsVoice)
	};
	if (!isRenderablePayload(normalizedPayload)) return null;
	const parts = resolveSendableOutboundReplyParts(normalizedPayload);
	const hasChannelData = hasReplyChannelData(normalizedPayload.channelData);
	return {
		payload: normalizedPayload,
		parts,
		hasInteractive: hasInteractiveReplyBlocks(normalizedPayload.interactive),
		hasChannelData
	};
}
function createOutboundPayloadPlan(payloads) {
	const plan = [];
	for (const payload of payloads) {
		const entry = createOutboundPayloadPlanEntry(payload);
		if (!entry) continue;
		plan.push(entry);
	}
	return plan;
}
function projectOutboundPayloadPlanForDelivery(plan) {
	return plan.map((entry) => entry.payload);
}
function projectOutboundPayloadPlanForOutbound(plan) {
	const normalizedPayloads = [];
	for (const entry of plan) {
		const payload = entry.payload;
		const text = entry.parts.text;
		if (!hasReplyPayloadContent({
			...payload,
			text,
			mediaUrls: entry.parts.mediaUrls
		}, { hasChannelData: entry.hasChannelData })) continue;
		normalizedPayloads.push({
			text,
			mediaUrls: entry.parts.mediaUrls,
			audioAsVoice: payload.audioAsVoice === true ? true : void 0,
			...entry.hasInteractive ? { interactive: payload.interactive } : {},
			...entry.hasChannelData ? { channelData: payload.channelData } : {}
		});
	}
	return normalizedPayloads;
}
function projectOutboundPayloadPlanForJson(plan) {
	const normalized = [];
	for (const entry of plan) {
		const payload = entry.payload;
		normalized.push({
			text: entry.parts.text,
			mediaUrl: payload.mediaUrl ?? null,
			mediaUrls: entry.parts.mediaUrls.length ? entry.parts.mediaUrls : void 0,
			audioAsVoice: payload.audioAsVoice === true ? true : void 0,
			interactive: payload.interactive,
			channelData: payload.channelData
		});
	}
	return normalized;
}
function projectOutboundPayloadPlanForMirror(plan) {
	return {
		text: plan.map((entry) => entry.payload.text).filter((text) => Boolean(text)).join("\n"),
		mediaUrls: plan.flatMap((entry) => entry.parts.mediaUrls)
	};
}
function summarizeOutboundPayloadForTransport(payload) {
	const parts = resolveSendableOutboundReplyParts(payload);
	return {
		text: parts.text,
		mediaUrls: parts.mediaUrls,
		audioAsVoice: payload.audioAsVoice === true ? true : void 0,
		interactive: payload.interactive,
		channelData: payload.channelData
	};
}
function normalizeOutboundPayloadsForJson(payloads) {
	return projectOutboundPayloadPlanForJson(createOutboundPayloadPlan(payloads));
}
function formatOutboundPayloadLog(payload) {
	const lines = [];
	if (payload.text) lines.push(payload.text.trimEnd());
	for (const url of payload.mediaUrls) lines.push(`MEDIA:${url}`);
	return lines.join("\n");
}
//#endregion
//#region src/infra/outbound/deliver.ts
const log = createSubsystemLogger("outbound/deliver");
let transcriptRuntimePromise;
async function loadTranscriptRuntime() {
	transcriptRuntimePromise ??= import("./transcript.runtime-BTL9MViI.js");
	return await transcriptRuntimePromise;
}
let channelBootstrapRuntimePromise;
async function loadChannelBootstrapRuntime() {
	channelBootstrapRuntimePromise ??= import("./channel-bootstrap.runtime-DRHx2KDx.js");
	return await channelBootstrapRuntimePromise;
}
async function createChannelHandler(params) {
	let outbound = await loadChannelOutboundAdapter(params.channel);
	if (!outbound) {
		const { bootstrapOutboundChannelPlugin } = await loadChannelBootstrapRuntime();
		bootstrapOutboundChannelPlugin({
			channel: params.channel,
			cfg: params.cfg
		});
		outbound = await loadChannelOutboundAdapter(params.channel);
	}
	const handler = createPluginHandler({
		...params,
		outbound
	});
	if (!handler) throw new Error(`Outbound not configured for channel: ${params.channel}`);
	return handler;
}
function createPluginHandler(params) {
	const outbound = params.outbound;
	if (!outbound?.sendText) return null;
	const baseCtx = createChannelOutboundContextBase(params);
	const sendText = outbound.sendText;
	const sendMedia = outbound.sendMedia;
	const chunker = outbound.chunker ?? null;
	const chunkerMode = outbound.chunkerMode;
	const resolveCtx = (overrides) => ({
		...baseCtx,
		replyToId: overrides?.replyToId ?? baseCtx.replyToId,
		threadId: overrides?.threadId ?? baseCtx.threadId,
		audioAsVoice: overrides?.audioAsVoice
	});
	return {
		chunker,
		chunkerMode,
		textChunkLimit: outbound.textChunkLimit,
		supportsMedia: Boolean(sendMedia),
		sanitizeText: outbound.sanitizeText ? (payload) => outbound.sanitizeText({
			text: payload.text ?? "",
			payload
		}) : void 0,
		normalizePayload: outbound.normalizePayload ? (payload) => outbound.normalizePayload({ payload }) : void 0,
		shouldSkipPlainTextSanitization: outbound.shouldSkipPlainTextSanitization ? (payload) => outbound.shouldSkipPlainTextSanitization({ payload }) : void 0,
		resolveEffectiveTextChunkLimit: outbound.resolveEffectiveTextChunkLimit ? (fallbackLimit) => outbound.resolveEffectiveTextChunkLimit({
			cfg: params.cfg,
			accountId: params.accountId ?? void 0,
			fallbackLimit
		}) : void 0,
		sendPayload: outbound.sendPayload ? async (payload, overrides) => outbound.sendPayload({
			...resolveCtx(overrides),
			text: payload.text ?? "",
			mediaUrl: payload.mediaUrl,
			payload
		}) : void 0,
		sendFormattedText: outbound.sendFormattedText ? async (text, overrides) => outbound.sendFormattedText({
			...resolveCtx(overrides),
			text
		}) : void 0,
		sendFormattedMedia: outbound.sendFormattedMedia ? async (caption, mediaUrl, overrides) => outbound.sendFormattedMedia({
			...resolveCtx(overrides),
			text: caption,
			mediaUrl
		}) : void 0,
		sendText: async (text, overrides) => sendText({
			...resolveCtx(overrides),
			text
		}),
		sendMedia: async (caption, mediaUrl, overrides) => {
			if (sendMedia) return sendMedia({
				...resolveCtx(overrides),
				text: caption,
				mediaUrl
			});
			return sendText({
				...resolveCtx(overrides),
				text: caption
			});
		}
	};
}
function createChannelOutboundContextBase(params) {
	return {
		cfg: params.cfg,
		to: params.to,
		accountId: params.accountId,
		replyToId: params.replyToId,
		threadId: params.threadId,
		identity: params.identity,
		gifPlayback: params.gifPlayback,
		forceDocument: params.forceDocument,
		deps: params.deps,
		silent: params.silent,
		mediaAccess: params.mediaAccess,
		mediaLocalRoots: params.mediaAccess?.localRoots,
		mediaReadFile: params.mediaAccess?.readFile,
		gatewayClientScopes: params.gatewayClientScopes
	};
}
const isAbortError = (err) => err instanceof Error && err.name === "AbortError";
function collectPayloadMediaSources(plan) {
	return plan.flatMap((entry) => entry.parts.mediaUrls);
}
function normalizeEmptyPayloadForDelivery(payload) {
	const text = typeof payload.text === "string" ? payload.text : "";
	if (!text.trim()) {
		if (!hasReplyPayloadContent({
			...payload,
			text
		})) return null;
		if (text) return {
			...payload,
			text: ""
		};
	}
	return payload;
}
function normalizePayloadsForChannelDelivery(plan, handler) {
	const normalizedPayloads = [];
	for (const payload of projectOutboundPayloadPlanForDelivery(plan)) {
		let sanitizedPayload = payload;
		if (handler.sanitizeText && sanitizedPayload.text) {
			if (!handler.shouldSkipPlainTextSanitization?.(sanitizedPayload)) sanitizedPayload = {
				...sanitizedPayload,
				text: handler.sanitizeText(sanitizedPayload)
			};
		}
		const normalizedPayload = handler.normalizePayload ? handler.normalizePayload(sanitizedPayload) : sanitizedPayload;
		const normalized = normalizedPayload ? normalizeEmptyPayloadForDelivery(normalizedPayload) : null;
		if (normalized) normalizedPayloads.push(normalized);
	}
	return normalizedPayloads;
}
function buildPayloadSummary(payload) {
	return summarizeOutboundPayloadForTransport(payload);
}
function createMessageSentEmitter(params) {
	const hasMessageSentHooks = params.hookRunner?.hasHooks("message_sent") ?? false;
	const canEmitInternalHook = Boolean(params.sessionKeyForInternalHooks);
	const emitMessageSent = (event) => {
		if (!hasMessageSentHooks && !canEmitInternalHook) return;
		const canonical = buildCanonicalSentMessageHookContext({
			to: params.to,
			content: event.content,
			success: event.success,
			error: event.error,
			channelId: params.channel,
			accountId: params.accountId ?? void 0,
			conversationId: params.to,
			messageId: event.messageId,
			isGroup: params.mirrorIsGroup,
			groupId: params.mirrorGroupId
		});
		if (hasMessageSentHooks) fireAndForgetHook(params.hookRunner.runMessageSent(toPluginMessageSentEvent(canonical), toPluginMessageContext(canonical)), "deliverOutboundPayloads: message_sent plugin hook failed", (message) => {
			log.warn(message);
		});
		if (!canEmitInternalHook) return;
		fireAndForgetHook(triggerInternalHook(createInternalHookEvent("message", "sent", params.sessionKeyForInternalHooks, toInternalMessageSentContext(canonical))), "deliverOutboundPayloads: message:sent internal hook failed", (message) => {
			log.warn(message);
		});
	};
	return {
		emitMessageSent,
		hasMessageSentHooks
	};
}
async function applyMessageSendingHook(params) {
	if (!params.enabled) return {
		cancelled: false,
		payload: params.payload,
		payloadSummary: params.payloadSummary
	};
	try {
		const sendingResult = await params.hookRunner.runMessageSending({
			to: params.to,
			content: params.payloadSummary.text,
			metadata: {
				channel: params.channel,
				accountId: params.accountId,
				mediaUrls: params.payloadSummary.mediaUrls
			}
		}, {
			channelId: params.channel,
			accountId: params.accountId ?? void 0
		});
		if (sendingResult?.cancel) return {
			cancelled: true,
			payload: params.payload,
			payloadSummary: params.payloadSummary
		};
		if (sendingResult?.content == null) return {
			cancelled: false,
			payload: params.payload,
			payloadSummary: params.payloadSummary
		};
		return {
			cancelled: false,
			payload: {
				...params.payload,
				text: sendingResult.content
			},
			payloadSummary: {
				...params.payloadSummary,
				text: sendingResult.content
			}
		};
	} catch {
		return {
			cancelled: false,
			payload: params.payload,
			payloadSummary: params.payloadSummary
		};
	}
}
async function deliverOutboundPayloads(params) {
	const { channel, to, payloads } = params;
	const queueId = params.skipQueue ? null : await enqueueDelivery({
		channel,
		to,
		accountId: params.accountId,
		payloads,
		threadId: params.threadId,
		replyToId: params.replyToId,
		bestEffort: params.bestEffort,
		gifPlayback: params.gifPlayback,
		forceDocument: params.forceDocument,
		silent: params.silent,
		mirror: params.mirror,
		gatewayClientScopes: params.gatewayClientScopes
	}).catch(() => null);
	let hadPartialFailure = false;
	const wrappedParams = params.onError ? {
		...params,
		onError: (err, payload) => {
			hadPartialFailure = true;
			params.onError(err, payload);
		}
	} : params;
	try {
		const results = await deliverOutboundPayloadsCore(wrappedParams);
		if (queueId) if (hadPartialFailure) await failDelivery(queueId, "partial delivery failure (bestEffort)").catch(() => {});
		else await ackDelivery(queueId).catch(() => {});
		return results;
	} catch (err) {
		if (queueId) if (isAbortError(err)) await ackDelivery(queueId).catch(() => {});
		else await failDelivery(queueId, formatErrorMessage(err)).catch(() => {});
		throw err;
	}
}
/** Core delivery logic (extracted for queue wrapper). */
async function deliverOutboundPayloadsCore(params) {
	const { cfg, channel, to, payloads } = params;
	const outboundPayloadPlan = createOutboundPayloadPlan(payloads);
	const accountId = params.accountId;
	const deps = params.deps;
	const abortSignal = params.abortSignal;
	const mediaAccess = resolveAgentScopedOutboundMediaAccess({
		cfg,
		agentId: params.session?.agentId ?? params.mirror?.agentId,
		mediaSources: collectPayloadMediaSources(outboundPayloadPlan),
		sessionKey: params.session?.key,
		messageProvider: params.session?.key ? void 0 : channel,
		accountId: params.session?.requesterAccountId ?? accountId,
		requesterSenderId: params.session?.requesterSenderId,
		requesterSenderName: params.session?.requesterSenderName,
		requesterSenderUsername: params.session?.requesterSenderUsername,
		requesterSenderE164: params.session?.requesterSenderE164
	});
	const results = [];
	const handler = await createChannelHandler({
		cfg,
		channel,
		to,
		deps,
		accountId,
		replyToId: params.replyToId,
		threadId: params.threadId,
		identity: params.identity,
		gifPlayback: params.gifPlayback,
		forceDocument: params.forceDocument,
		silent: params.silent,
		mediaAccess,
		gatewayClientScopes: params.gatewayClientScopes
	});
	const configuredTextLimit = handler.chunker ? resolveTextChunkLimit(cfg, channel, accountId, { fallbackLimit: handler.textChunkLimit }) : void 0;
	const textLimit = handler.resolveEffectiveTextChunkLimit ? handler.resolveEffectiveTextChunkLimit(configuredTextLimit) : configuredTextLimit;
	const chunkMode = handler.chunker ? resolveChunkMode(cfg, channel, accountId) : "length";
	const sendTextChunks = async (text, overrides) => {
		throwIfAborted(abortSignal);
		if (!handler.chunker || textLimit === void 0) {
			results.push(await handler.sendText(text, overrides));
			return;
		}
		if (chunkMode === "newline") {
			const blockChunks = (handler.chunkerMode ?? "text") === "markdown" ? chunkMarkdownTextWithMode(text, textLimit, "newline") : chunkByParagraph(text, textLimit);
			if (!blockChunks.length && text) blockChunks.push(text);
			for (const blockChunk of blockChunks) {
				const chunks = handler.chunker(blockChunk, textLimit);
				if (!chunks.length && blockChunk) chunks.push(blockChunk);
				for (const chunk of chunks) {
					throwIfAborted(abortSignal);
					results.push(await handler.sendText(chunk, overrides));
				}
			}
			return;
		}
		const chunks = handler.chunker(text, textLimit);
		for (const chunk of chunks) {
			throwIfAborted(abortSignal);
			results.push(await handler.sendText(chunk, overrides));
		}
	};
	const normalizedPayloads = normalizePayloadsForChannelDelivery(outboundPayloadPlan, handler);
	const hookRunner = getGlobalHookRunner();
	const sessionKeyForInternalHooks = params.mirror?.sessionKey ?? params.session?.key;
	const mirrorIsGroup = params.mirror?.isGroup;
	const mirrorGroupId = params.mirror?.groupId;
	const { emitMessageSent, hasMessageSentHooks } = createMessageSentEmitter({
		hookRunner,
		channel,
		to,
		accountId,
		sessionKeyForInternalHooks,
		mirrorIsGroup,
		mirrorGroupId
	});
	const hasMessageSendingHooks = hookRunner?.hasHooks("message_sending") ?? false;
	if (hasMessageSentHooks && params.session?.agentId && !sessionKeyForInternalHooks) log.warn("deliverOutboundPayloads: session.agentId present without session key; internal message:sent hook will be skipped", {
		channel,
		to,
		agentId: params.session.agentId
	});
	for (const payload of normalizedPayloads) {
		let payloadSummary = buildPayloadSummary(payload);
		try {
			throwIfAborted(abortSignal);
			const hookResult = await applyMessageSendingHook({
				hookRunner,
				enabled: hasMessageSendingHooks,
				payload,
				payloadSummary,
				to,
				channel,
				accountId
			});
			if (hookResult.cancelled) continue;
			const effectivePayload = hookResult.payload;
			payloadSummary = hookResult.payloadSummary;
			params.onPayload?.(payloadSummary);
			const sendOverrides = {
				replyToId: effectivePayload.replyToId ?? params.replyToId ?? void 0,
				threadId: params.threadId ?? void 0,
				audioAsVoice: effectivePayload.audioAsVoice === true ? true : void 0,
				forceDocument: params.forceDocument
			};
			if (handler.sendPayload && hasReplyPayloadContent({
				interactive: effectivePayload.interactive,
				channelData: effectivePayload.channelData
			})) {
				const delivery = await handler.sendPayload(effectivePayload, sendOverrides);
				results.push(delivery);
				emitMessageSent({
					success: true,
					content: payloadSummary.text,
					messageId: delivery.messageId
				});
				continue;
			}
			if (payloadSummary.mediaUrls.length === 0) {
				const beforeCount = results.length;
				if (handler.sendFormattedText) results.push(...await handler.sendFormattedText(payloadSummary.text, sendOverrides));
				else await sendTextChunks(payloadSummary.text, sendOverrides);
				const messageId = results.at(-1)?.messageId;
				emitMessageSent({
					success: results.length > beforeCount,
					content: payloadSummary.text,
					messageId
				});
				continue;
			}
			if (!handler.supportsMedia) {
				log.warn("Plugin outbound adapter does not implement sendMedia; media URLs will be dropped and text fallback will be used", {
					channel,
					to,
					mediaCount: payloadSummary.mediaUrls.length
				});
				const fallbackText = payloadSummary.text.trim();
				if (!fallbackText) throw new Error("Plugin outbound adapter does not implement sendMedia and no text fallback is available for media payload");
				const beforeCount = results.length;
				await sendTextChunks(fallbackText, sendOverrides);
				const messageId = results.at(-1)?.messageId;
				emitMessageSent({
					success: results.length > beforeCount,
					content: payloadSummary.text,
					messageId
				});
				continue;
			}
			let lastMessageId;
			await sendMediaWithLeadingCaption({
				mediaUrls: payloadSummary.mediaUrls,
				caption: payloadSummary.text,
				send: async ({ mediaUrl, caption }) => {
					throwIfAborted(abortSignal);
					if (handler.sendFormattedMedia) {
						const delivery = await handler.sendFormattedMedia(caption ?? "", mediaUrl, sendOverrides);
						results.push(delivery);
						lastMessageId = delivery.messageId;
						return;
					}
					const delivery = await handler.sendMedia(caption ?? "", mediaUrl, sendOverrides);
					results.push(delivery);
					lastMessageId = delivery.messageId;
				}
			});
			emitMessageSent({
				success: true,
				content: payloadSummary.text,
				messageId: lastMessageId
			});
		} catch (err) {
			emitMessageSent({
				success: false,
				content: payloadSummary.text,
				error: formatErrorMessage(err)
			});
			if (!params.bestEffort) throw err;
			params.onError?.(err, payloadSummary);
		}
	}
	if (params.mirror && results.length > 0) {
		const mirrorText = resolveMirroredTranscriptText({
			text: params.mirror.text,
			mediaUrls: params.mirror.mediaUrls
		});
		if (mirrorText) {
			const { appendAssistantMessageToSessionTranscript } = await loadTranscriptRuntime();
			await appendAssistantMessageToSessionTranscript({
				agentId: params.mirror.agentId,
				sessionKey: params.mirror.sessionKey,
				text: mirrorText,
				idempotencyKey: params.mirror.idempotencyKey
			});
		}
	}
	return results;
}
//#endregion
export { resolveWorkspaceRoot as _, projectOutboundPayloadPlanForDelivery as a, toRelativeWorkspacePath as b, projectOutboundPayloadPlanForOutbound as c, filterToolsByPolicy as d, resolveEffectiveToolPolicy as f, normalizeWorkspaceDir as g, resolveSubagentToolPolicyForSession as h, normalizeOutboundPayloadsForJson as i, throwIfAborted as l, resolveSubagentToolPolicy as m, createOutboundPayloadPlan as n, projectOutboundPayloadPlanForJson as o, resolveGroupToolPolicy as p, formatOutboundPayloadLog as r, projectOutboundPayloadPlanForMirror as s, deliverOutboundPayloads as t, resolveAgentScopedOutboundMediaAccess as u, resolvePathFromInput as v, parseReplyDirectives as x, toRelativeSandboxPath as y };
