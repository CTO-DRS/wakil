// Copyright (c) 2026 DRS AI. All rights reserved.
import { Share } from 'react-native';

import type { ChatMessage } from '../src/types';
import { buildConversationMarkdown, shareConversationText } from '../src/utils/conversationExport';

const fmt = (ms: number) => new Date(ms).toISOString();

function msg(role: ChatMessage['role'], content: string, createdAt: number, id = `m_${createdAt}`): ChatMessage {
  return { id, conversationId: 'c_1', role, content, createdAt, tokensPerSecond: null, tokenCount: null };
}

const labels = { user: 'You', assistant: 'Rafeeq' };

describe('conversationExport', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a markdown transcript with both speakers in order', () => {
    const md = buildConversationMarkdown(
      'مرحبا',
      [msg('user', 'أهلا', 1000), msg('assistant', 'وعليكم السلام', 2000)],
      fmt,
      labels,
    );
    expect(md).toContain('# مرحبا');
    expect(md).toContain(`**You** · ${fmt(1000)}`);
    expect(md).toContain('أهلا');
    expect(md).toContain(`**Rafeeq** · ${fmt(2000)}`);
    expect(md).toContain('وعليكم السلام');
    // Turns appear in chronological order.
    expect(md.indexOf('أهلا')).toBeLessThan(md.indexOf('وعليكم السلام'));
  });

  it('skips system entries and empty/whitespace messages', () => {
    const md = buildConversationMarkdown(
      'T',
      [msg('system', 'hidden prompt', 1), msg('user', '   ', 2), msg('assistant', 'visible', 3)],
      fmt,
      labels,
    );
    expect(md).not.toContain('hidden prompt');
    expect(md).not.toContain('system');
    expect(md).toContain('visible');
  });

  it('keeps markdown content such as code fences intact', () => {
    const md = buildConversationMarkdown('T', [msg('assistant', '```py\nprint(1)\n```', 5)], fmt, labels);
    expect(md).toContain('```py');
  });

  it('renders a title-only document when there are no exportable messages', () => {
    const md = buildConversationMarkdown('فارغة', [], fmt, labels);
    expect(md).toBe('# فارغة');
  });

  it('does not mutate the input messages array', () => {
    const messages = [msg('user', 'x', 1)];
    const snapshot = [...messages];
    buildConversationMarkdown('T', messages, fmt, labels);
    expect(messages).toEqual(snapshot);
  });

  it('opens the share sheet and reports success', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await expect(shareConversationText('# T')).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith({ message: '# T' });
  });

  it('reports a dismissed share sheet as not shared', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    await expect(shareConversationText('# T')).resolves.toBe(false);
  });

  it('reports share errors as false (e.g. text too large for the system sheet)', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('TransactionTooLargeException'));
    await expect(shareConversationText('# T')).resolves.toBe(false);
  });
});
