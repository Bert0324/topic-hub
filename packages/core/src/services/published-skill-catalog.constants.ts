/** Default TTL for in-memory published-name set (seconds-aligned with spec). */
export const PUBLISHED_SKILL_CATALOG_TTL_MS = 60_000;

/**
 * Key under `enrichedPayload.event.payload` for Skill Center slash routing hints
 * (see specs/014 contracts).
 */
export const PUBLISHED_SKILL_ROUTING_PAYLOAD_KEY = 'publishedSkillRouting' as const;
