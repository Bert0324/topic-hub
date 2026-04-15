import mongoose, { Model } from 'mongoose';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/errors';
import type { TopicHubLogger } from '../common/logger';
import { safeCreate } from '../common/safe-create';
import { PublishPayloadSchema } from '../skill/interfaces/skill-manifest';
import { SkillMdParser } from '../skill/registry/skill-md-parser';
import { resolvePublishedSkillVersion } from './publish-version';
import { SkillListQuerySchema } from '../validation/skill-center.schema';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class SkillCenterService {
  constructor(
    private readonly skillRegistrationModel: Model<any>,
    private readonly skillLikeModel: Model<any>,
    private readonly identityModel: Model<any>,
    private readonly skillMdParser: SkillMdParser,
    private readonly logger: TopicHubLogger,
    private readonly publishedSkillCatalog?: { invalidate(): void },
  ) {}

  async publishSkills(
    body: unknown,
    authorIdentityId: string,
  ): Promise<{
    published: Array<{ name: string; status: string; id: string }>;
    errors: Array<{ name: string; error: string }>;
  }> {
    const parsed = PublishPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    const published: Array<{ name: string; status: string; id: string }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const item of parsed.data.skills) {
      try {
        const publishedContent = {
          manifest: item.manifest,
          skillMdRaw: item.skillMdRaw,
          entryPoint: item.entryPoint,
          files: item.files ?? {},
        };

        const parsedMd = this.skillMdParser.parseContent(item.skillMdRaw, `publish://${item.name}`);
        const skillMd = parsedMd
          ? {
              name: parsedMd.frontmatter.name,
              description: parsedMd.frontmatter.description,
              systemPrompt: parsedMd.systemPrompt,
              eventPrompts: Object.fromEntries(parsedMd.eventPrompts),
              hasAiInstructions: parsedMd.hasAiInstructions,
            }
          : null;

        let saved: { _id: mongoose.Types.ObjectId } | null;
        let isNew: boolean;

        if (item.registrationId) {
          if (!mongoose.Types.ObjectId.isValid(item.registrationId)) {
            errors.push({ name: item.name, error: 'Invalid registrationId' });
            continue;
          }

          const oid = new mongoose.Types.ObjectId(item.registrationId);
          const existingDoc = await this.skillRegistrationModel.findById(oid).exec();
          if (!existingDoc) {
            errors.push({ name: item.name, error: 'Skill registration not found' });
            continue;
          }

          if (existingDoc.name !== item.name) {
            errors.push({
              name: item.name,
              error: 'package.json name does not match this registrationId',
            });
            continue;
          }

          if (
            existingDoc.authorIdentityId != null &&
            existingDoc.authorIdentityId !== authorIdentityId
          ) {
            errors.push({
              name: item.name,
              error: 'Only the skill author can publish updates to this skill',
            });
            continue;
          }

          const hadPublished = existingDoc.publishedContent != null;
          isNew = !hadPublished;

          const resolvedVersion = resolvePublishedSkillVersion(
            item.version,
            typeof existingDoc.version === 'string' ? existingDoc.version : undefined,
          );

          const updateBody = {
            name: item.name,
            category: item.category,
            version: resolvedVersion,
            modulePath: `published://${item.name}`,
            metadata: item.metadata ?? {},
            skillMd,
            publishedContent,
            isPrivate: !parsed.data.isPublic,
            authorIdentityId,
            publishedAt: new Date(),
            likeCount: existingDoc.likeCount ?? 0,
            usageCount: existingDoc.usageCount ?? 0,
          };

          saved = await this.skillRegistrationModel
            .findOneAndUpdate({ _id: oid }, updateBody, { new: true })
            .exec();
        } else {
          const existing = (await this.skillRegistrationModel
            .findOne({ name: item.name })
            .select('likeCount usageCount authorIdentityId publishedContent version')
            .lean()
            .exec()) as {
            likeCount?: number;
            usageCount?: number;
            authorIdentityId?: string;
            publishedContent?: unknown;
            version?: string;
          } | null;

          if (
            existing?.authorIdentityId != null &&
            existing.authorIdentityId !== authorIdentityId
          ) {
            errors.push({
              name: item.name,
              error: 'Only the skill author can publish updates to this skill',
            });
            continue;
          }

          const hadPublished = existing?.publishedContent != null;
          isNew = !hadPublished;

          const resolvedVersion = resolvePublishedSkillVersion(
            item.version,
            typeof existing?.version === 'string' ? existing.version : undefined,
          );

          const updateBody = {
            name: item.name,
            category: item.category,
            version: resolvedVersion,
            modulePath: `published://${item.name}`,
            metadata: item.metadata ?? {},
            skillMd,
            publishedContent,
            isPrivate: !parsed.data.isPublic,
            authorIdentityId,
            publishedAt: new Date(),
            likeCount: existing?.likeCount ?? 0,
            usageCount: existing?.usageCount ?? 0,
          };

          saved = await this.skillRegistrationModel
            .findOneAndUpdate({ name: item.name }, updateBody, { upsert: true, new: true })
            .exec();
        }

        if (!saved?._id) {
          errors.push({ name: item.name, error: 'Publish did not return a document' });
          continue;
        }

        published.push({
          name: item.name,
          status: isNew ? 'created' : 'updated',
          id: String(saved._id),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Publish failed for ${item.name}`, msg);
        errors.push({ name: item.name, error: msg });
      }
    }

    if (published.length > 0) {
      this.publishedSkillCatalog?.invalidate();
    }

    return { published, errors };
  }

  async listCatalog(query: Record<string, unknown>) {
    const q = SkillListQuerySchema.parse(query);

    const parts: Record<string, unknown>[] = [{ publishedContent: { $ne: null } }];

    if (q.q?.trim()) {
      const rx = new RegExp(escapeRegex(q.q.trim()), 'i');
      parts.push({ $or: [{ name: rx }, { 'skillMd.description': rx }] });
    }

    const filter = { $and: parts };

    const sortKey =
      q.sort === 'popular' ? 'likeCount' : q.sort === 'usage' ? 'usageCount' : 'publishedAt';
    const sort: Record<string, 1 | -1> = { [sortKey]: -1, name: 1 };

    const skip = (q.page - 1) * q.limit;

    const [rows, total] = await Promise.all([
      this.skillRegistrationModel.find(filter).sort(sort).skip(skip).limit(q.limit).lean().exec(),
      this.skillRegistrationModel.countDocuments(filter),
    ]);

    const authorIds = [...new Set(rows.map((r) => r.authorIdentityId).filter(Boolean))] as string[];
    const authorObjectIds = authorIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const authors =
      authorObjectIds.length > 0
        ? await this.identityModel
            .find({ _id: { $in: authorObjectIds } })
            .select('displayName')
            .lean()
            .exec()
        : [];

    const authorMap = new Map<string, string>(
      authors.map((a: any) => [String(a._id), a.displayName ?? 'unknown']),
    );

    const skills = rows.map((r: any) => ({
      id: String(r._id),
      name: r.name,
      description: (r.skillMd?.description as string | undefined) ?? '',
      version: r.version,
      authorIdentityId: r.authorIdentityId ?? '',
      authorDisplayName: r.authorIdentityId
        ? (authorMap.get(String(r.authorIdentityId)) ?? 'unknown')
        : '—',
      likeCount: r.likeCount ?? 0,
      usageCount: r.usageCount ?? 0,
      publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    }));

    return { skills, total, page: q.page, limit: q.limit };
  }

  async getSkillContent(name: string) {
    const doc = (await this.skillRegistrationModel
      .findOne({
        name,
        publishedContent: { $ne: null },
      })
      .lean()
      .exec()) as {
      name: string;
      version: string;
      publishedContent: { skillMdRaw: string; manifest?: Record<string, unknown> };
      _id: mongoose.Types.ObjectId;
    } | null;

    if (!doc?.publishedContent) {
      throw new NotFoundError('Skill not found');
    }

    const pc = doc.publishedContent;
    return {
      id: String(doc._id),
      name: doc.name,
      version: doc.version,
      skillMdRaw: pc.skillMdRaw,
      manifest: (pc.manifest ?? {}) as Record<string, unknown>,
    };
  }

  async getSkillContentByRegistrationId(registrationId: string) {
    if (!mongoose.Types.ObjectId.isValid(registrationId)) {
      throw new ValidationError('Invalid registrationId');
    }

    const doc = (await this.skillRegistrationModel
      .findOne({
        _id: new mongoose.Types.ObjectId(registrationId),
        publishedContent: { $ne: null },
      })
      .lean()
      .exec()) as {
      _id: mongoose.Types.ObjectId;
      name: string;
      version: string;
      publishedContent: { skillMdRaw: string; manifest?: Record<string, unknown> };
    } | null;

    if (!doc?.publishedContent) {
      throw new NotFoundError('Skill not found');
    }

    const pc = doc.publishedContent;
    return {
      id: String(doc._id),
      name: doc.name,
      version: doc.version,
      skillMdRaw: pc.skillMdRaw,
      manifest: (pc.manifest ?? {}) as Record<string, unknown>,
    };
  }

  async toggleLike(name: string, identityId: string): Promise<{ liked: boolean; likeCount: number }> {
    const skill = await this.skillRegistrationModel
      .findOne({ name, publishedContent: { $ne: null } })
      .exec();

    if (!skill) {
      throw new NotFoundError('Skill not found');
    }

    const skillId = skill._id;
    const existing = await this.skillLikeModel.findOne({ skillId, identityId }).exec();

    if (existing) {
      await this.skillLikeModel.deleteOne({ _id: existing._id }).exec();
      const next = (await this.skillRegistrationModel
        .findOneAndUpdate(
          { _id: skillId, likeCount: { $gt: 0 } },
          { $inc: { likeCount: -1 } },
          { new: true },
        )
        .exec()) as { likeCount?: number } | null;
      return { liked: false, likeCount: next?.likeCount ?? 0 };
    }

    try {
      await safeCreate(this.skillLikeModel, { skillId, identityId });
    } catch (err: any) {
      if (err?.code !== 11000) {
        throw err;
      }
      const next = (await this.skillRegistrationModel.findById(skillId).lean().exec()) as unknown as {
        likeCount?: number;
      } | null;
      return { liked: true, likeCount: next?.likeCount ?? 0 };
    }

    const next = (await this.skillRegistrationModel
      .findByIdAndUpdate(skillId, { $inc: { likeCount: 1 } }, { new: true })
      .exec()) as { likeCount?: number } | null;

    return { liked: true, likeCount: next?.likeCount ?? 0 };
  }

  async deleteSkill(registrationId: string, identityId: string): Promise<{ deleted: true; id: string }> {
    if (!mongoose.Types.ObjectId.isValid(registrationId)) {
      throw new ValidationError('Invalid registrationId');
    }

    const skill = await this.skillRegistrationModel
      .findOne({
        _id: new mongoose.Types.ObjectId(registrationId),
        publishedContent: { $ne: null },
      })
      .exec();

    if (!skill) {
      throw new NotFoundError('Skill not found');
    }

    const author = skill.authorIdentityId as string | undefined;
    if (!author) {
      throw new ForbiddenError('This skill has no recorded author; it cannot be deleted via this API');
    }
    if (author !== identityId) {
      throw new ForbiddenError('Only the skill author can delete this skill');
    }

    const skillId = skill._id;
    await this.skillLikeModel.deleteMany({ skillId }).exec();

    await this.skillRegistrationModel
      .updateOne(
        { _id: skillId },
        {
          $set: {
            publishedContent: null,
            publishedAt: null,
            likeCount: 0,
          },
        },
      )
      .exec();

    this.publishedSkillCatalog?.invalidate();

    return { deleted: true, id: String(skillId) };
  }
}
