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
