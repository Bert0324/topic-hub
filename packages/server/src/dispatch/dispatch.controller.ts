import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../tenant/tenant.guard';
import { DispatchService } from './dispatch.service';

@Controller('api/v1/dispatches')
@UseGuards(TenantGuard)
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get()
  async listDispatches(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    const tenantId = (req as any).tenantId as string;

    const dispatches = await this.dispatchService.findUnclaimed(tenantId, {
      limit: limit ? parseInt(limit, 10) : 20,
      since: since ? new Date(since) : undefined,
    });

    return { dispatches, total: dispatches.length };
  }

  @Post(':id/claim')
  async claimDispatch(
    @Param('id') id: string,
    @Body() body: { claimedBy: string },
  ) {
    const result = await this.dispatchService.claim(id, body.claimedBy);
    if (!result) {
      throw new ConflictException('Dispatch already claimed or not found');
    }

    return {
      id: result._id,
      status: result.status,
      claimedBy: result.claimedBy,
      claimExpiry: result.claimExpiry,
    };
  }

  @Post(':id/complete')
  async completeDispatch(
    @Param('id') id: string,
    @Body() body: { result: { text: string; executorType: string; tokenUsage?: { input: number; output: number }; durationMs: number } },
  ) {
    const result = await this.dispatchService.complete(id, body.result);
    if (!result) {
      throw new NotFoundException('Dispatch not found or not claimed');
    }

    return {
      id: result._id,
      status: result.status,
      completedAt: result.completedAt,
    };
  }

  @Post(':id/fail')
  async failDispatch(
    @Param('id') id: string,
    @Body() body: { error: string; retryable?: boolean },
  ) {
    const result = await this.dispatchService.fail(
      id,
      body.error,
      body.retryable,
    );
    if (!result) {
      throw new NotFoundException('Dispatch not found or not claimed');
    }

    return {
      id: result._id,
      status: result.status,
      retryCount: result.retryCount,
      error: result.error,
    };
  }
}
