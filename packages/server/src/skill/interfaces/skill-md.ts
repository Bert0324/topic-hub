export interface ParsedSkillMd {
  frontmatter: {
    name: string;
    description: string;
  };
  systemPrompt: string;
  eventPrompts: Map<string, string>;
  hasAiInstructions: boolean;
}

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

export interface EventContext {
  eventType: string;
  actor: string;
  timestamp: string;
  extra?: Record<string, unknown>;
}

export interface SkillAiUserPrompt {
  event: EventContext;
  topic: TopicSnapshot;
}

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
