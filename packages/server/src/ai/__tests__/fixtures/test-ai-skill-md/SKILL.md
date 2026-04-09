---
name: test-ai-nl
description: >-
  Test skill that uses natural-language AI instructions.
  Used exclusively in integration tests.
---

# Test AI Analysis

You are a test analysis assistant. Analyze the topic data provided
and produce a brief structured assessment.

Output format:

**Assessment**: Brief summary
**Priority**: High / Medium / Low

## onTopicCreated

Perform a full assessment of the new topic including all metadata.
This is a test instruction for the onTopicCreated lifecycle event.

## onTopicUpdated

Re-assess based on what changed in the topic update.
This is a test instruction for the onTopicUpdated lifecycle event.
