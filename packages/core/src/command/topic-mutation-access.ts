export type TopicMutationSubject = {
  createdBy: string;
  assignees?: { userId: string }[];
};

/**
 * IM command path: actor is bound {@link CommandContext.userId} (topichub user id).
 * - No assignees: only {@link TopicMutationSubject.createdBy} may mutate.
 * - With assignees: only listed assignees may mutate (creator excluded unless also assigned).
 */
export function denyReasonIfCannotMutateTopic(
  topic: TopicMutationSubject,
  userId: string,
): string | null {
  const assignees = topic.assignees ?? [];
  if (assignees.length > 0) {
    const allowed = assignees.some((a) => a.userId === userId);
    if (!allowed) {
      return 'Only users assigned to this topic can modify it.';
    }
    return null;
  }

  const creator = String(topic.createdBy);
  if (userId !== creator) {
    return 'Only the topic creator can modify this topic.';
  }
  return null;
}
