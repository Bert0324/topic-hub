/**
 * @topichub/core — Public API contract
 *
 * This file defines the public interface of the TopicHub facade class.
 * This is a DESIGN CONTRACT — not compilable source code.
 */

import type { TopicHubConfig } from './topichub-config';

// --- Domain Types (re-exported from core) ---

export interface EventPayload {
  type: string;
  title: string;
  sourceUrl?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  assignees?: string[];
}

export interface TopicData {
  _id: string;
  tenantId: string;
  type: string;
  title: string;
  status: string;
  sourceUrl?: string;
  metadata: Record<string, unknown>;
  tags: string[];
  assignees: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardData {
  title: string;
  content: string;
  fields?: Array<{ label: string; value: string }>;
  actions?: Array<{ label: string; action: string }>;
}

export interface WebhookResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

// --- Operation Namespaces ---

export interface TopicOperations {
  list(tenantId: string, query?: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ topics: TopicData[]; total: number }>;

  get(tenantId: string, topicId: string): Promise<TopicData | null>;

  create(tenantId: string, data: {
    type: string;
    title: string;
    sourceUrl?: string;
    metadata?: Record<string, unknown>;
    createdBy: string;
  }): Promise<TopicData>;

  updateStatus(tenantId: string, topicId: string, status: string, actor: string): Promise<TopicData>;
  addTag(tenantId: string, topicId: string, tag: string, actor: string): Promise<void>;
  removeTag(tenantId: string, topicId: string, tag: string, actor: string): Promise<void>;
  assignUser(tenantId: string, topicId: string, userId: string, actor: string): Promise<void>;
  unassignUser(tenantId: string, topicId: string, userId: string, actor: string): Promise<void>;
}

export interface CommandOperations {
  execute(tenantId: string, rawCommand: string, context: {
    platform: string;
    groupId: string;
    userId: string;
  }): Promise<{ success: boolean; result?: unknown; error?: string }>;
}

export interface IngestionOperations {
  ingest(tenantId: string, payload: EventPayload): Promise<{
    topic: TopicData;
    created: boolean;
  }>;
}

export interface WebhookOperations {
  handle(platform: string, payload: unknown, headers: Record<string, string>): Promise<WebhookResult>;
}

export interface MessagingOperations {
  send(platform: string, params: {
    tenantId: string;
    groupId: string;
    message: string;
  }): Promise<void>;

  postCard(platform: string, params: {
    tenantId: string;
    groupId: string;
    card: CardData;
  }): Promise<void>;
}

export interface AuthOperations {
  resolveTenant(apiKey: string): Promise<{ tenantId: string; slug: string } | null>;
  verifyJwt(token: string): Promise<{ tenantId: string; sub: string } | null>;
}

export interface SearchOperations {
  search(tenantId: string, query: {
    q?: string;
    status?: string;
    type?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ topics: TopicData[]; total: number }>;
}

export interface SkillOperations {
  listRegistered(): Array<{
    name: string;
    category: string;
    version: string;
    description?: string;
  }>;

  isTypeAvailable(type: string, tenantId: string): Promise<boolean>;
}

export interface DispatchOperations {
  onTask(listener: (task: {
    id: string;
    tenantId: string;
    topicId: string;
    skillName: string;
    event: string;
    payload: unknown;
  }) => void): () => void;

  claim(taskId: string, claimedBy: string): Promise<boolean>;
  complete(taskId: string, result?: unknown): Promise<void>;
  fail(taskId: string, error: string): Promise<void>;
}

// --- TopicHub Facade ---

export declare class TopicHub {
  static create(config: TopicHubConfig): Promise<TopicHub>;

  readonly topics: TopicOperations;
  readonly commands: CommandOperations;
  readonly ingestion: IngestionOperations;
  readonly webhook: WebhookOperations;
  readonly messaging: MessagingOperations;
  readonly auth: AuthOperations;
  readonly search: SearchOperations;
  readonly skills: SkillOperations;
  readonly dispatch: DispatchOperations;

  shutdown(): Promise<void>;
}
