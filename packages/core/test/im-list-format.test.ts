import {
  formatClaimedQueueListMarkdown,
  formatQaAnsweredAck,
  formatQaHowToReplyLine,
  formatQaListMarkdown,
  formatQaReminderMessage,
  formatQaSlotSummary,
  formatQueueAck,
} from '../src/im/im-list-format';

describe('im-list-format', () => {
  const sampleQa = {
    questionContext: { skillName: 'speckit-plan', topicTitle: 'My topic title' },
    questionText: 'What is the preferred stack?',
  };

  it('formatQaSlotSummary includes skill, topic, and truncated question', () => {
    const s = formatQaSlotSummary(sampleQa);
    expect(s).toContain('speckit-plan');
    expect(s).toContain('My topic title');
    expect(s).toMatch(/Q:/);
  });

  it('formatQaListMarkdown numbers oldest as #1', () => {
    const md = formatQaListMarkdown([sampleQa, { ...sampleQa, questionText: 'Second' }]);
    expect(md).toContain('#1');
    expect(md).toContain('#2');
    expect(md).toContain('/agent #M');
  });

  it('formatClaimedQueueListMarkdown includes skillName and since line', () => {
    const md = formatClaimedQueueListMarkdown([
      { id: 'a', skillName: 'my-skill', createdAt: '13:20' },
      { id: 'b', skillName: 'other', createdAt: null },
    ]);
    expect(md).toContain('#1');
    expect(md).toContain('my-skill');
    expect(md).toContain('since 13:20');
    expect(md).toContain('#2');
    expect(md).toContain('other');
    expect(md).toContain('/agent #M');
  });

  it('formatQaAnsweredAck echoes slot and skill summary', () => {
    const ack = formatQaAnsweredAck(2, sampleQa);
    expect(ack).toContain('#2');
    expect(ack).toContain('speckit-plan');
    expect(ack).toContain('Your agent will continue');
  });

  it('formatQueueAck includes skill and optional time', () => {
    const ack = formatQueueAck(1, { id: 'x', skillName: 'deploy', createdAt: '09:01' });
    expect(ack).toContain('Queued');
    expect(ack).toContain('#1');
    expect(ack).toContain('deploy');
    expect(ack).toContain('09:01');
  });

  it('formatQaHowToReplyLine matches reminder suffix and lists same summary', () => {
    const line = formatQaHowToReplyLine(3, sampleQa);
    expect(line).toContain('/agent #M');
    expect(line).toContain('speckit-plan');
    const reminder = formatQaReminderMessage(3, sampleQa);
    expect(reminder.startsWith('Reminder:')).toBe(true);
    expect(reminder).toContain(line);
  });
});
