import { z } from 'zod';

// Card rendering types — still used by message-renderer and md-only-skill.

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

export interface ValidationResult {
  valid: boolean;
  errors?: { field: string; message: string }[];
}

export interface TypeSkillManifest {
  name: string;
  topicType: string;
  version: string;
  fieldSchema: z.ZodSchema;
  groupNamingTemplate: string;
  cardTemplate: CardTemplate;
}
