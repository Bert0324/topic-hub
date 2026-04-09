import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SkillRegistry } from '../skill/registry/skill-registry';
import { SkillCategory } from '../common/enums';
import { PlatformSkill } from '../skill/interfaces/platform-skill';
import { CommandParser } from './parser/command-parser';
import { CommandRouter, CommandContext } from './router/command-router';
import { CommandController } from './command.controller';
import { TopicService } from '../core/services/topic.service';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly parser: CommandParser,
    private readonly router: CommandRouter,
    private readonly commandController: CommandController,
    private readonly topicService: TopicService,
  ) {}

  @Post(':platform')
  async handleWebhook(
    @Param('platform') platform: string,
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    const platformSkill = this.findPlatformSkill(platform);
    if (!platformSkill) {
      throw new NotFoundException(`No skill registered for platform: ${platform}`);
    }

    if (!platformSkill.resolveTenantId) {
      this.logger.warn(`Platform skill ${platform} does not support resolveTenantId`);
      return { success: false, error: 'Platform skill cannot resolve tenant' };
    }

    const tenantId = await platformSkill.resolveTenantId(payload);

    if (!platformSkill.handleWebhook) {
      this.logger.debug(`Platform skill ${platform} does not handle webhooks`);
      return { success: true, message: 'Webhook received, no handler configured' };
    }

    const commandResult = await platformSkill.handleWebhook(payload, headers);
    if (!commandResult) {
      return { success: true, message: 'Webhook event ignored' };
    }

    const rawCommand = this.buildRawCommand(commandResult);
    const activeTopic = await this.topicService.findActiveTopicByGroup(
      tenantId,
      commandResult.platform,
      commandResult.groupId,
    );

    const context: CommandContext = {
      platform: commandResult.platform,
      groupId: commandResult.groupId,
      userId: commandResult.userId,
      tenantId,
      hasActiveTopic: !!activeTopic,
    };

    const parsed = this.parser.parse(rawCommand);
    const route = this.router.route(parsed, context);

    if (route.error) {
      return { success: false, error: route.error };
    }

    return this.commandController.dispatch(route.handler, tenantId, parsed, context);
  }

  private findPlatformSkill(platform: string): PlatformSkill | undefined {
    const platformSkills = this.skillRegistry.getByCategory(SkillCategory.PLATFORM);
    const found = platformSkills.find(
      (s) => (s.registration.metadata as any)?.platform === platform,
    );
    return found?.skill as PlatformSkill | undefined;
  }

  private buildRawCommand(result: { action: string; type?: string; args: Record<string, unknown> }): string {
    const parts = ['/topichub', result.action];

    if (result.type) {
      parts.push(result.type);
    }

    for (const [key, value] of Object.entries(result.args)) {
      if (value === true) {
        parts.push(`--${key}`);
      } else if (value !== undefined && value !== null) {
        const strVal = String(value);
        parts.push(`--${key}`, strVal.includes(' ') ? `"${strVal}"` : strVal);
      }
    }

    return parts.join(' ');
  }
}
