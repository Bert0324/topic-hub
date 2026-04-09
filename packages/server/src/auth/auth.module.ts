import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwksService } from './jwks.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [TenantModule],
  providers: [AuthService, JwksService, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwksService, JwtAuthGuard],
})
export class AuthModule {}
