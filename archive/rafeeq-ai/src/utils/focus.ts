// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage } from '../types';

/**
 * The message focus mode can display: the newest message, but only while it is
 * a non-empty assistant reply — that is exactly the state during generation
 * (the streaming reply grows live) and right after it. A user message in the
 * last slot means a new turn started, so focus hides until the reply returns.
 */
export function focusTarget(messages: ChatMessage[]): ChatMessage | null {
  const last = messages[messages.length - 1];
  return last && last.role === 'assistant' && last.content.trim().length > 0 ? last : null;
}
