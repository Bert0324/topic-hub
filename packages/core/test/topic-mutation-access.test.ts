import {
  denyReasonIfCannotMutateTopic,
  type TopicMutationSubject,
} from '../src/command/topic-mutation-access';

describe('denyReasonIfCannotMutateTopic', () => {
  const creator = 'user-creator';
  const other = 'user-other';
  const assigneeA = 'user-assignee-a';

  describe('no assignees', () => {
    const topic: TopicMutationSubject = {
      createdBy: creator,
      assignees: [],
    };

    it('allows creator', () => {
      expect(denyReasonIfCannotMutateTopic(topic, creator)).toBeNull();
    });

    it('denies non-creator', () => {
      expect(denyReasonIfCannotMutateTopic(topic, other)).toBe(
        'Only the topic creator can modify this topic.',
      );
    });

    it('treats missing assignees like empty', () => {
      const t: TopicMutationSubject = { createdBy: creator };
      expect(denyReasonIfCannotMutateTopic(t, creator)).toBeNull();
      expect(denyReasonIfCannotMutateTopic(t, other)).toBe(
        'Only the topic creator can modify this topic.',
      );
    });
  });

  describe('with assignees', () => {
    const topic: TopicMutationSubject = {
      createdBy: creator,
      assignees: [{ userId: assigneeA }],
    };

    it('allows listed assignee', () => {
      expect(denyReasonIfCannotMutateTopic(topic, assigneeA)).toBeNull();
    });

    it('denies creator not in assignee list', () => {
      expect(denyReasonIfCannotMutateTopic(topic, creator)).toBe(
        'Only users assigned to this topic can modify it.',
      );
    });

    it('denies unrelated user', () => {
      expect(denyReasonIfCannotMutateTopic(topic, other)).toBe(
        'Only users assigned to this topic can modify it.',
      );
    });

    it('allows creator when also assigned', () => {
      const t: TopicMutationSubject = {
        createdBy: creator,
        assignees: [{ userId: assigneeA }, { userId: creator }],
      };
      expect(denyReasonIfCannotMutateTopic(t, creator)).toBeNull();
    });
  });
});
