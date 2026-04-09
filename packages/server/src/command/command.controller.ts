import { Controller, Post, Body, Logger } from '@nestjs/common';
import { CommandParser } from './parser/command-parser';
import { CommandRouter, CommandContext } from './router/command-router';
import { CreateHandler } from './handlers/create.handler';
import { UpdateHandler } from './handlers/update.handler';
import { AssignHandler } from './handlers/assign.handler';
import { HelpHandler } from './handlers/help.handler';
import { ReopenHandler } from './handlers/reopen.handler';
import { ShowHandler } from './handlers/show.handler';
import { TimelineHandler } from './handlers/timeline.handler';
import { HistoryHandler } from './handlers/history.handler';

interface ExecuteCommandBody {
  rawCommand: string;
  context: CommandContext;
}

export interface CommandResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

@Controller('commands')
export class CommandController {
  private readonly logger = new Logger(CommandController.name);

  constructor(
    private readonly parser: CommandParser,
    private readonly router: CommandRouter,
    private readonly createHandler: CreateHandler,
    private readonly updateHandler: UpdateHandler,
    private readonly assignHandler: AssignHandler,
    private readonly helpHandler: HelpHandler,
    private readonly reopenHandler: ReopenHandler,
    private readonly showHandler: ShowHandler,
    private readonly timelineHandler: TimelineHandler,
    private readonly historyHandler: HistoryHandler,
  ) {}

  @Post('execute')
  async execute(@Body() body: ExecuteCommandBody): Promise<CommandResponse> {
    const { rawCommand, context } = body;

    const parsed = this.parser.parse(rawCommand);
    this.logger.log(`Parsed command: ${JSON.stringify(parsed)}`);

    const route = this.router.route(parsed, context);
    if (route.error) {
      return { success: false, error: route.error };
    }

    return this.dispatch(route.handler, context.tenantId, parsed, context);
  }

  async dispatch(
    handler: string,
    tenantId: string,
    parsed: ReturnType<CommandParser['parse']>,
    context: CommandContext,
  ): Promise<CommandResponse> {
    switch (handler) {
      case 'create':
        return this.createHandler.execute(tenantId, parsed, context);
      case 'update':
        return this.updateHandler.execute(tenantId, parsed, context);
      case 'assign':
        return this.assignHandler.execute(tenantId, parsed, context);
      case 'help':
        return this.helpHandler.execute();
      case 'reopen':
        return this.reopenHandler.execute(tenantId, parsed, context);
      case 'show':
        return this.showHandler.execute(tenantId, parsed, context);
      case 'timeline':
        return this.timelineHandler.execute(tenantId, parsed, context);
      case 'history':
        return this.historyHandler.execute(tenantId, parsed, context);
      default:
        return { success: false, error: `Handler not implemented: ${handler}` };
    }
  }
}
