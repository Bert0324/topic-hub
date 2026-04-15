import type { AuthService } from '../services/auth.service';
import type { SkillCenterService } from '../services/skill-center.service';

/**
 * HTTP-oriented skill catalog operations: auth resolution lives here so the Nest layer stays thin.
 */
export class SkillCenterHttpAdapter {
  constructor(
    private readonly skillCenter: SkillCenterService,
    private readonly auth: AuthService,
  ) {}

  listCatalog(query: Record<string, unknown>) {
    return this.skillCenter.listCatalog(query);
  }

  getSkillContentByRegistrationId(registrationId: string) {
    return this.skillCenter.getSkillContentByRegistrationId(registrationId);
  }

  async deleteSkill(
    registrationId: string,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const auth = await this.auth.resolveFromHeaders(headers);
    return this.skillCenter.deleteSkill(registrationId, auth.identityId);
  }

  getSkillContent(name: string) {
    return this.skillCenter.getSkillContent(name);
  }

  async toggleLike(name: string, headers: Record<string, string | string[] | undefined>) {
    const auth = await this.auth.resolveFromHeaders(headers);
    return this.skillCenter.toggleLike(name, auth.identityId);
  }
}
