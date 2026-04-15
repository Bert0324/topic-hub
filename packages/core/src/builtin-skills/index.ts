import { GENERIC_TYPE_SKILL_MD, GENERIC_TYPE_VERSION } from './generic-type';

export interface BuiltinSkillEntry {
  name: string;
  mdContent: string;
  version: string;
}

const BUILTIN_SKILLS: BuiltinSkillEntry[] = [
  {
    name: 'generic-type',
    mdContent: GENERIC_TYPE_SKILL_MD,
    version: GENERIC_TYPE_VERSION,
  },
];

export function getBuiltinSkills(): BuiltinSkillEntry[] {
  return [...BUILTIN_SKILLS];
}

export { GENERIC_TYPE_SKILL_MD, GENERIC_TYPE_VERSION };
