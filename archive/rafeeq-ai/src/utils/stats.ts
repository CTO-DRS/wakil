// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Derived statistics for the settings insights lines. Kept as pure functions so
 * the aggregation lives in the repository and only the arithmetic lives here.
 */

/** Average generated tokens per assistant reply that reported an exact count. */
export function averageTokensPerReply(tokens: number, countedReplies: number): number {
  if (countedReplies <= 0) return 0;
  return Math.round(tokens / countedReplies);
}

/** Average number of messages a conversation holds. */
export function averageMessagesPerConversation(messages: number, conversations: number): number {
  if (conversations <= 0) return 0;
  return Math.round(messages / conversations);
}
