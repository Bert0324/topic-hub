/// <reference types="jest" />

import { normalizeTopicHubServerRoot } from '../src/api-client/native-gateway';

describe('normalizeTopicHubServerRoot', () => {
  it('strips trailing /topic-hub once', () => {
    expect(normalizeTopicHubServerRoot('https://hk.ltflange.cn/topic-hub')).toBe(
      'https://hk.ltflange.cn',
    );
  });

  it('strips doubled segment from pasted gateway URL', () => {
    expect(normalizeTopicHubServerRoot('https://hk.ltflange.cn/topic-hub/topic-hub')).toBe(
      'https://hk.ltflange.cn',
    );
  });

  it('leaves clean base URL unchanged', () => {
    expect(normalizeTopicHubServerRoot('https://hk.ltflange.cn')).toBe('https://hk.ltflange.cn');
  });

  it('trims slashes', () => {
    expect(normalizeTopicHubServerRoot('https://hk.ltflange.cn/topic-hub///')).toBe(
      'https://hk.ltflange.cn',
    );
  });
});
