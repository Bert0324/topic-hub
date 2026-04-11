import { Controller, Delete, Get, Post, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { TopicHubService } from './topichub.provider';

/** Public / auth skill catalog routes. `by-id/*` is registered before `:name/*` so names never capture `by-id`. */
@Controller('api/v1/skills')
export class SkillCenterController {
  constructor(private readonly hub: TopicHubService) {}

  @Get()
  async list(@Query() query: Record<string, string | undefined>) {
    return this.hub.getHub().skillCenter.listCatalog(query as Record<string, unknown>);
  }

  @Get('by-id/:id/content')
  async contentById(@Param('id') id: string) {
    return this.hub.getHub().skillCenter.getSkillContentByRegistrationId(id);
  }

  @Delete('by-id/:id')
  async deleteById(@Req() req: Request, @Param('id') id: string) {
    const auth = await this.hub.getHub().identityAuth.resolveFromHeaders(
      req.headers as Record<string, string | string[] | undefined>,
    );
    return this.hub.getHub().skillCenter.deleteSkill(id, auth.identityId);
  }

  @Get(':name/content')
  async content(@Param('name') name: string) {
    return this.hub.getHub().skillCenter.getSkillContent(decodeURIComponent(name));
  }

  @Post(':name/like')
  async like(@Req() req: Request, @Param('name') name: string) {
    const auth = await this.hub.getHub().identityAuth.resolveFromHeaders(
      req.headers as Record<string, string | string[] | undefined>,
    );
    return this.hub.getHub().skillCenter.toggleLike(decodeURIComponent(name), auth.identityId);
  }
}
