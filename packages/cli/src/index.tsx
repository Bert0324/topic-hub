#!/usr/bin/env node
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const restArgs = args.slice(2);

async function main() {
  switch (command) {
    case 'skill': {
      const { handleSkillCommand } = await import('./commands/skill/index.js');
      await handleSkillCommand(subcommand, restArgs);
      break;
    }
    case 'tenant': {
      const { handleTenantCommand } = await import('./commands/tenant/index.js');
      await handleTenantCommand(subcommand, restArgs);
      break;
    }
    case 'stats': {
      const { handleStatsCommand } = await import('./commands/stats.js');
      await handleStatsCommand(restArgs);
      break;
    }
    case 'health': {
      const { handleHealthCommand } = await import('./commands/health.js');
      await handleHealthCommand();
      break;
    }
    case 'ai': {
      const { handleAiCommand } = await import('./commands/ai/index.js');
      await handleAiCommand(subcommand, restArgs);
      break;
    }
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
    case 'skill-repo': {
      const { handleSkillRepoCommand } = await import('./commands/skill-repo/index.js');
      await handleSkillRepoCommand(subcommand, restArgs);
      break;
    }
    case 'publish': {
      const { handlePublishCommand } = await import('./commands/publish/index.js');
      await handlePublishCommand(args.slice(1));
      break;
    }
    case 'group': {
      const { handleGroupCommand } = await import('./commands/group/index.js');
      await handleGroupCommand(subcommand, restArgs);
      break;
    }
    case 'auth': {
      const { saveAdminToken } = await import('./auth/auth.js');
      if (args[1]) {
        await saveAdminToken(args[1]);
        console.log('Authenticated as tenant admin.');
      } else {
        console.log('Usage: topichub-admin auth <token>');
      }
      break;
    }
    case 'login': {
      const { login } = await import('./auth/auth.js');
      const pkceConfig = {
        authorizeUrl: process.env.TOPICHUB_AUTHORIZE_URL ?? 'https://auth.topichub.dev/authorize',
        tokenUrl: process.env.TOPICHUB_TOKEN_URL ?? 'https://auth.topichub.dev/oauth/token',
        clientId: process.env.TOPICHUB_CLIENT_ID ?? 'topichub-cli',
        redirectUri: '',
        scopes: ['openid', 'profile', 'email'],
      };
      const result = await login(pkceConfig);
      console.log(`Logged in as ${result.displayName}`);
      break;
    }
    case 'logout': {
      const { clearAllTokens } = await import('./auth/auth.js');
      await clearAllTokens();
      console.log('Logged out. All tokens cleared.');
      break;
    }
    default:
      console.log('Usage: topichub-admin <command> [subcommand] [args]');
      console.log('Commands: init, serve, skill, skill-repo, publish, group, tenant, stats, health, ai, auth, login, logout');
  }
}

main().catch(console.error);
