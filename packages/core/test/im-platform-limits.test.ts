import {
  getImPlatformTotalMessageMax,
  getImTaskCompletionBodyBudgetChars,
  IM_TASK_COMPLETED_PREFIX,
} from '../src/im/im-platform-limits';

describe('im-platform-limits', () => {
  it('Discord total cap is 2000', () => {
    expect(getImPlatformTotalMessageMax('discord')).toBe(2000);
    expect(getImPlatformTotalMessageMax('Discord')).toBe(2000);
  });

  it('Feishu / Lark allows a much larger message', () => {
    expect(getImPlatformTotalMessageMax('feishu')).toBe(30_000);
    expect(getImPlatformTotalMessageMax('lark')).toBe(30_000);
  });

  it('body budget leaves room for completion prefix', () => {
    const b = getImTaskCompletionBodyBudgetChars('discord');
    expect(b).toBeGreaterThan(256);
    expect(IM_TASK_COMPLETED_PREFIX.length + b).toBeLessThan(2000);
  });
});
