import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { z } from 'zod';
import { ParsedSkillMd, KNOWN_LIFECYCLE_EVENTS } from '../interfaces/skill-md';
import type { TopicHubLogger } from '../../common/logger';

const SKILL_MD_FILENAME = 'SKILL.md';

const frontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().min(1).max(1024),
  category: z.enum(['type', 'platform', 'adapter']).optional(),
  topicType: z.string().optional(),
  platform: z.string().optional(),
  sourceSystem: z.string().optional(),
  executor: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  allowedTools: z.array(z.string()).optional(),
});

const EVENT_HEADING_REGEX = /^##\s+(on\w+)\s*$/;
const knownEventsSet = new Set<string>(KNOWN_LIFECYCLE_EVENTS);

export class SkillMdParser {
  constructor(private readonly logger: TopicHubLogger) {}

  parse(skillDir: string): ParsedSkillMd | null {
    const filePath = path.join(skillDir, SKILL_MD_FILENAME);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      this.logger.warn(`Failed to read ${filePath}: ${(err as Error).message}`);
      return null;
    }

    return this.parseContent(raw, skillDir);
  }

  parseContent(raw: string, source?: string): ParsedSkillMd | null {
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch (err) {
      this.logger.warn(`Failed to parse frontmatter${source ? ` in ${source}` : ''}: ${(err as Error).message}`);
      return null;
    }

    const validation = frontmatterSchema.safeParse(parsed.data);
    if (!validation.success) {
      this.logger.warn(
        `Invalid SKILL.md frontmatter${source ? ` in ${source}` : ''}: ${validation.error.issues.map((i) => i.message).join(', ')}`,
      );
      return null;
    }

    const body = parsed.content.trim();
    const { eventPrompts } = this.extractEventSections(body);
    const hasAiInstructions = body.length > 0;

    return {
      frontmatter: validation.data,
      systemPrompt: body,
      eventPrompts,
      hasAiInstructions,
    };
  }

  private extractEventSections(body: string): {
    preamble: string;
    eventPrompts: Map<string, string>;
  } {
    const lines = body.split('\n');
    const eventPrompts = new Map<string, string>();
    const preambleLines: string[] = [];
    let currentEvent: string | null = null;
    let currentLines: string[] = [];

    for (const line of lines) {
      const match = line.match(EVENT_HEADING_REGEX);

      if (match && knownEventsSet.has(match[1])) {
        if (currentEvent) {
          eventPrompts.set(currentEvent, currentLines.join('\n').trim());
        }
        currentEvent = match[1];
        currentLines = [];
      } else if (currentEvent) {
        currentLines.push(line);
      } else {
        preambleLines.push(line);
      }
    }

    if (currentEvent) {
      eventPrompts.set(currentEvent, currentLines.join('\n').trim());
    }

    const preamble = preambleLines.join('\n').trim();

    if (eventPrompts.size > 0 && preamble.length > 0) {
      for (const [event, content] of eventPrompts) {
        eventPrompts.set(event, `${preamble}\n\n${content}`);
      }
    }

    return { preamble, eventPrompts };
  }
}
