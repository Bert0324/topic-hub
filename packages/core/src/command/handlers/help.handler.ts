import { SkillCategory } from '../../common/enums';
import type { SkillRegistryPort } from '../command-router';

interface HelpEntry {
  type: string;
  description: string;
  customArgs: { name: string; type: string; required: boolean; description: string }[];
}

export class HelpHandler {
  constructor(private readonly skillRegistry: SkillRegistryPort) {}

  async execute() {
    const typeSkills = this.skillRegistry.getByCategory(SkillCategory.TYPE);

    const types: HelpEntry[] = typeSkills.map((s) => {
      const manifest = (s.skill as any).manifest;
      return {
        type: manifest.topicType,
        description: manifest.name,
        customArgs: manifest.customArgs ?? [],
      };
    });

    const commands = [
      { command: 'create <type>', description: 'Create a new topic' },
      { command: 'update --status <status>', description: 'Update topic status' },
      { command: 'assign --user <userId>', description: 'Assign a user to the topic' },
      { command: 'reopen', description: 'Reopen a closed topic' },
      { command: 'search --type <type> --status <status>', description: 'Search topics' },
      { command: 'timeline', description: 'Show topic timeline' },
      { command: 'show', description: 'Show current topic details' },
      { command: 'history', description: 'Show group topic history' },
      { command: 'help', description: 'Show this help message' },
    ];

    return {
      success: true,
      data: { commands, types },
      message: 'Available commands and topic types listed.',
    };
  }
}
