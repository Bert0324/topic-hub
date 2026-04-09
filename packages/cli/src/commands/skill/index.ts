import { ApiClient } from '../../api-client/api-client.js';

const api = new ApiClient();

export async function handleSkillCommand(sub: string, args: string[]) {
  switch (sub) {
    case 'list': {
      const data = await api.get<{ skills?: Array<{ name: string; category: string; version: string; enabled: boolean }> }>(
        '/admin/skills'
      );
      console.log('\nInstalled Skills:');
      console.log('─'.repeat(60));
      if (!data.skills?.length) {
        console.log('  No skills installed.');
        return;
      }
      console.log(
        '  ' + 'Name'.padEnd(20) + 'Category'.padEnd(12) + 'Version'.padEnd(10) + 'Enabled'
      );
      console.log('  ' + '─'.repeat(52));
      for (const s of data.skills) {
        console.log(
          '  ' +
            s.name.padEnd(20) +
            s.category.padEnd(12) +
            s.version.padEnd(10) +
            (s.enabled ? '✓' : '✗')
        );
      }
      break;
    }
    case 'install': {
      const pkg = args[0];
      if (!pkg) {
        console.log('Usage: skill install <package-or-path>');
        return;
      }
      const result = await api.post<{ name: string; version: string; category: string }>('/admin/skills', {
        packagePath: pkg,
      });
      console.log(`✓ Installed ${result.name} v${result.version} (${result.category})`);
      break;
    }
    case 'enable': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill enable <name>');
        return;
      }
      await api.patch(`/admin/tenants/current/skills/${name}`, { enabled: true });
      console.log(`✓ Enabled ${name}`);
      break;
    }
    case 'disable': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill disable <name>');
        return;
      }
      await api.patch(`/admin/tenants/current/skills/${name}`, { enabled: false });
      console.log(`✓ Disabled ${name}`);
      break;
    }
    case 'setup': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill setup <name>');
        return;
      }
      console.log(`Running setup for ${name}...`);
      console.log('(Skill setup delegates to Skill.runSetup - not yet fully implemented)');
      break;
    }
    case 'config': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill config <name> --show');
        return;
      }
      const config = await api.get(`/admin/tenants/current/skills/${name}`);
      console.log(JSON.stringify(config, null, 2));
      break;
    }
    case 'uninstall': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill uninstall <name>');
        return;
      }
      await api.delete(`/admin/skills/${name}`);
      console.log(`✓ Uninstalled ${name}`);
      break;
    }
    default:
      console.log('Usage: topichub-admin skill <list|install|enable|disable|setup|config|uninstall>');
  }
}
