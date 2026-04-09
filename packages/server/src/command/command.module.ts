import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { SkillModule } from '../skill/skill.module';
import { TenantModule } from '../tenant/tenant.module';
import { CommandParser } from './parser/command-parser';
import { CommandRouter } from './router/command-router';
import { CreateHandler } from './handlers/create.handler';
import { UpdateHandler } from './handlers/update.handler';
import { AssignHandler } from './handlers/assign.handler';
import { HelpHandler } from './handlers/help.handler';
import { ReopenHandler } from './handlers/reopen.handler';
import { ShowHandler } from './handlers/show.handler';
import { TimelineHandler } from './handlers/timeline.handler';
import { HistoryHandler } from './handlers/history.handler';
import { CommandController } from './command.controller';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [CoreModule, SkillModule, TenantModule],
  controllers: [CommandController, WebhookController],
  providers: [
    CommandParser,
    CommandRouter,
    CreateHandler,
    UpdateHandler,
    AssignHandler,
    HelpHandler,
    ReopenHandler,
    ShowHandler,
    TimelineHandler,
    HistoryHandler,
  ],
  exports: [CommandParser, CommandRouter],
})
export class CommandModule {}
