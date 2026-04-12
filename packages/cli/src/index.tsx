#!/usr/bin/env node
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const restArgs = args.slice(2);

async function main() {
  switch (command) {
    case 'init': {
      const { handleInitCommand } = await import('./commands/init/index.js');
      await handleInitCommand();
      break;
    }
    case 'serve': {
      const { handleServeCommand } = await import('./commands/serve/index.js');
      await handleServeCommand(restArgs);
      break;
    }
    case 'identity': {
      const { handleIdentityCommand } = await import('./commands/identity/index.js');
      await handleIdentityCommand(subcommand, restArgs);
      break;
    }
    case 'publish': {
      const { handlePublishCommand } = await import('./commands/publish/index.js');
      await handlePublishCommand(args.slice(1));
      break;
    }
    case 'skills': {
      const { handleSkillsCommand } = await import('./commands/skills/index.js');
      await handleSkillsCommand(subcommand, restArgs);
      break;
    }
    case 'skill-repo': {
      const { handleSkillRepoCommand } = await import('./commands/skill-repo/index.js');
      await handleSkillRepoCommand(subcommand, restArgs);
      break;
    }
    case 'login': {
      const { saveIdentityToken } = await import('./auth/auth.js');
      const { loadConfigOrNull } = await import('./config/config.js');
      const { postNativeGateway } = await import('./api-client/native-gateway.js');
      const tokenArg = args[1];
      const tokenFromPrompt = async () => {
        const { password } = await import('@inquirer/prompts');
        return password({
          message: 'Paste your identity/admin token',
          mask: '*',
          validate: (val) => val.length >= 10 || 'Token seems too short',
        });
      };
      const token = (tokenArg ?? (await tokenFromPrompt())).trim();
      const config = loadConfigOrNull();
      if (config) {
        process.stdout.write('  Validating token... ');
        try {
          await postNativeGateway(
            config.serverUrl,
            'identity.me',
            {},
            { authorization: token, signal: AbortSignal.timeout(5000) },
          );
          console.log('✓ Token valid');
        } catch (err) {
          console.log('✗ Failed');
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Token validation failed: ${msg}`);
        }
      }

      await saveIdentityToken(token);
      console.log('  ✓ Token saved.');
      break;
    }
    case 'logout': {
      const { clearAllTokens } = await import('./auth/auth.js');
      await clearAllTokens();
      console.log('Logged out. All tokens cleared.');
      break;
    }
    case 'help':
    default:
      printHelp();
  }
}

function printHelp() {
  const help = `
  Usage: topichub-admin <command> [subcommand] [options]

  Setup & Auth
    init                              Interactive local environment setup
    login [token]                     Save identity/admin token (from /id create)
    logout                            Clear all stored tokens

  Runtime
    serve [options]                   Start executor daemon (SSE + heartbeat)
      --executor <name>               Override configured executor
      --max-agents <n>                Max concurrent agents (1–10)
      --agent-cwd <dir>               Override agent cwd (else TOPICHUB_AGENT_CWD, else INIT_CWD / process.cwd())
      --force                         Force start even if executor not on PATH
      --yes                           Skip executor launch prompts (use defaults for headless flags)

  Identity Management
    identity me                       View your identity details
    identity create [options]         Create a new identity (superadmin)
      --unique-id <id>                Required. Unique identifier
      --name <display-name>           Required. Display name
    identity list                     List all identities (superadmin)
    identity revoke --id <id>         Revoke an identity (superadmin)
    identity regenerate-token --id <id>
                                      Regenerate identity token (superadmin)

  Skills
    publish [--id <id>] <path>         Publish a skill (identity/executor/admin token; author-only updates)
                                      Use --id from "skills list" to update that registration
                                      <path>: skill directory, or SKILL.md / package.json inside it (md-only: no package.json)
                                      (alias: skills publish …)
    skills list [--page n] [--limit n] [--sort popular|recent|usage]
                                      List published skills (author, version, uses, likes)
    skills star <name>                Like / star a skill (identity or executor token)
    skills view <name>                Download skill by name into skillsDir
    skills view --id <id>            Download skill by registration id
    skills delete <id>               Unpublish by registration id (author only; id from list)
    skill-repo list [--page n] …      List published skills (Skill Center catalog)

  help                                Show this message
`;
  console.log(help);
}

main().catch(console.error);
