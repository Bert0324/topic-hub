import { i as normalizeChannelId, t as getChannelPlugin } from "./registry-BkswxGUu.js";
import "./plugins-C60yWwZy.js";
import { n as createReplyPrefixOptions } from "./reply-prefix-xCFOErRQ.js";
import { t as createTypingCallbacks } from "./typing-qYl78aqy.js";
//#region src/plugin-sdk/channel-reply-pipeline.ts
function createChannelReplyPipeline(params) {
	const channelId = params.channel ? normalizeChannelId(params.channel) ?? params.channel : void 0;
	const plugin = params.transformReplyPayload ? void 0 : channelId ? getChannelPlugin(channelId) : void 0;
	const transformReplyPayload = params.transformReplyPayload ?? (plugin?.messaging?.transformReplyPayload ? (payload) => plugin.messaging?.transformReplyPayload?.({
		payload,
		cfg: params.cfg,
		accountId: params.accountId
	}) ?? payload : void 0);
	return {
		...createReplyPrefixOptions({
			cfg: params.cfg,
			agentId: params.agentId,
			channel: params.channel,
			accountId: params.accountId
		}),
		...transformReplyPayload ? { transformReplyPayload } : {},
		...params.typingCallbacks ? { typingCallbacks: params.typingCallbacks } : params.typing ? { typingCallbacks: createTypingCallbacks(params.typing) } : {}
	};
}
//#endregion
export { createChannelReplyPipeline as t };
