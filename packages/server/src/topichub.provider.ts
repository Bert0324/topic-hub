import {
  Module,
  Global,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose from 'mongoose';
import { TopicHub, TopicHubLogger } from '@topichub/core';
import type { BridgeConfig } from '@topichub/core';

@Injectable()
export class TopicHubService implements OnModuleInit, OnModuleDestroy {
  private hub: TopicHub | null = null;
  private connection: mongoose.Connection | null = null;
  private readonly logger = new Logger(TopicHubService.name);

  constructor(private readonly config: ConfigService) { }

  async onModuleInit() {
    const uri = this.buildMongoUri();
    const opts = this.buildConnectOpts();

    this.connection = mongoose.createConnection(uri, opts);
    await this.connection.asPromise();

    const aiProvider = this.config.get<string>('AI_PROVIDER');
    const aiApiKey = this.config.get<string>('AI_API_KEY');
    const masterKey = this.config.get<string>('ENCRYPTION_MASTER_KEY');

    const nestLogger = (context: string): TopicHubLogger => {
      const l = new Logger(context);
      return {
        log: (msg) => l.log(msg),
        warn: (msg) => l.warn(msg),
        error: (msg, trace) => l.error(msg, trace),
        debug: (msg) => l.debug(msg),
      };
    };

    const parseTenantMapping = (
      raw?: string,
    ): Record<string, { tenantId: string; platform: string }> => {
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        this.logger.warn(`Invalid TOPICHUB_OPENCLAW_TENANT_MAPPING JSON — ignoring`);
        return {};
      }
    };

    const openclawConfig = this.config.get<string>('TOPICHUB_OPENCLAW_GATEWAY_URL') ? {
      gatewayUrl: this.config.get<string>('TOPICHUB_OPENCLAW_GATEWAY_URL')!,
      token: this.config.get<string>('TOPICHUB_OPENCLAW_TOKEN') ?? '',
      webhookSecret: this.config.get<string>('TOPICHUB_OPENCLAW_WEBHOOK_SECRET') ?? '',
      tenantMapping: parseTenantMapping(this.config.get<string>('TOPICHUB_OPENCLAW_TENANT_MAPPING')),
    } : undefined;

    const bridgeConfig = this.buildBridgeConfig(
      parseTenantMapping(this.config.get<string>('TOPICHUB_OPENCLAW_TENANT_MAPPING')),
    );

    this.hub = await TopicHub.create({
      mongoConnection: this.connection,
      logger: nestLogger,
      collectionPrefix: this.config.get('COLLECTION_PREFIX') ?? '',
      skillsDir: this.config.get('SKILLS_DIR') ?? './skills',
      ...(aiProvider && aiApiKey
        ? {
          ai: {
            provider: aiProvider,
            apiKey: aiApiKey,
            model: this.config.get('AI_MODEL'),
            baseUrl: this.config.get('AI_API_URL'),
          },
        }
        : {}),
      ...(masterKey ? { encryption: { masterKey } } : {}),
      ...(bridgeConfig ? { bridge: bridgeConfig }
        : openclawConfig ? { openclaw: openclawConfig }
        : {}),
    });

    this.logger.log('TopicHub initialized');
  }

  async onModuleDestroy() {
    if (this.hub) {
      await this.hub.shutdown();
    }
    if (this.connection) {
      await this.connection.close();
    }
    this.logger.log('TopicHub shut down');
  }

  getHub(): TopicHub {
    if (!this.hub) throw new Error('TopicHub not initialized');
    return this.hub;
  }

  private buildMongoUri(): string {
    const uri = this.config.get<string>('MONGODB_URI');
    if (uri) return uri;

    const host = this.config.get('MONGODB_HOST', 'localhost');
    const port = this.config.get('MONGODB_PORT', '27017');
    const db = this.config.get('MONGODB_DB', 'topichub');
    const username = this.config.get<string>('MONGODB_USERNAME');
    const password = this.config.get<string>('MONGODB_PASSWORD');

    const hosts = host
      .split(',')
      .map((h: string) => (h.includes(':') ? h : `${h}:${port}`))
      .join(',');

    const auth =
      username && password
        ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
        : '';

    return `mongodb://${auth}${hosts}/${db}`;
  }

  private buildBridgeConfig(
    tenantMapping: Record<string, { tenantId: string; platform: string }>,
  ): BridgeConfig | undefined {
    const webhookUrl = this.config.get<string>('TOPICHUB_BRIDGE_WEBHOOK_URL');
    if (!webhookUrl) return undefined;

    const channels: BridgeConfig['channels'] = {};
    const feishuAppId = this.config.get<string>('TOPICHUB_BRIDGE_FEISHU_APP_ID');
    const feishuAppSecret = this.config.get<string>('TOPICHUB_BRIDGE_FEISHU_APP_SECRET');
    if (feishuAppId && feishuAppSecret) {
      channels.feishu = {
        appId: feishuAppId,
        appSecret: feishuAppSecret,
        domain: (this.config.get<string>('TOPICHUB_BRIDGE_FEISHU_DOMAIN') as 'feishu' | 'lark') || undefined,
      };
    }

    const discordToken = this.config.get<string>('TOPICHUB_BRIDGE_DISCORD_BOT_TOKEN');
    if (discordToken) {
      channels.discord = { botToken: discordToken };
    }

    const telegramToken = this.config.get<string>('TOPICHUB_BRIDGE_TELEGRAM_BOT_TOKEN');
    if (telegramToken) {
      channels.telegram = { botToken: telegramToken };
    }

    const slackBotToken = this.config.get<string>('TOPICHUB_BRIDGE_SLACK_BOT_TOKEN');
    const slackAppToken = this.config.get<string>('TOPICHUB_BRIDGE_SLACK_APP_TOKEN');
    if (slackBotToken && slackAppToken) {
      channels.slack = { botToken: slackBotToken, appToken: slackAppToken };
    }

    if (!channels.feishu && !channels.discord && !channels.telegram && !channels.slack) {
      return undefined;
    }

    if (Object.keys(tenantMapping).length === 0) {
      this.logger.warn(
        'Bridge channels configured but TOPICHUB_OPENCLAW_TENANT_MAPPING is empty — bridge disabled',
      );
      return undefined;
    }

    const port = this.config.get<string>('TOPICHUB_BRIDGE_PORT');

    return {
      channels: channels as BridgeConfig['channels'],
      tenantMapping,
      webhookUrl,
      ...(port ? { port: parseInt(port, 10) } : {}),
    };
  }

  private buildConnectOpts(): mongoose.ConnectOptions {
    const opts: mongoose.ConnectOptions = {};

    const authSource = this.config.get<string>('MONGODB_AUTH_SOURCE');
    if (authSource) opts.authSource = authSource;

    const replicaSet = this.config.get<string>('MONGODB_REPLICA_SET');
    if (replicaSet) opts.replicaSet = replicaSet;

    const certContent = this.config.get<string>('MONGODB_CA_CERT');
    const certPath = this.config.get<string>('MONGODB_CA_CERT_PATH');

    if (certContent || certPath) {
      opts.tls = true;
      if (certContent) {
        (opts as any).ca = certContent;
      } else if (certPath) {
        opts.tlsCAFile = certPath;
      }
      if (this.config.get('MONGODB_TLS_ALLOW_INVALID_HOSTNAMES', 'false') === 'true') {
        opts.tlsAllowInvalidHostnames = true;
      }
    }

    return opts;
  }
}

@Global()
@Module({
  providers: [TopicHubService],
  exports: [TopicHubService],
})
export class TopicHubModule { }
