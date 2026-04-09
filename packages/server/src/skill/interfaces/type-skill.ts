import { z } from 'zod';

export interface CustomArgDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'user';
  required: boolean;
  description: string;
}

export interface CardField {
  label: string;
  value: string;
  type: 'text' | 'link' | 'user' | 'datetime' | 'badge';
}

export interface CardAction {
  label: string;
  command: string;
}

export interface CardTemplate {
  headerTemplate: string;
  fields: CardField[];
  actions: CardAction[];
}

export interface CardData {
  title: string;
  fields: CardField[];
  actions?: CardAction[];
  status: string;
}

export interface InvitationRule {
  field: string;
  autoInvite: boolean;
}

export type StatusTransitionMap = Record<string, string[]>;

export interface TypeSkillManifest {
  name: string;
  topicType: string;
  version: string;
  fieldSchema: z.ZodSchema;
  statusTransitions?: StatusTransitionMap;
  groupNamingTemplate: string;
  invitationRules?: InvitationRule[];
  customArgs?: CustomArgDefinition[];
  cardTemplate: CardTemplate;
}

export interface ValidationResult {
  valid: boolean;
  errors?: { field: string; message: string }[];
}

export interface TopicContext {
  topic: any;
  actor: string;
  tenantId: string;
  timestamp: Date;
}

export interface TypeSkill {
  manifest: TypeSkillManifest;
  onTopicCreated?(ctx: TopicContext): Promise<void> | void;
  onTopicUpdated?(ctx: TopicContext): Promise<void> | void;
  onTopicStatusChanged?(
    ctx: TopicContext & { from: string; to: string },
  ): Promise<void> | void;
  onTopicAssigned?(
    ctx: TopicContext & { userId: string },
  ): Promise<void> | void;
  onTopicClosed?(ctx: TopicContext): Promise<void> | void;
  onTopicReopened?(ctx: TopicContext): Promise<void> | void;
  onSignalAttached?(
    ctx: TopicContext & { signal: any },
  ): Promise<void> | void;
  onTagChanged?(
    ctx: TopicContext & { added?: string[]; removed?: string[] },
  ): Promise<void> | void;
  renderCard(topic: any): CardData;
  validateMetadata(metadata: unknown): ValidationResult;
}
