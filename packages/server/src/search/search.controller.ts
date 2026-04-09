import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../tenant/tenant.guard';
import { SearchService } from './search.service';

@Controller('api/v1/topics')
@UseGuards(TenantGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('search')
  async search(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('tag') tag?: string | string[],
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const tenantId = (req as unknown as Record<string, unknown>)[
      'tenantId'
    ] as string;

    const tags = tag
      ? Array.isArray(tag)
        ? tag
        : [tag]
      : undefined;

    return this.searchService.search(tenantId, {
      type,
      status,
      tags,
      q,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: parseInt(page ?? '1', 10),
      pageSize: parseInt(pageSize ?? '20', 10),
    });
  }
}
