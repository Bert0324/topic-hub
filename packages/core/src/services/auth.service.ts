import { Model } from 'mongoose';
import { UnauthorizedError } from '../common/errors';
import { IDENTITY_STATUS } from '../identity/identity-types';
import { EXECUTOR_STATUS } from '../identity/executor-types';

export interface ResolvedAuth {
  identityId: string;
  isSuperAdmin: boolean;
  executorToken?: string;
}

export class AuthService {
  constructor(
    private readonly identityModel: Model<any>,
    private readonly executorModel: Model<any>,
  ) {}

  async resolveFromHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<ResolvedAuth> {
    const auth = headers['authorization'] ?? headers['Authorization'];
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authentication');
    }

    const token = auth.slice(7);
    return this.resolveToken(token);
  }

  async resolveToken(token: string): Promise<ResolvedAuth> {
    const identity = await this.identityModel.findOne({
      token,
      status: IDENTITY_STATUS.ACTIVE,
    }).exec();

    if (identity) {
      return {
        identityId: identity._id.toString(),
        isSuperAdmin: identity.isSuperAdmin,
      };
    }

    const executor = await this.executorModel.findOne({
      executorToken: token,
      status: EXECUTOR_STATUS.ACTIVE,
    }).exec();

    if (executor) {
      return {
        identityId: executor.identityId,
        isSuperAdmin: false,
        executorToken: executor.executorToken,
      };
    }

    throw new UnauthorizedError('Missing or invalid authentication');
  }

  async requireSuperadmin(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ identityId: string }> {
    const auth = await this.resolveFromHeaders(headers);
    if (!auth.isSuperAdmin) {
      throw new UnauthorizedError('Superadmin access required');
    }
    return { identityId: auth.identityId };
  }

  async requireExecutor(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ identityId: string; executorToken: string }> {
    const auth = await this.resolveFromHeaders(headers);
    if (!auth.executorToken) {
      throw new UnauthorizedError('Executor token required');
    }
    return { identityId: auth.identityId, executorToken: auth.executorToken };
  }
}
