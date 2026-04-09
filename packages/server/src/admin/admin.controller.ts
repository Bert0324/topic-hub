import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { TenantService } from '../tenant/tenant.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('skills')
  async listSkills() {
    return this.adminService.listSkills();
  }

  @Post('skills')
  async installSkill(@Body() body: { packagePath: string }) {
    return this.adminService.installSkill(body.packagePath);
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

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('tenants/:tid/stats')
  async getTenantStats(@Param('tid') tid: string) {
    return this.adminService.getTenantStats(tid);
  }
}
