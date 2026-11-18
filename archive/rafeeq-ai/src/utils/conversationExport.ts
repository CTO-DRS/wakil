// Copyright (c) 2026 DRS AI. All rights reserved.
import { Share } from 'react-native';

import type { ChatMessage } from '../types';

/** Speaker labels used inside the exported Markdown file. */
export type ExportLabels = { user: string; assistant: string };

/**
 * Builds a portable Markdown transcript of one conversation. System-prompt
 * entries and messages that never received content (e.g. an interrupted
 * stream placeholder) are skipped. Pure — fully covered by unit tests.
 */
export function buildConversationMarkdown(
  title: string,
  messages: ChatMessage[],
  formatDate: (ms: number) => string,
  labels: ExportLabels,
): string {
  const lines: string[] = [`# ${title}`, ''];
  for (const m of messages) {
    const content = m.content.trim();
    if (!content || m.role === 'system') continue;
    const speaker = m.role === 'user' ? labels.user : labels.assistant;
    lines.push(`**${speaker}** · ${formatDate(m.createdAt)}`, '', content, '');
  }
  return lines.join('\n').trimEnd();
}

/**
 * Opens the system share sheet for a conversation transcript. Uses the built-in
 * React Native Share API (no extra native module) — the user stays in control
 * of where the text goes. Resolves false when the sheet is dismissed or fails.
 */
export async function shareConversationText(markdown: string): Promise<boolean> {
  try {
    const result = await Share.share({ message: markdown });
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}
