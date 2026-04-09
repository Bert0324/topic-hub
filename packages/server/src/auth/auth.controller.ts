import { Controller, Post, Get, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwksService } from './jwks.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwksService: JwksService,
  ) {}

  @Post('validate')
  async validate(@Body() body: { token?: string; apiKey?: string }) {
    if (body.token) {
      const admin = await this.authService.validateAdminToken(body.token);
      if (admin) return admin;

      const user = this.authService.validateUserToken(body.token);
      if (user) return user;
    }

    if (body.apiKey) {
      const result = await this.authService.validateApiKey(body.apiKey);
      if (result) return result;
    }

    return { valid: false };
  }

  @Post('verify')
  async verify(@Body() body: { idToken: string }) {
    const identity = await this.jwksService.verifyIdToken(body.idToken);
    return identity;
  }

  @Get('jwks-config')
  getJwksConfig() {
    return { platforms: this.jwksService.getSupportedPlatforms() };
  }
}
