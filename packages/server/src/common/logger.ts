import { LoggerService, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class StructuredLogger implements LoggerService {
  private context = '';

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, ...optionalParams: unknown[]) {
    this.write('info', message, optionalParams);
  }

  error(message: string, ...optionalParams: unknown[]) {
    this.write('error', message, optionalParams);
  }

  warn(message: string, ...optionalParams: unknown[]) {
    this.write('warn', message, optionalParams);
  }

  debug(message: string, ...optionalParams: unknown[]) {
    this.write('debug', message, optionalParams);
  }

  verbose(message: string, ...optionalParams: unknown[]) {
    this.write('verbose', message, optionalParams);
  }

  private write(level: string, message: string, params: unknown[]) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context || params[0] || 'App',
      message,
      correlationId: randomUUID().slice(0, 8),
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
