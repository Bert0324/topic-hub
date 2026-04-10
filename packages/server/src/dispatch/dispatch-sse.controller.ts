import { Controller, Sse, Query, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { Observable, interval, map, merge, filter } from 'rxjs';
import { TenantGuard } from '../tenant/tenant.guard';
import { DispatchService } from './dispatch.service';

interface SseEvent {
  data: string;
  type?: string;
  id?: string;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

@Controller('api/v1/dispatches')
@UseGuards(TenantGuard)
export class DispatchSseController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Sse('stream')
  stream(
    @Req() req: Request,
    @Query('tenantId') queryTenantId?: string,
  ): Observable<SseEvent> {
    const tenantId =
      queryTenantId ?? ((req as any).tenantId as string);

    const dispatches$ = this.dispatchService.newDispatch$.pipe(
      filter((dispatch) => dispatch.tenantId === tenantId),
      map((dispatch) => ({
        type: 'dispatch',
        id: dispatch.createdAt.getTime().toString(),
        data: JSON.stringify({
          id: dispatch._id,
          topicId: dispatch.topicId,
          eventType: dispatch.eventType,
          skillName: dispatch.skillName,
          createdAt: dispatch.createdAt,
        }),
      })),
    );

    const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map(() => ({
        type: 'heartbeat',
        data: JSON.stringify({
          timestamp: new Date().toISOString(),
          pendingCount: 0,
        }),
      })),
    );

    return merge(dispatches$, heartbeat$);
  }
}
