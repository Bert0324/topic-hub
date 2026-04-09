import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { TenantGuard } from '../tenant/tenant.guard';
import { IngestionService } from './ingestion.service';
import { EventPayloadSchema } from './dto/event-payload.dto';

@Controller('ingestion')
@UseGuards(TenantGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('events')
  async ingestEvent(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    let payload;
    try {
      payload = EventPayloadSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: err.errors,
        });
      }
      throw err;
    }

    const tenantId = (req as unknown as Record<string, unknown>)[
      'tenantId'
    ] as string;

    const result = await this.ingestionService.ingest(tenantId, payload);

    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}
