import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { TenantService } from '../tenant/tenant.service';
import { JwksService } from './jwks.service';

@Injectable()
export class AuthService {
  private readonly tokenSecret: string;

  constructor(
    private readonly tenantService: TenantService,
    private readonly jwksService: JwksService,
  ) {
    this.tokenSecret =
      process.env.TOKEN_SECRET ?? randomBytes(32).toString('hex');
  }

  async validateAdminToken(
    token: string,
  ): Promise<{ tenantId: string; role: 'tenant_admin' } | null> {
    const tenant = await this.tenantService.validateToken(token);
    if (!tenant) return null;
    return { tenantId: tenant._id.toString(), role: 'tenant_admin' };
  }

  async validateApiKey(
    apiKey: string,
  ): Promise<{ tenantId: string } | null> {
    const tenant = await this.tenantService.findByRawApiKey(apiKey);
    if (!tenant) return null;
    return { tenantId: tenant._id.toString() };
  }

  generateUserToken(
    userId: string,
    tenantId: string,
    platform: string,
  ): string {
    const payload = {
      userId,
      tenantId,
      platform,
      exp: Date.now() + 60 * 60 * 1000,
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = this.sign(data);
    return `${data}.${sig}`;
  }

  validateUserToken(
    token: string,
  ): { userId: string; tenantId: string; role: 'user' } | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    if (this.sign(data) !== sig) return null;

    try {
      const payload = JSON.parse(
        Buffer.from(data, 'base64url').toString('utf8'),
      );
      if (payload.exp < Date.now()) return null;
      return {
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: 'user',
      };
    } catch {
      return null;
    }
  }

  async verifyIdToken(idToken: string) {
    return this.jwksService.verifyIdToken(idToken);
  }

  private sign(data: string): string {
    return createHmac('sha256', this.tokenSecret)
      .update(data)
      .digest('base64url');
  }
}
