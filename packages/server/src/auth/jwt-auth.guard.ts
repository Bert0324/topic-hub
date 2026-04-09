import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwksService } from './jwks.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwksService: JwksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice(7);

    try {
      const identity = await this.jwksService.verifyIdToken(token);
      (request as any).userIdentity = identity;
      return true;
    } catch (error: any) {
      throw new UnauthorizedException(
        `Token verification failed: ${error.message}`,
      );
    }
  }
}
