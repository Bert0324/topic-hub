import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let suggestedCommand: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        suggestedCommand = obj.suggestedCommand as string | undefined;
      }
    }

    const responseBody: Record<string, unknown> = {
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    };

    if (suggestedCommand) {
      responseBody.suggestedCommand = suggestedCommand;
      responseBody.hint = `Run: ${suggestedCommand}`;
    }

    response.status(status).json(responseBody);
  }
}
