import { SetupContext } from './setup-context';

export interface AdapterSkillManifest {
  name: string;
  sourceSystem: string;
  version: string;
  webhookPath: string;
  supportedEvents: string[];
}

export interface TopicEventPayload {
  type: string;
  title: string;
  sourceUrl?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  assignees?: string[];
}

export interface AdapterSkill {
  manifest: AdapterSkillManifest;
  transformWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): TopicEventPayload | null;
  runSetup?(ctx: SetupContext): Promise<void>;
}
