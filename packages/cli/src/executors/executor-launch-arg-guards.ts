export function argvHasClaudePermissionMode(argv: string[]): boolean {
  return argv.some((a) => a === '--permission-mode' || a.startsWith('--permission-mode='));
}

/** True if Codex already has unattended / sandbox flags (serve runs without a TTY). */
export function argvHasCodexUnattendedFlags(argv: string[]): boolean {
  if (
    argv.includes('--full-auto')
    || argv.includes('--dangerously-bypass-approvals-and-sandbox')
  ) {
    return true;
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-s' || a === '--sandbox') return true;
    if (a.startsWith('--sandbox=')) return true;
    if (/^-s[^-]/.test(a)) return true;
  }
  return false;
}
