/// <reference types="jest" />

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  extractLeadingSlashToken,
  findClaudeProjectSkillMd,
} from '../src/commands/serve/claude-project-skill';

describe('extractLeadingSlashToken', () => {
  it('parses leading slash command', () => {
    expect(extractLeadingSlashToken('/speckit.specify 初始化')).toBe('speckit.specify');
  });

  it('parses after other words', () => {
    expect(extractLeadingSlashToken('Hub /speckit.specify x')).toBe('speckit.specify');
  });

  it('does not treat unix path as command', () => {
    expect(extractLeadingSlashToken('/home/rainson/x')).toBeUndefined();
  });

  it('returns undefined when no command token', () => {
    expect(extractLeadingSlashToken('hello')).toBeUndefined();
  });
});

describe('findClaudeProjectSkillMd', () => {
  it('maps dot token to hyphenated skill dir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'th-proj-skill-'));
    const dir = path.join(root, '.claude', 'skills', 'speckit-specify');
    fs.mkdirSync(dir, { recursive: true });
    const md = path.join(dir, 'SKILL.md');
    fs.writeFileSync(md, '---\nname: speckit\n---\nbody', 'utf-8');

    const got = findClaudeProjectSkillMd(root, 'speckit.specify');
    expect(got?.skillDirName).toBe('speckit-specify');
    expect(got?.path).toBe(path.resolve(md));
    expect(got?.localBundle).toBe('claude');

    fs.rmSync(root, { recursive: true });
  });

  it('resolves .codex/skills when .claude is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'th-codex-skill-'));
    const dir = path.join(root, '.codex', 'skills', 'my-skill');
    fs.mkdirSync(dir, { recursive: true });
    const md = path.join(dir, 'SKILL.md');
    fs.writeFileSync(md, '---\n---\ncodex body', 'utf-8');

    const got = findClaudeProjectSkillMd(root, 'my-skill');
    expect(got?.localBundle).toBe('codex');
    expect(got?.path).toBe(path.resolve(md));

    fs.rmSync(root, { recursive: true });
  });

  it('prefers .claude/skills over .codex/skills when both match', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'th-both-skill-'));
    for (const rel of ['.claude/skills/foo', '.codex/skills/foo']) {
      const d = path.join(root, rel);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'SKILL.md'), `---\n---\n${rel}`, 'utf-8');
    }
    const got = findClaudeProjectSkillMd(root, 'foo');
    expect(got?.localBundle).toBe('claude');
    expect(got?.path).toContain(path.join('.claude', 'skills', 'foo'));

    fs.rmSync(root, { recursive: true });
  });

  it('returns null when skills tree missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'th-proj-empty-'));
    expect(findClaudeProjectSkillMd(root, 'speckit.specify')).toBeNull();
    fs.rmSync(root, { recursive: true });
  });
});
