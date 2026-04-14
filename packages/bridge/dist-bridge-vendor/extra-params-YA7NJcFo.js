import { d as readStringValue, i as normalizeLowercaseStringOrEmpty, s as normalizeOptionalString } from "./string-coerce-D8LAEut5.js";
import "./provider-attribution-Bko9o5XK.js";
import { Q as wrapProviderStreamFn, S as prepareProviderExtraParams } from "./provider-runtime-ljZXzW8q.js";
import { c as extractToolCallsFromAssistant, l as extractToolResultId } from "./pi-embedded-helpers-x9Tf7Zu1.js";
import { t as log } from "./logger-BPvqlpKv.js";
import { r as streamWithPayloadPatch } from "./moonshot-thinking-stream-wrappers-C4bDf5Fw.js";
import { g as createOpenAIStringContentWrapper, m as createOpenAIResponsesContextManagementWrapper, n as createOpenRouterSystemCacheWrapper, o as createMinimaxThinkingDisabledWrapper, s as createGoogleThinkingPayloadWrapper } from "./proxy-stream-wrappers-RbfEPGsk.js";
import { i as resolveAnthropicCacheRetentionFamily } from "./anthropic-cache-control-payload-D_-HldFv.js";
import { streamSimple } from "@mariozechner/pi-ai";
//#region src/agents/session-transcript-repair.ts
const TOOL_CALL_NAME_MAX_CHARS = 64;
const TOOL_CALL_NAME_RE = /^[A-Za-z0-9_:.-]+$/;
const REDACTED_SESSIONS_SPAWN_ATTACHMENT_CONTENT = "__OPENCLAW_REDACTED__";
const SESSIONS_SPAWN_ATTACHMENT_METADATA_KEYS = [
	"name",
	"encoding",
	"mimeType"
];
function isThinkingLikeBlock(block) {
	if (!block || typeof block !== "object") return false;
	const type = block.type;
	return type === "thinking" || type === "redacted_thinking";
}
function isRawToolCallBlock(block) {
	if (!block || typeof block !== "object") return false;
	const type = block.type;
	return typeof type === "string" && (type === "toolCall" || type === "toolUse" || type === "functionCall");
}
function hasToolCallInput(block) {
	const hasInput = "input" in block ? block.input !== void 0 && block.input !== null : false;
	const hasArguments = "arguments" in block ? block.arguments !== void 0 && block.arguments !== null : false;
	return hasInput || hasArguments;
}
function hasNonEmptyStringField(value) {
	return typeof value === "string" && value.trim().length > 0;
}
function hasToolCallId(block) {
	return hasNonEmptyStringField(block.id);
}
function normalizeAllowedToolNames(allowedToolNames) {
	if (!allowedToolNames) return null;
	const normalized = /* @__PURE__ */ new Set();
	for (const name of allowedToolNames) {
		if (typeof name !== "string") continue;
		const trimmed = name.trim();
		if (trimmed) normalized.add(normalizeLowercaseStringOrEmpty(trimmed));
	}
	return normalized.size > 0 ? normalized : null;
}
function hasToolCallName(block, allowedToolNames) {
	if (typeof block.name !== "string") return false;
	const trimmed = block.name.trim();
	if (!trimmed) return false;
	if (trimmed.length > TOOL_CALL_NAME_MAX_CHARS || !TOOL_CALL_NAME_RE.test(trimmed)) return false;
	if (!allowedToolNames) return true;
	return allowedToolNames.has(normalizeLowercaseStringOrEmpty(trimmed));
}
function redactSessionsSpawnAttachmentsArgs(value) {
	if (!value || typeof value !== "object") return value;
	const rec = value;
	const raw = rec.attachments;
	if (!Array.isArray(raw)) return value;
	let changed = false;
	const next = raw.map((item) => {
		if (isRedactedSessionsSpawnAttachment(item)) return item;
		changed = true;
		return redactSessionsSpawnAttachment(item);
	});
	if (!changed) return value;
	return {
		...rec,
		attachments: next
	};
}
function redactSessionsSpawnAttachment(item) {
	const next = { content: REDACTED_SESSIONS_SPAWN_ATTACHMENT_CONTENT };
	if (!item || typeof item !== "object") return next;
	const attachment = item;
	for (const key of SESSIONS_SPAWN_ATTACHMENT_METADATA_KEYS) {
		const value = attachment[key];
		if (typeof value === "string" && value.trim().length > 0) next[key] = value;
	}
	return next;
}
function isRedactedSessionsSpawnAttachment(item) {
	if (!item || typeof item !== "object") return false;
	const attachment = item;
	if (attachment.content !== REDACTED_SESSIONS_SPAWN_ATTACHMENT_CONTENT) return false;
	for (const key of Object.keys(attachment)) {
		if (key === "content") continue;
		if (!SESSIONS_SPAWN_ATTACHMENT_METADATA_KEYS.includes(key)) return false;
		if (typeof attachment[key] !== "string" || attachment[key].trim().length === 0) return false;
	}
	return true;
}
function sanitizeToolCallBlock(block) {
	const rawName = readStringValue(block.name);
	const trimmedName = rawName?.trim();
	const hasTrimmedName = typeof trimmedName === "string" && trimmedName.length > 0;
	const normalizedName = hasTrimmedName ? trimmedName : void 0;
	const nameChanged = hasTrimmedName && rawName !== trimmedName;
	if (!(normalizeLowercaseStringOrEmpty(normalizedName) === "sessions_spawn")) {
		if (!nameChanged) return block;
		return {
			...block,
			name: normalizedName
		};
	}
	const nextArgs = redactSessionsSpawnAttachmentsArgs(block.arguments);
	const nextInput = redactSessionsSpawnAttachmentsArgs(block.input);
	if (nextArgs === block.arguments && nextInput === block.input && !nameChanged) return block;
	const next = { ...block };
	if (nameChanged && normalizedName) next.name = normalizedName;
	if (nextArgs !== block.arguments || Object.hasOwn(block, "arguments")) next.arguments = nextArgs;
	if (nextInput !== block.input || Object.hasOwn(block, "input")) next.input = nextInput;
	return next;
}
function countRawToolCallBlocks(content) {
	let count = 0;
	for (const block of content) if (isRawToolCallBlock(block)) count += 1;
	return count;
}
function isReplaySafeThinkingAssistantTurn(content, allowedToolNames) {
	let sawToolCall = false;
	const seenToolCallIds = /* @__PURE__ */ new Set();
	for (const block of content) {
		if (!isRawToolCallBlock(block)) continue;
		sawToolCall = true;
		const toolCallId = typeof block.id === "string" ? block.id.trim() : "";
		if (!hasToolCallInput(block) || !toolCallId || seenToolCallIds.has(toolCallId) || !hasToolCallName(block, allowedToolNames)) return false;
		seenToolCallIds.add(toolCallId);
		if (sanitizeToolCallBlock(block) !== block) return false;
	}
	return sawToolCall;
}
function makeMissingToolResult(params) {
	return {
		role: "toolResult",
		toolCallId: params.toolCallId,
		toolName: params.toolName ?? "unknown",
		content: [{
			type: "text",
			text: "[openclaw] missing tool result in session history; inserted synthetic error result for transcript repair."
		}],
		isError: true,
		timestamp: Date.now()
	};
}
function normalizeToolResultName(message, fallbackName) {
	const rawToolName = message.toolName;
	const normalizedToolName = normalizeOptionalString(rawToolName);
	if (normalizedToolName) {
		if (rawToolName === normalizedToolName) return message;
		return {
			...message,
			toolName: normalizedToolName
		};
	}
	const normalizedFallback = normalizeOptionalString(fallbackName);
	if (normalizedFallback) return {
		...message,
		toolName: normalizedFallback
	};
	if (typeof rawToolName === "string") return {
		...message,
		toolName: "unknown"
	};
	return message;
}
function stripToolResultDetails(messages) {
	let touched = false;
	const out = [];
	for (const msg of messages) {
		if (!msg || typeof msg !== "object" || msg.role !== "toolResult") {
			out.push(msg);
			continue;
		}
		if (!("details" in msg)) {
			out.push(msg);
			continue;
		}
		const sanitized = { ...msg };
		delete sanitized.details;
		touched = true;
		out.push(sanitized);
	}
	return touched ? out : messages;
}
function repairToolCallInputs(messages, options) {
	let droppedToolCalls = 0;
	let droppedAssistantMessages = 0;
	let changed = false;
	const out = [];
	const allowedToolNames = normalizeAllowedToolNames(options?.allowedToolNames);
	const allowProviderOwnedThinkingReplay = options?.allowProviderOwnedThinkingReplay === true;
	const claimedReplaySafeToolCallIds = /* @__PURE__ */ new Set();
	for (const msg of messages) {
		if (!msg || typeof msg !== "object") {
			out.push(msg);
			continue;
		}
		if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
			out.push(msg);
			continue;
		}
		if (allowProviderOwnedThinkingReplay && msg.content.some((block) => isThinkingLikeBlock(block)) && countRawToolCallBlocks(msg.content) > 0) {
			const replaySafeToolCalls = extractToolCallsFromAssistant(msg);
			if (isReplaySafeThinkingAssistantTurn(msg.content, allowedToolNames) && replaySafeToolCalls.every((toolCall) => !claimedReplaySafeToolCallIds.has(toolCall.id))) {
				for (const toolCall of replaySafeToolCalls) claimedReplaySafeToolCallIds.add(toolCall.id);
				out.push(msg);
			} else {
				droppedToolCalls += countRawToolCallBlocks(msg.content);
				droppedAssistantMessages += 1;
				changed = true;
			}
			continue;
		}
		const nextContent = [];
		let droppedInMessage = 0;
		let messageChanged = false;
		for (const block of msg.content) {
			if (isRawToolCallBlock(block) && (!hasToolCallInput(block) || !hasToolCallId(block) || !hasToolCallName(block, allowedToolNames))) {
				droppedToolCalls += 1;
				droppedInMessage += 1;
				changed = true;
				messageChanged = true;
				continue;
			}
			if (isRawToolCallBlock(block)) {
				if (block.type === "toolCall" || block.type === "toolUse" || block.type === "functionCall") {
					if (normalizeLowercaseStringOrEmpty(typeof block.name === "string" ? block.name.trim() : void 0) === "sessions_spawn") {
						const sanitized = sanitizeToolCallBlock(block);
						if (sanitized !== block) {
							changed = true;
							messageChanged = true;
						}
						nextContent.push(sanitized);
					} else if (typeof block.name === "string") {
						const rawName = block.name;
						const trimmedName = rawName.trim();
						if (rawName !== trimmedName && trimmedName) {
							const renamed = {
								...block,
								name: trimmedName
							};
							nextContent.push(renamed);
							changed = true;
							messageChanged = true;
						} else nextContent.push(block);
					} else nextContent.push(block);
					continue;
				}
			} else nextContent.push(block);
		}
		if (droppedInMessage > 0) {
			if (nextContent.length === 0) {
				droppedAssistantMessages += 1;
				changed = true;
				continue;
			}
			out.push({
				...msg,
				content: nextContent
			});
			continue;
		}
		if (messageChanged) {
			out.push({
				...msg,
				content: nextContent
			});
			continue;
		}
		out.push(msg);
	}
	return {
		messages: changed ? out : messages,
		droppedToolCalls,
		droppedAssistantMessages
	};
}
function sanitizeToolCallInputs(messages, options) {
	return repairToolCallInputs(messages, options).messages;
}
function sanitizeToolUseResultPairing(messages, options) {
	return repairToolUseResultPairing(messages, options).messages;
}
function shouldDropErroredAssistantResults(options) {
	return options?.erroredAssistantResultPolicy === "drop";
}
function repairToolUseResultPairing(messages, options) {
	const out = [];
	const added = [];
	const seenToolResultIds = /* @__PURE__ */ new Set();
	let droppedDuplicateCount = 0;
	let droppedOrphanCount = 0;
	let moved = false;
	let changed = false;
	const pushToolResult = (msg) => {
		const id = extractToolResultId(msg);
		if (id && seenToolResultIds.has(id)) {
			droppedDuplicateCount += 1;
			changed = true;
			return;
		}
		if (id) seenToolResultIds.add(id);
		out.push(msg);
	};
	for (let i = 0; i < messages.length; i += 1) {
		const msg = messages[i];
		if (!msg || typeof msg !== "object") {
			out.push(msg);
			continue;
		}
		const role = msg.role;
		if (role !== "assistant") {
			if (role !== "toolResult") out.push(msg);
			else {
				droppedOrphanCount += 1;
				changed = true;
			}
			continue;
		}
		const assistant = msg;
		const toolCalls = extractToolCallsFromAssistant(assistant);
		if (toolCalls.length === 0) {
			out.push(msg);
			continue;
		}
		const toolCallIds = new Set(toolCalls.map((t) => t.id));
		const toolCallNamesById = new Map(toolCalls.map((t) => [t.id, t.name]));
		const spanResultsById = /* @__PURE__ */ new Map();
		const remainder = [];
		let j = i + 1;
		for (; j < messages.length; j += 1) {
			const next = messages[j];
			if (!next || typeof next !== "object") {
				remainder.push(next);
				continue;
			}
			const nextRole = next.role;
			if (nextRole === "assistant") break;
			if (nextRole === "toolResult") {
				const toolResult = next;
				const id = extractToolResultId(toolResult);
				if (id && toolCallIds.has(id)) {
					if (seenToolResultIds.has(id)) {
						droppedDuplicateCount += 1;
						changed = true;
						continue;
					}
					const normalizedToolResult = normalizeToolResultName(toolResult, toolCallNamesById.get(id));
					if (normalizedToolResult !== toolResult) changed = true;
					if (!spanResultsById.has(id)) spanResultsById.set(id, normalizedToolResult);
					continue;
				}
			}
			if (nextRole !== "toolResult") remainder.push(next);
			else {
				droppedOrphanCount += 1;
				changed = true;
			}
		}
		const stopReason = assistant.stopReason;
		if (stopReason === "error" || stopReason === "aborted") {
			out.push(msg);
			if (!shouldDropErroredAssistantResults(options)) for (const toolCall of toolCalls) {
				const result = spanResultsById.get(toolCall.id);
				if (!result) continue;
				pushToolResult(result);
			}
			else if (spanResultsById.size > 0) changed = true;
			for (const rem of remainder) out.push(rem);
			i = j - 1;
			continue;
		}
		out.push(msg);
		if (spanResultsById.size > 0 && remainder.length > 0) {
			moved = true;
			changed = true;
		}
		for (const call of toolCalls) {
			const existing = spanResultsById.get(call.id);
			if (existing) pushToolResult(existing);
			else {
				const missing = makeMissingToolResult({
					toolCallId: call.id,
					toolName: call.name
				});
				added.push(missing);
				changed = true;
				pushToolResult(missing);
			}
		}
		for (const rem of remainder) {
			if (!rem || typeof rem !== "object") {
				out.push(rem);
				continue;
			}
			out.push(rem);
		}
		i = j - 1;
	}
	const changedOrMoved = changed || moved;
	return {
		messages: changedOrMoved ? out : messages,
		added,
		droppedDuplicateCount,
		droppedOrphanCount,
		moved: changedOrMoved
	};
}
//#endregion
//#region src/agents/pi-embedded-runner/prompt-cache-retention.ts
function isGooglePromptCacheEligible(params) {
	if (params.modelApi !== "google-generative-ai") return false;
	const normalizedModelId = normalizeLowercaseStringOrEmpty(params.modelId);
	return normalizedModelId.startsWith("gemini-2.5") || normalizedModelId.startsWith("gemini-3");
}
function resolveCacheRetention(extraParams, provider, modelApi, modelId) {
	const family = resolveAnthropicCacheRetentionFamily({
		provider,
		modelApi,
		modelId,
		hasExplicitCacheConfig: extraParams?.cacheRetention !== void 0 || extraParams?.cacheControlTtl !== void 0
	});
	const googleEligible = isGooglePromptCacheEligible({
		modelApi,
		modelId
	});
	if (!family && !googleEligible) return;
	const newVal = extraParams?.cacheRetention;
	if (newVal === "none" || newVal === "short" || newVal === "long") return newVal;
	const legacy = extraParams?.cacheControlTtl;
	if (legacy === "5m") return "short";
	if (legacy === "1h") return "long";
	return family === "anthropic-direct" ? "short" : void 0;
}
//#endregion
//#region src/agents/pi-embedded-runner/moonshot-stream-wrappers.ts
function shouldApplySiliconFlowThinkingOffCompat(params) {
	return params.provider === "siliconflow" && params.thinkingLevel === "off" && params.modelId.startsWith("Pro/");
}
function createSiliconFlowThinkingWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
		if (payloadObj.thinking === "off") payloadObj.thinking = null;
	});
}
const providerRuntimeDeps = {
	prepareProviderExtraParams,
	wrapProviderStreamFn
};
/**
* Resolve provider-specific extra params from model config.
* Used to pass through stream params like temperature/maxTokens.
*
* @internal Exported for testing only
*/
function resolveExtraParams(params) {
	const defaultParams = params.cfg?.agents?.defaults?.params ?? void 0;
	const modelKey = `${params.provider}/${params.modelId}`;
	const modelConfig = params.cfg?.agents?.defaults?.models?.[modelKey];
	const globalParams = modelConfig?.params ? { ...modelConfig.params } : void 0;
	const agentParams = params.agentId && params.cfg?.agents?.list ? params.cfg.agents.list.find((agent) => agent.id === params.agentId)?.params : void 0;
	const merged = Object.assign({}, defaultParams, globalParams, agentParams);
	const resolvedParallelToolCalls = resolveAliasedParamValue([
		defaultParams,
		globalParams,
		agentParams
	], "parallel_tool_calls", "parallelToolCalls");
	if (resolvedParallelToolCalls !== void 0) {
		merged.parallel_tool_calls = resolvedParallelToolCalls;
		delete merged.parallelToolCalls;
	}
	const resolvedTextVerbosity = resolveAliasedParamValue([globalParams, agentParams], "text_verbosity", "textVerbosity");
	if (resolvedTextVerbosity !== void 0) {
		merged.text_verbosity = resolvedTextVerbosity;
		delete merged.textVerbosity;
	}
	const resolvedCachedContent = resolveAliasedParamValue([
		defaultParams,
		globalParams,
		agentParams
	], "cached_content", "cachedContent");
	if (resolvedCachedContent !== void 0) {
		merged.cachedContent = resolvedCachedContent;
		delete merged.cached_content;
	}
	applyDefaultOpenAIGptRuntimeParams(params, merged);
	return Object.keys(merged).length > 0 ? merged : void 0;
}
function resolveSupportedTransport(value) {
	return value === "sse" || value === "websocket" || value === "auto" ? value : void 0;
}
function hasExplicitTransportSetting(settings) {
	return Object.hasOwn(settings, "transport");
}
function resolvePreparedExtraParams(params) {
	const resolvedExtraParams = params.resolvedExtraParams ?? resolveExtraParams({
		cfg: params.cfg,
		provider: params.provider,
		modelId: params.modelId,
		agentId: params.agentId
	});
	const override = params.extraParamsOverride && Object.keys(params.extraParamsOverride).length > 0 ? sanitizeExtraParamsRecord(Object.fromEntries(Object.entries(params.extraParamsOverride).filter(([, value]) => value !== void 0))) : void 0;
	const merged = {
		...sanitizeExtraParamsRecord(resolvedExtraParams),
		...override
	};
	const resolvedCachedContent = resolveAliasedParamValue([resolvedExtraParams, override], "cached_content", "cachedContent");
	if (resolvedCachedContent !== void 0) {
		merged.cachedContent = resolvedCachedContent;
		delete merged.cached_content;
	}
	return providerRuntimeDeps.prepareProviderExtraParams({
		provider: params.provider,
		config: params.cfg,
		context: {
			config: params.cfg,
			provider: params.provider,
			modelId: params.modelId,
			extraParams: merged,
			thinkingLevel: params.thinkingLevel
		}
	}) ?? merged;
}
function sanitizeExtraParamsRecord(value) {
	if (!value) return;
	return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "__proto__" && key !== "prototype" && key !== "constructor"));
}
function shouldApplyDefaultOpenAIGptRuntimeParams(params) {
	if (params.provider !== "openai" && params.provider !== "openai-codex") return false;
	return /^gpt-5(?:[.-]|$)/i.test(params.modelId);
}
function applyDefaultOpenAIGptRuntimeParams(params, merged) {
	if (!shouldApplyDefaultOpenAIGptRuntimeParams(params)) return;
	if (!Object.hasOwn(merged, "parallel_tool_calls") && !Object.hasOwn(merged, "parallelToolCalls")) merged.parallel_tool_calls = true;
	if (!Object.hasOwn(merged, "text_verbosity") && !Object.hasOwn(merged, "textVerbosity")) merged.text_verbosity = "low";
	if (!Object.hasOwn(merged, "openaiWsWarmup")) merged.openaiWsWarmup = true;
}
function resolveAgentTransportOverride(params) {
	const globalSettings = params.settingsManager.getGlobalSettings();
	const projectSettings = params.settingsManager.getProjectSettings();
	if (hasExplicitTransportSetting(globalSettings) || hasExplicitTransportSetting(projectSettings)) return;
	return resolveSupportedTransport(params.effectiveExtraParams?.transport);
}
function createStreamFnWithExtraParams(baseStreamFn, extraParams, provider, model) {
	if (!extraParams || Object.keys(extraParams).length === 0) return;
	const streamParams = {};
	if (typeof extraParams.temperature === "number") streamParams.temperature = extraParams.temperature;
	if (typeof extraParams.maxTokens === "number") streamParams.maxTokens = extraParams.maxTokens;
	const transport = resolveSupportedTransport(extraParams.transport);
	if (transport) streamParams.transport = transport;
	else if (extraParams.transport != null) {
		const transportSummary = typeof extraParams.transport === "string" ? extraParams.transport : typeof extraParams.transport;
		log.warn(`ignoring invalid transport param: ${transportSummary}`);
	}
	if (typeof extraParams.openaiWsWarmup === "boolean") streamParams.openaiWsWarmup = extraParams.openaiWsWarmup;
	const cachedContent = typeof extraParams.cachedContent === "string" ? extraParams.cachedContent : typeof extraParams.cached_content === "string" ? extraParams.cached_content : void 0;
	if (typeof cachedContent === "string" && cachedContent.trim()) streamParams.cachedContent = cachedContent.trim();
	const initialCacheRetention = resolveCacheRetention(extraParams, provider, typeof model?.api === "string" ? model.api : void 0, typeof model?.id === "string" ? model.id : void 0);
	if (Object.keys(streamParams).length > 0 || initialCacheRetention) {
		const debugParams = initialCacheRetention ? {
			...streamParams,
			cacheRetention: initialCacheRetention
		} : streamParams;
		log.debug(`creating streamFn wrapper with params: ${JSON.stringify(debugParams)}`);
	}
	const underlying = baseStreamFn ?? streamSimple;
	const wrappedStreamFn = (callModel, context, options) => {
		const cacheRetention = resolveCacheRetention(extraParams, provider, typeof callModel.api === "string" ? callModel.api : void 0, typeof callModel.id === "string" ? callModel.id : void 0);
		if (Object.keys(streamParams).length === 0 && !cacheRetention) return underlying(callModel, context, options);
		return underlying(callModel, context, {
			...streamParams,
			...cacheRetention ? { cacheRetention } : {},
			...options
		});
	};
	return wrappedStreamFn;
}
function resolveAliasedParamValue(sources, snakeCaseKey, camelCaseKey) {
	let resolved = void 0;
	let seen = false;
	for (const source of sources) {
		if (!source) continue;
		const hasSnakeCaseKey = Object.hasOwn(source, snakeCaseKey);
		if (!hasSnakeCaseKey && !Object.hasOwn(source, camelCaseKey)) continue;
		resolved = hasSnakeCaseKey ? source[snakeCaseKey] : source[camelCaseKey];
		seen = true;
	}
	return seen ? resolved : void 0;
}
function createParallelToolCallsWrapper(baseStreamFn, enabled) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		if (model.api !== "openai-completions" && model.api !== "openai-responses" && model.api !== "azure-openai-responses") return underlying(model, context, options);
		log.debug(`applying parallel_tool_calls=${enabled} for ${model.provider ?? "unknown"}/${model.id ?? "unknown"} api=${model.api}`);
		return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
			payloadObj.parallel_tool_calls = enabled;
		});
	};
}
function applyPrePluginStreamWrappers(ctx) {
	const wrappedStreamFn = createStreamFnWithExtraParams(ctx.agent.streamFn, ctx.effectiveExtraParams, ctx.provider, ctx.model);
	if (wrappedStreamFn) {
		log.debug(`applying extraParams to agent streamFn for ${ctx.provider}/${ctx.modelId}`);
		ctx.agent.streamFn = wrappedStreamFn;
	}
	if (shouldApplySiliconFlowThinkingOffCompat({
		provider: ctx.provider,
		modelId: ctx.modelId,
		thinkingLevel: ctx.thinkingLevel
	})) {
		log.debug(`normalizing thinking=off to thinking=null for SiliconFlow compatibility (${ctx.provider}/${ctx.modelId})`);
		ctx.agent.streamFn = createSiliconFlowThinkingWrapper(ctx.agent.streamFn);
	}
}
function applyPostPluginStreamWrappers(ctx) {
	ctx.agent.streamFn = createOpenRouterSystemCacheWrapper(ctx.agent.streamFn);
	ctx.agent.streamFn = createOpenAIStringContentWrapper(ctx.agent.streamFn);
	if (!ctx.providerWrapperHandled) {
		ctx.agent.streamFn = createGoogleThinkingPayloadWrapper(ctx.agent.streamFn, ctx.thinkingLevel);
		ctx.agent.streamFn = createOpenAIResponsesContextManagementWrapper(ctx.agent.streamFn, ctx.effectiveExtraParams);
	}
	ctx.agent.streamFn = createMinimaxThinkingDisabledWrapper(ctx.agent.streamFn);
	const rawParallelToolCalls = resolveAliasedParamValue([ctx.resolvedExtraParams, ctx.override], "parallel_tool_calls", "parallelToolCalls");
	if (rawParallelToolCalls === void 0) return;
	if (typeof rawParallelToolCalls === "boolean") {
		ctx.agent.streamFn = createParallelToolCallsWrapper(ctx.agent.streamFn, rawParallelToolCalls);
		return;
	}
	if (rawParallelToolCalls === null) {
		log.debug("parallel_tool_calls suppressed by null override, skipping injection");
		return;
	}
	const summary = typeof rawParallelToolCalls === "string" ? rawParallelToolCalls : typeof rawParallelToolCalls;
	log.warn(`ignoring invalid parallel_tool_calls param: ${summary}`);
}
/**
* Apply extra params (like temperature) to an agent's streamFn.
* Also applies verified provider-specific request wrappers, such as OpenRouter attribution.
*
* @internal Exported for testing
*/
function applyExtraParamsToAgent(agent, cfg, provider, modelId, extraParamsOverride, thinkingLevel, agentId, workspaceDir, model, agentDir) {
	const resolvedExtraParams = resolveExtraParams({
		cfg,
		provider,
		modelId,
		agentId
	});
	const override = extraParamsOverride && Object.keys(extraParamsOverride).length > 0 ? Object.fromEntries(Object.entries(extraParamsOverride).filter(([, value]) => value !== void 0)) : void 0;
	const effectiveExtraParams = resolvePreparedExtraParams({
		cfg,
		provider,
		modelId,
		extraParamsOverride,
		thinkingLevel,
		agentId,
		resolvedExtraParams
	});
	const wrapperContext = {
		agent,
		cfg,
		provider,
		modelId,
		agentDir,
		workspaceDir,
		thinkingLevel,
		model,
		effectiveExtraParams,
		resolvedExtraParams,
		override
	};
	const providerStreamBase = agent.streamFn;
	const pluginWrappedStreamFn = providerRuntimeDeps.wrapProviderStreamFn({
		provider,
		config: cfg,
		context: {
			config: cfg,
			provider,
			modelId,
			extraParams: effectiveExtraParams,
			thinkingLevel,
			model,
			streamFn: providerStreamBase
		}
	});
	agent.streamFn = pluginWrappedStreamFn ?? providerStreamBase;
	applyPrePluginStreamWrappers(wrapperContext);
	const providerWrapperHandled = pluginWrappedStreamFn !== void 0 && pluginWrappedStreamFn !== providerStreamBase;
	applyPostPluginStreamWrappers({
		...wrapperContext,
		providerWrapperHandled
	});
	return { effectiveExtraParams };
}
//#endregion
export { isRedactedSessionsSpawnAttachment as a, sanitizeToolCallInputs as c, resolveCacheRetention as i, sanitizeToolUseResultPairing as l, resolveAgentTransportOverride as n, makeMissingToolResult as o, isGooglePromptCacheEligible as r, repairToolUseResultPairing as s, applyExtraParamsToAgent as t, stripToolResultDetails as u };
