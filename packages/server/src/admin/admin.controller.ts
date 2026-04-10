import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  BadRequestException,
  NotFoundException,
  BadGatewayException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { TenantService } from '../tenant/tenant.service';
import { PublishPayloadSchema } from '../skill/interfaces';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('skills')
  async listSkills(
    @Query('scope') scope?: 'all' | 'public' | 'private',
    @Query('tenantId') tenantId?: string,
  ) {
    return this.adminService.listSkills({ scope, tenantId });
  }

  @Post('skills')
  async installSkill(@Body() body: { packagePath: string }) {
    return this.adminService.installSkill(body.packagePath);
  }

  @Post('skills/publish')
  async publishSkills(@Body() body: unknown) {
    const result = PublishPayloadSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.adminService.publishSkills(result.data);
  }

  @Delete('skills/:name')
  async uninstallSkill(@Param('name') name: string) {
    await this.adminService.uninstallSkill(name);
    return { success: true };
  }

  @Post('skills/reload')
  async reloadSkills() {
    await this.adminService.reloadSkills();
    return { success: true };
  }

  @Get('tenants')
  async listTenants() {
    return this.tenantService.findAll();
  }

  @Post('tenants')
  async createTenant(@Body() body: { name: string }) {
    return this.tenantService.create(body.name);
  }

  @Post('tenants/:id/token/regenerate')
  async regenerateToken(@Param('id') id: string) {
    return this.tenantService.regenerateToken(id);
  }

  @Get('tenants/:tid/skills')
  async listTenantSkills(@Param('tid') tid: string) {
    return this.adminService.listTenantSkills(tid);
  }

  @Patch('tenants/:tid/skills/:name')
  async updateTenantSkill(
    @Param('tid') tid: string,
    @Param('name') name: string,
    @Body() body: { enabled?: boolean; config?: Record<string, unknown> },
  ) {
    if (body.enabled === true) {
      await this.adminService.enableSkillForTenant(tid, name);
    } else if (body.enabled === false) {
      await this.adminService.disableSkillForTenant(tid, name);
    }
    if (body.config) {
      await this.adminService.updateSkillConfig(tid, name, body.config);
    }
    return { success: true };
  }

  @Post('groups')
  async createGroup(
    @Body()
    body: {
      name: string;
      platform: string;
      memberIds?: string[];
      topicType?: string;
    },
  ) {
    if (!body.name || !body.platform) {
      throw new BadRequestException('name and platform are required');
    }

    try {
      return await this.adminService.createGroup(body);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(
        `Platform API error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('tenants/:tid/stats')
  async getTenantStats(@Param('tid') tid: string) {
    return this.adminService.getTenantStats(tid);
  }
}
