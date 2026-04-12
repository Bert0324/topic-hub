import type { PublishedSkillCatalog } from '../services/published-skill-catalog';

/**
 * Precedence: published Skill Center name (canonical from catalog), then disk/registry match.
 */
export function createCompositeSkillCommandMatcher(
  catalog: Pick<PublishedSkillCatalog, 'matchPublishedName'>,
  diskMatch: (token: string) => string | undefined,
): (token: string) => string | undefined {
  return (token: string) => {
    const fromCatalog = catalog.matchPublishedName(token);
    if (fromCatalog) return fromCatalog;
    return diskMatch(token);
  };
}
