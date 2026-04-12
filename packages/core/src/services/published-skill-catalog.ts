import type { Model } from 'mongoose';
import type { TopicHubLogger } from '../common/logger';
import { PUBLISHED_SKILL_CATALOG_TTL_MS } from './published-skill-catalog.constants';

/**
 * Mongo-backed, TTL-cached set of Skill Center published skill names for IM slash routing.
 */
export class PublishedSkillCatalog {
  private canonicalByLower = new Map<string, string>();
  private loadedAt = 0;

  constructor(
    private readonly skillRegistrationModel: Model<any>,
    private readonly logger: TopicHubLogger,
    private readonly ttlMs: number = PUBLISHED_SKILL_CATALOG_TTL_MS,
  ) {}

  invalidate(): void {
    this.canonicalByLower.clear();
    this.loadedAt = 0;
  }

  /** Drop cache so the next {@link refreshIfNeeded} reloads from Mongo. */
  isStale(now: number = Date.now()): boolean {
    if (this.loadedAt === 0) return true;
    return now - this.loadedAt > this.ttlMs;
  }

  async refreshIfNeeded(now: number = Date.now()): Promise<void> {
    if (!this.isStale(now)) return;
    await this.reloadFromDb(now);
  }

  /** Force reload (e.g. tests). */
  async refresh(): Promise<void> {
    await this.reloadFromDb();
  }

  /**
   * Case-insensitive lookup of a catalog-published canonical `name`.
   * Uses last {@link refreshIfNeeded} / {@link refresh} snapshot only.
   */
  matchPublishedName(token: string): string | undefined {
    return this.canonicalByLower.get(token.toLowerCase());
  }

  private async reloadFromDb(now: number = Date.now()): Promise<void> {
    try {
      const rows = await this.skillRegistrationModel
        .find({ publishedContent: { $ne: null } })
        .select('name')
        .lean()
        .exec();

      const next = new Map<string, string>();
      for (const r of rows as Array<{ name?: string }>) {
        if (typeof r.name !== 'string' || !r.name.trim()) continue;
        next.set(r.name.toLowerCase(), r.name);
      }
      this.canonicalByLower = next;
      this.loadedAt = now;
    } catch (err) {
      this.logger.error('PublishedSkillCatalog reload failed', String(err));
    }
  }
}
