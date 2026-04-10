import { SetupContext } from './setup-context';
import { CardData } from './type-skill';
import { SkillContext } from './skill-context';

export type PlatformCapability = 'group_management' | 'push' | 'commands';

export interface PlatformSkillManifest {
  name: string;
  platform: string;
  version: string;
  capabilities: PlatformCapability[];
  webhookPath?: string;
  ai?: boolean;
}

export interface CreateGroupParams {
  tenantId: string;
  topicId: string;
  name: string;
  members: string[];
}

export interface GroupResult {
  groupId: string;
  groupUrl?: string;
}

export interface PostCardParams {
  tenantId: string;
  platform: string;
  groupId: string;
  card: CardData;
}

export interface CommandResult {
  action: string;
  type?: string;
  args: Record<string, unknown>;
  groupId: string;
  platform: string;
  userId: string;
}

export interface PlatformSkill {
  manifest: PlatformSkillManifest;
  init?(ctx: SkillContext): void;
  createGroup?(params: CreateGroupParams): Promise<GroupResult>;
  inviteToGroup?(params: {
    tenantId: string;
    groupId: string;
    userIds: string[];
  }): Promise<void>;
  postCard?(params: PostCardParams): Promise<void>;
  updateCard?(params: PostCardParams): Promise<void>;
  handleWebhook?(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<CommandResult | null>;
  verifySignature?(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<boolean> | boolean;
  sendMessage?(params: {
    tenantId: string;
    groupId: string;
    message: string;
  }): Promise<void>;
  resolveTenantId?(webhookPayload: unknown): Promise<string> | string;
  runSetup?(ctx: SetupContext): Promise<void>;
}
