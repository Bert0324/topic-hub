// Main entry point
export { TopicHub } from './topichub';
export type {
  TopicOperations,
  CommandOperations,
  IngestionOperations,
  WebhookOperations,
  MessagingOperations,
  AuthOperations,
  SearchOperations,
  SkillOperations,
  DispatchOperations,
  AdminOperations,
} from './topichub';

// Config
export { TopicHubConfigSchema } from './config';
export type { TopicHubConfig, AiProviderConfig, EncryptionConfig } from './config';

// Built-in skills
export { getBuiltinSkills, GENERIC_TYPE_SKILL_MD, GENERIC_TYPE_VERSION } from './builtin-skills';
export type { BuiltinSkillEntry } from './builtin-skills';

// Logger
export { defaultLoggerFactory } from './common/logger';
export type { TopicHubLogger, LoggerFactory } from './common/logger';

// Errors
export {
  TopicHubError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
} from './common/errors';

// Enums
export {
  TopicStatus,
  TimelineActionType,
  SkillCategory,
  DispatchStatus,
  DispatchEventType,
} from './common/enums';

// Skill interfaces
export type { AiCompletionPort, SkillContext } from './skill/interfaces/skill-context';
export type {
  PlatformSkill,
  PlatformSkillManifest,
  PlatformCapability,
  CommandResult,
  CreateGroupParams,
  GroupResult,
  PostCardParams,
} from './skill/interfaces/platform-skill';
export type {
  AdapterSkill,
  AdapterSkillManifest,
  TopicEventPayload,
} from './skill/interfaces/adapter-skill';
export type {
  TypeSkill,
  TypeSkillManifest,
  TopicContext,
  ValidationResult,
  CardData,
  CardField,
  CardAction,
  CardTemplate,
  CustomArgDefinition,
} from './skill/interfaces/type-skill';
export type { SetupContext } from './skill/interfaces/setup-context';
export type { ParsedSkillMd } from './skill/interfaces/skill-md';

// Event payload
export { EventPayloadSchema } from './ingestion/event-payload';
export type { EventPayload } from './ingestion/event-payload';

// Webhook result
export type { WebhookResult } from './webhook/webhook-handler';
