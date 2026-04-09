/**
 * Contract: AI Service Request types for SKILL.md-driven calls.
 *
 * These types define the interface between SkillAiRuntime and AiService.
 * The existing AiServiceRequest already covers the low-level call.
 * These types define the higher-level SKILL.md-aware layer.
 */

/** Parsed SKILL.md representation */
export interface ParsedSkillMd {
  frontmatter: {
    name: string;
    description: string;
  };
  /** Full markdown body (fallback system prompt for all events) */
  systemPrompt: string;
  /** Event-specific sections extracted from ## headings */
  eventPrompts: Map<string, string>;
  /** True if body or event prompts contain non-empty content */
  hasAiInstructions: boolean;
}

/** SKILL.md frontmatter validation schema (zod) */
export interface SkillMdFrontmatter {
  /** Unique identifier: max 64 chars, lowercase letters/numbers/hyphens */
  name: string;
  /** Discovery text: max 1024 chars, non-empty */
  description: string;
}

/** Serialized topic data passed as user prompt */
export interface TopicSnapshot {
  _id: string;
  tenantId: string;
  type: string;
  title: string;
  sourceUrl?: string;
  status: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  groups: Array<{ platform: string; groupId: string }>;
  assignees: Array<{ userId: string }>;
  tags: string[];
  signals: Array<{ label: string; url?: string; description?: string }>;
  createdAt: string;
  updatedAt: string;
}

/** Event context passed alongside topic snapshot */
export interface EventContext {
  eventType: string;
  actor: string;
  timestamp: string;
  extra?: Record<string, unknown>;
}

/** User prompt payload (serialized as JSON) */
export interface SkillAiUserPrompt {
  event: EventContext;
  topic: TopicSnapshot;
}

/** AI response stored in topic timeline and metadata */
export interface SkillAiResult {
  skillName: string;
  content: string;
  model: string;
  reasoning?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  timestamp: string;
}

/** Known lifecycle event names that can appear as ## headings in SKILL.md */
export const KNOWN_LIFECYCLE_EVENTS = [
  'onTopicCreated',
  'onTopicUpdated',
  'onTopicStatusChanged',
  'onTopicAssigned',
  'onTopicClosed',
  'onTopicReopened',
  'onSignalAttached',
  'onTagChanged',
] as const;

export type LifecycleEventName = (typeof KNOWN_LIFECYCLE_EVENTS)[number];

/** Mapping from pipeline operation strings to lifecycle event names */
export const OPERATION_TO_EVENT: Record<string, LifecycleEventName> = {
  created: 'onTopicCreated',
  updated: 'onTopicUpdated',
  status_changed: 'onTopicStatusChanged',
  assigned: 'onTopicAssigned',
  closed: 'onTopicClosed',
  reopened: 'onTopicReopened',
  signal_attached: 'onSignalAttached',
  tag_changed: 'onTagChanged',
};
