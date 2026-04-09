import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, MongooseModuleFactoryOptions } from '@nestjs/mongoose';
import { readFileSync } from 'fs';

const logger = new Logger('DatabaseModule');

function resolveTlsOpts(config: ConfigService): Record<string, unknown> {
  const certContent = config.get<string>('MONGODB_CA_CERT');
  const certPath = config.get<string>('MONGODB_CA_CERT_PATH');
  const tlsAllowInvalidHostnames =
    config.get('MONGODB_TLS_ALLOW_INVALID_HOSTNAMES', 'false') === 'true';

  const cert = certContent
    ? Buffer.from(certContent)
    : certPath
      ? readFileSync(certPath)
      : undefined;

  if (!cert) return {};

  return {
    cert,
    ...(tlsAllowInvalidHostnames && { tlsAllowInvalidHostnames }),
  };
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): MongooseModuleFactoryOptions => {
        const tlsOpts = resolveTlsOpts(config);
        const hasTls = 'cert' in tlsOpts;

        const uri = config.get<string>('MONGODB_URI');
        if (uri) {
          const masked = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
          logger.log(`Connecting via MONGODB_URI: ${masked} (tls=${hasTls})`);
          return { uri, ...tlsOpts };
        }

        const host = config.get('MONGODB_HOST', 'localhost');
        const port = config.get('MONGODB_PORT', '27017');
        const db = config.get('MONGODB_DB', 'topichub');
        const username = config.get<string>('MONGODB_USERNAME');
        const password = config.get<string>('MONGODB_PASSWORD');
        const authSource = config.get('MONGODB_AUTH_SOURCE', 'admin');
        const replicaSet = config.get<string>('MONGODB_REPLICA_SET');

        const hosts = host
          .split(',')
          .map((h: string) => (h.includes(':') ? h : `${h}:${port}`))
          .join(',');

        const auth =
          username && password
            ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
            : '';

        const builtUri = `mongodb://${auth}${hosts}/${db}`;

        logger.log(
          `Connecting to mongodb://${username ? `${username}:***@` : ''}${hosts}/${db}` +
            ` (tls=${hasTls}, authSource=${username ? authSource : 'N/A'}` +
            `${replicaSet ? `, replicaSet=${replicaSet}` : ''})`,
        );

        return {
          uri: builtUri,
          ...(username && { authSource }),
          ...(replicaSet && { replicaSet }),
          ...tlsOpts,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
