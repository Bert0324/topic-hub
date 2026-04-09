import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

interface JwksConfig {
  platform: string;
  jwksUri: string;
  issuer: string;
  audience?: string;
}

@Injectable()
export class JwksService {
  private readonly logger = new Logger(JwksService.name);
  private clients: Map<string, jwksClient.JwksClient> = new Map();
  private configs: JwksConfig[] = [];

  constructor() {
    this.loadConfigs();
  }

  private loadConfigs() {
    const configStr = process.env.JWKS_CONFIGS;
    if (configStr) {
      try {
        this.configs = JSON.parse(configStr);
      } catch {
        this.logger.warn('Failed to parse JWKS_CONFIGS env var');
      }
    }

    if (this.configs.length === 0) {
      this.configs = [
        {
          platform: 'feishu',
          jwksUri:
            'https://open.feishu.cn/open-apis/authen/v1/oidc/discovery/keys',
          issuer: 'https://open.feishu.cn',
        },
        {
          platform: 'slack',
          jwksUri: 'https://slack.com/openid/connect/keys',
          issuer: 'https://slack.com',
        },
      ];
    }

    for (const config of this.configs) {
      this.clients.set(
        config.platform,
        jwksClient({
          jwksUri: config.jwksUri,
          cache: true,
          cacheMaxAge: 600000,
          rateLimit: true,
          jwksRequestsPerMinute: 10,
        }),
      );
    }
  }

  async verifyIdToken(idToken: string): Promise<{
    userId: string;
    platform: string;
    displayName: string;
    email?: string;
    verified: boolean;
  }> {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }

    const header = decoded.header;
    const payload = decoded.payload as jwt.JwtPayload;

    const config = this.configs.find((c) => payload.iss?.includes(c.issuer));
    if (!config) {
      throw new Error(`Unknown token issuer: ${payload.iss}`);
    }

    const client = this.clients.get(config.platform);
    if (!client) {
      throw new Error(`No JWKS client for platform: ${config.platform}`);
    }

    const key = await client.getSigningKey(header.kid);
    const signingKey = key.getPublicKey();

    const verified = jwt.verify(idToken, signingKey, {
      issuer: config.issuer,
      audience: config.audience,
    }) as jwt.JwtPayload;

    return {
      userId: verified.sub ?? verified.user_id ?? '',
      platform: config.platform,
      displayName: verified.name ?? verified.preferred_username ?? '',
      email: verified.email,
      verified: true,
    };
  }

  getSupportedPlatforms(): { platform: string; jwksUri: string }[] {
    return this.configs.map((c) => ({
      platform: c.platform,
      jwksUri: c.jwksUri,
    }));
  }
}
