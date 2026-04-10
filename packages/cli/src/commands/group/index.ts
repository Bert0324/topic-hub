import { loadAdminToken } from '../../auth/auth.js';
import { ApiClient } from '../../api-client/api-client.js';
import { loadConfig } from '../../config/config.js';

export async function handleGroupCommand(
  subcommand: string | undefined,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case 'create': {
      const token = await loadAdminToken();
      if (!token) {
        console.error('Not authenticated. Run `topichub init` first.');
        process.exit(1);
      }

      const groupName = args[0]?.trim();
      if (!groupName) {
        console.error('Usage: topichub group create <group-name> [--platform <name>] [--members <ids...>] [--topic-type <type>]');
        process.exit(3);
      }

      const platformIdx = args.indexOf('--platform');
      const membersIdx = args.indexOf('--members');
      const topicTypeIdx = args.indexOf('--topic-type');

      const platform =
        platformIdx !== -1 ? args[platformIdx + 1]?.trim() : undefined;
      const members = membersIdx !== -1 ? args[membersIdx + 1]?.split(',') ?? [] : [];
      const topicType = topicTypeIdx !== -1 ? args[topicTypeIdx + 1] : undefined;

      if (!platform) {
        console.error('--platform is required and must be non-empty');
        process.exit(2);
      }

      const config = await loadConfig();
      const client = new ApiClient(
        config.serverUrl ?? 'http://localhost:3000',
        token,
      );

      try {
        const result = await client.post('/admin/groups', {
          name: groupName,
          platform,
          memberIds: members,
          topicType,
        }) as { groupId: string; platform: string; name: string; inviteLink: string | null };

        console.log(`✓ Created group "${result.name}" on ${result.platform} (group ID: ${result.groupId})`);
        if (result.inviteLink) {
          console.log(`  Invite link: ${result.inviteLink}`);
        }
      } catch (err) {
        console.error('Group creation failed:', err);
        process.exit(3);
      }
      break;
    }
    default:
      console.log('Usage: topichub group <subcommand>');
      console.log('Subcommands: create');
  }
}
