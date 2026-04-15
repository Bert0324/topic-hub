import type { TopicHubLogger } from '../../common/logger';
import { NotFoundError, ValidationError } from '../../common/errors';
import { getImPlatformTotalMessageMax } from '../../im/im-platform-limits';
import type { SkillCenterService } from '../../services/skill-center.service';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';

const IM_SKILLS_DEFAULT_LIMIT = 12;
const IM_SKILLS_MAX_LIMIT = 20;

function parseStarSkillName(imChatLine: string | undefined): string | undefined {
  if (!imChatLine) return undefined;
  const m = imChatLine.trim().match(/^\/skills\s+star\s+(\S+)/i);
  return m?.[1]?.trim() || undefined;
}

function clampImLimit(raw: unknown): number {
  const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) return IM_SKILLS_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), IM_SKILLS_MAX_LIMIT);
}

function clampPage(raw: unknown): number {
  const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function truncateToImBudget(text: string, platform: string | undefined): string {
  const max = getImPlatformTotalMessageMax(platform);
  if (text.length <= max) return text;
  const ellipsis = '\n\n…(truncated — narrow with `--limit` or use `--page` for more.)';
  const budget = Math.max(0, max - ellipsis.length);
  return text.slice(0, budget) + ellipsis;
}

export class SkillsHandler {
  constructor(
    private readonly skillCenter: SkillCenterService,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(parsed: ParsedCommand, context: CommandContext) {
    const sub = parsed.type?.toLowerCase();
    try {
      if (sub === 'list') {
        return await this.executeList(parsed, context);
      }
      if (sub === 'star') {
        return await this.executeStar(context);
      }
      return {
        success: false,
        error:
          'Usage: `/skills list` [--page N] [--limit N] [--sort popular|recent|usage] · `/skills star <skill-name>`',
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { success: false, error: err.message };
      }
      if (err instanceof ValidationError) {
        return { success: false, error: err.message };
      }
      this.logger.error('Skills command failed', String(err));
      return { success: false, error: `Skills command failed: ${(err as Error).message}` };
    }
  }

  private async executeList(parsed: ParsedCommand, context: CommandContext) {
    const args = parsed.args ?? {};
    const page = clampPage(args.page);
    const limit = clampImLimit(args.limit ?? IM_SKILLS_DEFAULT_LIMIT);
    const sortRaw = args.sort;
    const sort =
      sortRaw === 'popular' || sortRaw === 'recent' || sortRaw === 'usage' ? sortRaw : 'popular';

    const { skills, total, page: outPage, limit: outLimit } = await this.skillCenter.listCatalog({
      page,
      limit,
      sort,
    });

    if (skills.length === 0) {
      return { success: true, message: 'No published skills on this server.' };
    }

    const hasMore = total > outPage * outLimit;
    const lines = [
      `**Published skills** (page ${outPage}, ${skills.length} on this page of ${total} total; sort: ${sort})`,
      '',
      ...skills.map(
        (s) =>
          `• **${s.name}** · v${s.version} · ❤️ ${s.likeCount} · uses ${s.usageCount} · _${s.authorDisplayName}_`,
      ),
      ...(hasMore ? ['', `_More: \`/skills list --page ${outPage + 1}\`_`] : []),
    ];
    const message = truncateToImBudget(lines.join('\n'), context.platform);
    return { success: true, message };
  }

  private async executeStar(context: CommandContext) {
    const identityId = context.dispatchMeta?.targetUserId;
    if (!identityId) {
      return { success: false, error: 'Internal error: missing identity for like (not bound?).' };
    }

    const name = parseStarSkillName(context.imChatLine ?? context.relayText);
    if (!name) {
      return { success: false, error: 'Usage: `/skills star <skill-name>`' };
    }

    const { liked, likeCount } = await this.skillCenter.toggleLike(name, identityId);
    const verb = liked ? 'Liked' : 'Unliked';
    return { success: true, message: `${verb} **${name}**. Total likes: **${likeCount}**.` };
  }
}
