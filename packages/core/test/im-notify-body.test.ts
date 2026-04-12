import { IM_SUMMARY_MIN_LENGTH, pickImNotifyBody } from '../src/im/im-notify-body';

describe('pickImNotifyBody', () => {
  it('uses full text when below length threshold (ignores imSummary)', () => {
    const text = 'short answer';
    const imSummary = 'wrong summary';
    expect(text.length).toBeLessThan(IM_SUMMARY_MIN_LENGTH);
    expect(pickImNotifyBody(text, imSummary)).toBe('short answer');
  });

  it('uses imSummary when text is long enough', () => {
    const text = 'x'.repeat(IM_SUMMARY_MIN_LENGTH);
    const imSummary = 'compressed';
    expect(pickImNotifyBody(text, imSummary)).toBe('compressed');
  });

  it('falls back to text when long but no imSummary', () => {
    const text = 'y'.repeat(IM_SUMMARY_MIN_LENGTH);
    expect(pickImNotifyBody(text, undefined)).toBe(text.trim());
  });

  it('prefers imSummary when body exceeds IM budget', () => {
    const text = 'a'.repeat(5000);
    const imSummary = 'short';
    expect(pickImNotifyBody(text, imSummary, 2000)).toBe('short');
  });

  it('returns full body when within IM budget', () => {
    const text = 'hello';
    expect(pickImNotifyBody(text, 'ignored', 2000)).toBe('hello');
  });
});
