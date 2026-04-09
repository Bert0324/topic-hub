import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillMdParser } from '../../src/skill/registry/skill-md-parser';

describe('SkillMdParser', () => {
  let parser: SkillMdParser;
  let tmpDir: string;

  beforeEach(() => {
    parser = new SkillMdParser();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-md-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSkillMd(content: string): void {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), content, 'utf-8');
  }

  it('should return null when SKILL.md does not exist', () => {
    expect(parser.parse(tmpDir)).toBeNull();
  });

  it('should parse valid SKILL.md with frontmatter and body', () => {
    writeSkillMd(`---
name: alert-triage
description: Analyze alert topics
---

Analyze the alert and provide a severity assessment.
`);

    const result = parser.parse(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe('alert-triage');
    expect(result!.frontmatter.description).toBe('Analyze alert topics');
    expect(result!.systemPrompt).toContain('Analyze the alert');
    expect(result!.hasAiInstructions).toBe(true);
    expect(result!.eventPrompts.size).toBe(0);
  });

  it('should extract event-specific sections from ## headings', () => {
    writeSkillMd(`---
name: my-skill
description: A test skill
---

General instructions here.

## onTopicCreated

Do something on creation.

## onTopicUpdated

Do something on update.
`);

    const result = parser.parse(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.eventPrompts.size).toBe(2);
    expect(result!.eventPrompts.get('onTopicCreated')).toContain('Do something on creation.');
    expect(result!.eventPrompts.get('onTopicUpdated')).toContain('Do something on update.');
  });

  it('should include preamble in event-specific prompts', () => {
    writeSkillMd(`---
name: my-skill
description: A test skill
---

You are an alert analyst.

## onTopicCreated

Assess severity.
`);

    const result = parser.parse(tmpDir);
    expect(result).not.toBeNull();
    const createdPrompt = result!.eventPrompts.get('onTopicCreated');
    expect(createdPrompt).toContain('You are an alert analyst.');
    expect(createdPrompt).toContain('Assess severity.');
  });

  it('should return hasAiInstructions=false for empty body', () => {
    writeSkillMd(`---
name: empty-skill
description: A skill with no instructions
---
`);

    const result = parser.parse(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.hasAiInstructions).toBe(false);
    expect(result!.systemPrompt).toBe('');
  });

  it('should return null for missing frontmatter', () => {
    writeSkillMd('Just some markdown without frontmatter.');
    expect(parser.parse(tmpDir)).toBeNull();
  });

  it('should return null for invalid frontmatter name (too long)', () => {
    writeSkillMd(`---
name: ${'a'.repeat(65)}
description: Valid description
---

Body content.
`);

    expect(parser.parse(tmpDir)).toBeNull();
  });

  it('should return null for invalid frontmatter name (uppercase)', () => {
    writeSkillMd(`---
name: MySkill
description: Valid description
---

Body content.
`);

    expect(parser.parse(tmpDir)).toBeNull();
  });

  it('should return null for missing description', () => {
    writeSkillMd(`---
name: valid-name
---

Body content.
`);

    expect(parser.parse(tmpDir)).toBeNull();
  });

  it('should treat unknown ## headings as regular content', () => {
    writeSkillMd(`---
name: my-skill
description: A test skill
---

## Overview

Some overview text.

## onTopicCreated

Creation instructions.
`);

    const result = parser.parse(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.eventPrompts.size).toBe(1);
    expect(result!.eventPrompts.has('onTopicCreated')).toBe(true);
    const createdPrompt = result!.eventPrompts.get('onTopicCreated')!;
    expect(createdPrompt).toContain('Overview');
    expect(createdPrompt).toContain('Some overview text.');
    expect(createdPrompt).toContain('Creation instructions.');
  });

  it('should handle all known lifecycle event headings', () => {
    const events = [
      'onTopicCreated',
      'onTopicUpdated',
      'onTopicStatusChanged',
      'onTopicAssigned',
      'onTopicClosed',
      'onTopicReopened',
      'onSignalAttached',
      'onTagChanged',
    ];

    const sections = events.map((e) => `## ${e}\n\nContent for ${e}.`).join('\n\n');

    writeSkillMd(`---
name: all-events
description: Tests all events
---

${sections}
`);

    const result = parser.parse(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.eventPrompts.size).toBe(events.length);
    for (const event of events) {
      expect(result!.eventPrompts.has(event)).toBe(true);
      expect(result!.eventPrompts.get(event)).toContain(`Content for ${event}.`);
    }
  });
});
