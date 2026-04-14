import { l as normalizeToolName } from "./tool-policy-DekfzodU.js";
import "./version-BajQ5RLp.js";
import "./sandbox-BJfRPwam.js";
import "./model-selection-DYo_mceY.js";
import "./model-auth--xFDcZHC.js";
import "./sessions-axRgTD70.js";
import "./context-BLKsjObp.js";
import { r as formatTokenCount$1 } from "./usage-format-Cd2GKMjD.js";
import "./session-utils.fs-BqNJ-U8P.js";
import "./proxy-stream-wrappers-RbfEPGsk.js";
import "./runner-ADcSh0Jv.js";
import "./extra-params-YA7NJcFo.js";
import "./model-overrides-_YEC3Cri.js";
import "./command-status-builders-COlfTk9o.js";
import "./fallback-state-CS7Bv_8T.js";
import { t as describeToolForVerbose } from "./tool-description-summary-Cpl2C4kE.js";
import "./status-config-C0gdRBKm.js";
import "node:fs";
//#region src/auto-reply/status.ts
const formatTokenCount = formatTokenCount$1;
const formatTokens = (total, contextTokens) => {
	const ctx = contextTokens ?? null;
	if (total == null) return `?/${ctx ? formatTokenCount(ctx) : "?"}`;
	const pct = ctx ? Math.min(999, Math.round(total / ctx * 100)) : null;
	return `${formatTokenCount(total)}/${ctx ? formatTokenCount(ctx) : "?"}${pct !== null ? ` (${pct}%)` : ""}`;
};
const formatContextUsageShort = (total, contextTokens) => `Context ${formatTokens(total, contextTokens ?? null)}`;
function sortToolsMessageItems(items) {
	return items.toSorted((a, b) => a.name.localeCompare(b.name));
}
function formatCompactToolEntry(tool) {
	if (tool.source === "plugin") return tool.pluginId ? `${tool.id} (${tool.pluginId})` : tool.id;
	if (tool.source === "channel") return tool.channelId ? `${tool.id} (${tool.channelId})` : tool.id;
	return tool.id;
}
function formatVerboseToolDescription(tool) {
	return describeToolForVerbose({
		rawDescription: tool.rawDescription,
		fallback: tool.description
	});
}
function buildToolsMessage(result, options) {
	const groups = result.groups.map((group) => ({
		label: group.label,
		tools: sortToolsMessageItems(group.tools.map((tool) => ({
			id: normalizeToolName(tool.id),
			name: tool.label,
			description: tool.description || "Tool",
			rawDescription: tool.rawDescription || tool.description || "Tool",
			source: tool.source,
			pluginId: tool.pluginId,
			channelId: tool.channelId
		})))
	})).filter((group) => group.tools.length > 0);
	if (groups.length === 0) return [
		"No tools are available for this agent right now.",
		"",
		`Profile: ${result.profile}`
	].join("\n");
	const verbose = options?.verbose === true;
	const lines = verbose ? [
		"Available tools",
		"",
		`Profile: ${result.profile}`,
		"What this agent can use right now:"
	] : [
		"Available tools",
		"",
		`Profile: ${result.profile}`
	];
	for (const group of groups) {
		lines.push("", group.label);
		if (verbose) {
			for (const tool of group.tools) lines.push(`  ${tool.name} - ${formatVerboseToolDescription(tool)}`);
			continue;
		}
		lines.push(`  ${group.tools.map((tool) => formatCompactToolEntry(tool)).join(", ")}`);
	}
	if (verbose) lines.push("", "Tool availability depends on this agent's configuration.");
	else lines.push("", "Use /tools verbose for descriptions.");
	return lines.join("\n");
}
//#endregion
export { formatContextUsageShort as n, formatTokenCount as r, buildToolsMessage as t };
