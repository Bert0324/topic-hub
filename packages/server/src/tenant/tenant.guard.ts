import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantService } from './tenant.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantService: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      const tenant = await this.tenantService.findByRawApiKey(apiKey);
      if (!tenant) throw new UnauthorizedException('Invalid API key');
      (req as unknown as Record<string, unknown>)['tenantId'] = tenant._id.toString();
      return true;
    }

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const tenant = await this.tenantService.validateToken(token);
      if (!tenant) throw new UnauthorizedException('Invalid or expired token');
      (req as unknown as Record<string, unknown>)['tenantId'] = tenant._id.toString();
      return true;
    }

    throw new UnauthorizedException('Missing authentication');
  }
}
