// Copyright (c) 2026 DRS AI. All rights reserved.
import type { Role } from '../types';

/** Direct one-tap actions rendered under a message bubble (no long-press menu). */
export type QuickActionKind = 'copy' | 'speak' | 'regenerate' | 'variants';

export type QuickActionInput = {
  role: Role;
  streaming: boolean;
  /** The inline rewrite editor is open for this message. */
  editing: boolean;
  content: string;
  /** This message is the newest one in the conversation. */
  isLast: boolean;
  /** Engine-level gate: model loaded and not generating right now. */
  allowRegenerate: boolean;
};

/**
 * Which one-tap actions belong under a bubble. Completed assistant replies with
 * final text always get copy + speak; the newest reply additionally gets
 * regenerate and the alternate-drafts trigger while the engine is free.
 * Anything else (streaming, empty text, editing in progress, user messages)
 * gets none — the long-press menu still carries the full action set.
 */
export function quickActionsFor({ role, streaming, editing, content, isLast, allowRegenerate }: QuickActionInput): QuickActionKind[] {
  const ready = role === 'assistant' && !streaming && !editing && content.trim().length > 0;
  if (!ready) return [];
  const actions: QuickActionKind[] = ['copy', 'speak'];
  if (isLast && allowRegenerate) actions.push('regenerate', 'variants');
  return actions;
}
