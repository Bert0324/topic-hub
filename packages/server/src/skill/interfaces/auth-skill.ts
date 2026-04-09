import { SetupContext } from './setup-context';

export interface UserIdentity {
  userId: string;
  platform: string;
  displayName: string;
  email?: string;
  verified: boolean;
}

export interface AuthorizeParams {
  user: UserIdentity;
  action: string;
  tenantId: string;
  topicContext?: any;
}

export interface AuthResult {
  allowed: boolean;
  reason?: string;
  suggestedCommand?: string;
}

export interface SkillCommand {
  name: string;
  description: string;
  handler: (
    args: Record<string, unknown>,
    tenantId: string,
  ) => Promise<string>;
}

export interface AuthSkillManifest {
  name: string;
  version: string;
}

export interface AuthSkill {
  manifest: AuthSkillManifest;
  authorize(params: AuthorizeParams): Promise<AuthResult>;
  getCommands?(): SkillCommand[];
  runSetup?(ctx: SetupContext): Promise<void>;
}
