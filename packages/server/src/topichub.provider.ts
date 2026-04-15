import {
  Module,
  Global,
  Injectable,
  OnModuleInit,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Server as HttpServer } from 'node:http';
import mongoose from 'mongoose';
import { TopicHub, TopicHubLogger } from '@topichub/core';
import type { BridgeConfig, TopicHubBridgeConfig } from '@topichub/core';

@Injectable()
export class TopicHubService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private hub: TopicHub | null = null;
  private connection: mongoose.Connection | null = null;
  private readonly logger = new Logger(TopicHubService.name);
  private nestLogger!: (context: string) => TopicHubLogger;

  constructor(
    private readonly config: ConfigService,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  async onModuleInit() {
    const uri = this.buildMongoUri();
    const opts = this.buildConnectOpts();

    this.connection = mongoose.createConnection(uri, opts);
    await this.connection.asPromise();

    this.nestLogger = (context: string): TopicHubLogger => {
      const l = new Logger(context);
      return {
        log: (msg) => l.log(msg),
        warn: (msg) => l.warn(msg),
        error: (msg, trace) => l.error(msg, trace),
        debug: (msg) => l.debug(msg),
      };
    };
  }

  async onApplicationBootstrap() {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer() as HttpServer;
    const listenPort = Number(this.config.get('PORT') ?? process.env.PORT ?? 3000);
    const bridge = this.buildTopicHubBridge(httpServer, listenPort);

    this.hub = await TopicHub.create({
      mongoConnection: this.connection!,
      logger: this.nestLogger,
      collectionPrefix: this.config.get('COLLECTION_PREFIX') ?? '',
      skillsDir: this.config.get('SKILLS_DIR') ?? './skills',
      ...this.aiAndEncryptionOpts(),
      ...(bridge ? { bridge } : {}),
    });

    const embed = this.hub.getEmbeddedBridgeClusterStatus();
    this.logger.log(
      embed.role === 'leader'
        ? 'TopicHub initialized (OpenClaw embedded gateway lease holder)'
        : embed.role === 'follower'
          ? 'TopicHub initialized (OpenClaw bridge follower — gateway on lease holder)'
          : 'TopicHub initialized',
    );
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

  private aiAndEncryptionOpts() {
    const aiProvider = this.config.get<string>('AI_PROVIDER');
    const aiApiKey = this.config.get<string>('AI_API_KEY');
    const masterKey = this.config.get<string>('ENCRYPTION_MASTER_KEY');
    return {
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
    };
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

  /**
   * OpenClaw runs embedded on the Nest HTTP server (no separate gateway port).
   * The relay hook always POSTs to `{TOPICHUB_PUBLIC_GATEWAY_BASE_URL || http://127.0.0.1:PORT}/webhooks/openclaw`.
   */
  private buildBridgeChannels(): BridgeConfig['channels'] | undefined {
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
      const discordGuildId = this.config.get<string>('TOPICHUB_BRIDGE_DISCORD_GUILD_ID');
      channels.discord = {
        botToken: discordToken,
        ...(discordGuildId ? { guildId: discordGuildId } : {}),
      };
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

    const weixinEnabled = this.config.get<string>('TOPICHUB_BRIDGE_WEIXIN_ENABLED');
    if (weixinEnabled === 'true') {
      channels.weixin = { enabled: true };
    }

    if (!channels.feishu && !channels.discord && !channels.telegram && !channels.slack && !channels.weixin) {
      return undefined;
    }

    return channels as BridgeConfig['channels'];
  }

  private defaultEmbeddedWebhookOrigin(listenPort: number): string {
    const pub = this.config.get<string>('TOPICHUB_PUBLIC_GATEWAY_BASE_URL')?.trim();
    if (pub) return pub.replace(/\/+$/, '');
    return `http://127.0.0.1:${listenPort}`;
  }

  private buildTopicHubBridge(httpServer: HttpServer, listenPort: number): TopicHubBridgeConfig | undefined {
    const channels = this.buildBridgeChannels();
    if (!channels) return undefined;

    const webhookUrl = `${this.defaultEmbeddedWebhookOrigin(listenPort)}/webhooks/openclaw`;

    const mountRaw = this.config.get<string>('TOPICHUB_BRIDGE_GATEWAY_MOUNT_PATH')?.trim() || '/openclaw';
    const publicGatewayBaseUrl = this.config.get<string>('TOPICHUB_PUBLIC_GATEWAY_BASE_URL')?.trim();

    const base: BridgeConfig = { channels, webhookUrl };

    return {
      ...base,
      httpServer,
      listenPort,
      mountPath: mountRaw,
      ...(publicGatewayBaseUrl ? { publicGatewayBaseUrl } : {}),
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
export class TopicHubModule {}
