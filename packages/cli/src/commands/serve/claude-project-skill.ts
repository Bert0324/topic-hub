import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * First slash-command token on the first line (e.g. `speckit.specify` from `/speckit.specify …`).
 * Uses a strict pattern so Unix paths like `/home/foo` are not treated as commands.
 */
export function extractLeadingSlashToken(userText: string): string | undefined {
  const line = (userText.trim().split(/\r?\n/)[0] ?? '').trim();
  const re = /(?:^|\s)(\/[\w][\w.-]*)(?=\s|$)/;
  const m = re.exec(line);
  return m ? m[1].slice(1) : undefined;
}

/** Which project-local layout matched (Codex CLI convention vs Claude Code). */
export type ProjectLocalSkillBundle = 'claude' | 'codex';

export interface ClaudeProjectSkillMatch {
  /** Absolute path to SKILL.md */
  path: string;
  /** Directory name under the skills root */
  skillDirName: string;
  localBundle: ProjectLocalSkillBundle;
}

function findSkillMdUnderRoot(
  skillsRoot: string,
  candidates: string[],
  bundle: ProjectLocalSkillBundle,
): ClaudeProjectSkillMatch | null {
  try {
    if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) return null;
  } catch {
    return null;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  const byLower = new Map<string, string>();
  for (const e of entries) {
    if (e.isDirectory()) {
      byLower.set(e.name.toLowerCase(), e.name);
    }
  }

  for (const c of candidates) {
    const dirName = byLower.get(c.toLowerCase());
    if (!dirName) continue;
    const md = path.join(skillsRoot, dirName, 'SKILL.md');
    try {
      if (fs.existsSync(md) && fs.statSync(md).isFile()) {
        return { path: path.resolve(md), skillDirName: dirName, localBundle: bundle };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Resolves a project-local `SKILL.md` for a slash token under the agent cwd.
 *
 * Order: **`.claude/skills`** (Claude Code) then **`.codex/skills`** (Codex). Headless CLIs do not
 * reliably auto-load these; Topic Hub passes the file to executors (`--append-system-prompt-file`
 * for Claude, inlined body for Codex).
 *
 * Name mapping: e.g. `speckit.specify` → directory `speckit-specify` / `speckit_specify`.
 */
export function findClaudeProjectSkillMd(
  cwd: string | undefined,
  slashToken: string | undefined,
): ClaudeProjectSkillMatch | null {
  if (!cwd || !slashToken?.trim()) return null;
  const t = slashToken.trim();
  const candidates = [t, t.replace(/\./g, '-'), t.replace(/\./g, '_')];

  const claudeRoot = path.join(cwd, '.claude', 'skills');
  const fromClaude = findSkillMdUnderRoot(claudeRoot, candidates, 'claude');
  if (fromClaude) return fromClaude;

  const codexRoot = path.join(cwd, '.codex', 'skills');
  return findSkillMdUnderRoot(codexRoot, candidates, 'codex');
}
