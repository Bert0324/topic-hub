export interface ParsedCommand {
  action: string;
  type?: string;
  args: Record<string, string | boolean>;
}

export class CommandParser {
  private static readonly PREFIX = '/topichub';

  parse(input: string): ParsedCommand {
    const trimmed = input.trim();
    const normalized = trimmed.startsWith(CommandParser.PREFIX)
      ? trimmed.slice(CommandParser.PREFIX.length).trim()
      : trimmed;

    if (!normalized) {
      return { action: 'help', args: {} };
    }

    const tokens = this.tokenize(normalized);
    const action = tokens.shift()!.toLowerCase();

    let type: string | undefined;
    if (tokens.length > 0 && !tokens[0].startsWith('--')) {
      type = tokens.shift()!;
    }

    const args = this.parseArgs(tokens);

    return { action, ...(type ? { type } : {}), args };
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (inQuote) {
        if (ch === inQuote) {
          inQuote = null;
        } else {
          current += ch;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        inQuote = ch;
        continue;
      }

      if (ch === ' ' || ch === '\t') {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += ch;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private parseArgs(tokens: string[]): Record<string, string | boolean> {
    const args: Record<string, string | boolean> = {};

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (!token.startsWith('--')) continue;

      const key = token.slice(2);
      if (!key) continue;

      const next = tokens[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }

    return args;
  }
}
