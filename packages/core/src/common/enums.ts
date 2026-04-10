export enum TopicStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TimelineActionType {
  CREATED = 'created',
  STATUS_CHANGED = 'status_changed',
  ASSIGNED = 'assigned',
  UNASSIGNED = 'unassigned',
  TAG_ADDED = 'tag_added',
  TAG_REMOVED = 'tag_removed',
  SIGNAL_ATTACHED = 'signal_attached',
  SIGNAL_REMOVED = 'signal_removed',
  SKILL_ERROR = 'skill_error',
  COMMENT = 'comment',
  REOPENED = 'reopened',
  METADATA_UPDATED = 'metadata_updated',
  AI_RESPONSE = 'ai_response',
}

export enum SkillCategory {
  TYPE = 'type',
  ADAPTER = 'adapter',
}

export enum DispatchStatus {
  UNCLAIMED = 'unclaimed',
  CLAIMED = 'claimed',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum DispatchEventType {
  CREATED = 'created',
  UPDATED = 'updated',
  STATUS_CHANGED = 'status_changed',
  ASSIGNED = 'assigned',
  SIGNAL_ATTACHED = 'signal_attached',
  TAG_CHANGED = 'tag_changed',
  REOPENED = 'reopened',
}
