import { normalizeImCommandMessage } from '../src/bridge/openclaw-bridge';

describe('normalizeImCommandMessage', () => {
  it('strips short display label before /help (Feishu-style)', () => {
    expect(normalizeImCommandMessage('Topic Hub /help')).toBe('/help');
    expect(normalizeImCommandMessage('Topic Hub /help ')).toBe('/help');
  });

  it('still handles @Bot /help', () => {
    expect(normalizeImCommandMessage('@Topic Hub /help')).toBe('/help');
  });

  it('strips Feishu <at> then label is not needed', () => {
    const at = '<at user_id="x">Topic Hub</at> /help';
    expect(normalizeImCommandMessage(at)).toBe('/help');
  });

  it('strips Feishu self-closing <at …/> before /command', () => {
    expect(normalizeImCommandMessage('<at user_id="ou_xxx"/> /help')).toBe('/help');
    expect(normalizeImCommandMessage('<at user_id="ou_xxx"/>/help')).toBe('/help');
  });

  it('normalizes full-width slash to ASCII for commands', () => {
    expect(normalizeImCommandMessage('／help')).toBe('/help');
    expect(normalizeImCommandMessage('<at user_id="x">B</at> ／help')).toBe('/help');
  });

  it('does not strip long sentence prefixes', () => {
    const long = 'please read the docs and run /help when ready';
    expect(normalizeImCommandMessage(long)).toBe(long);
  });

  it('leaves slash-free text unchanged', () => {
    expect(normalizeImCommandMessage('hello world')).toBe('hello world');
  });
});
