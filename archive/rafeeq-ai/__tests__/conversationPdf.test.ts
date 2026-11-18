// Copyright (c) 2026 DRS AI. All rights reserved.
import { buildConversationHtml, escapeHtml, pdfFileName } from '../src/utils/conversationPdf';

import type { ChatMessage } from '../src/types';

const msg = (id: string, role: ChatMessage['role'], content: string, createdAt = 1700000000000): ChatMessage => ({
  id,
  conversationId: 'c1',
  role,
  content,
  createdAt,
  tokensPerSecond: null,
  tokenCount: null,
});

const DATE = () => 'DATE';
const labels = { user: 'أنت', assistant: 'رفيق' };

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`a<&>"'b`)).toBe('a&lt;&amp;&gt;&quot;&#39;b');
  });

  it('leaves Arabic and plain text untouched', () => {
    expect(escapeHtml('مرحبا بالعالم — 123')).toBe('مرحبا بالعالم — 123');
  });
});

describe('pdfFileName', () => {
  it('is sortable and human-friendly', () => {
    // 2026-01-05 09:07 local time, built from the date components themselves.
    const ts = new Date(2026, 0, 5, 9, 7).getTime();
    expect(pdfFileName(ts)).toBe('rafeeq-chat-20260105-0907.pdf');
  });
});

describe('buildConversationHtml', () => {
  const messages = [
    msg('s1', 'system', 'hidden system prompt'),
    msg('u1', 'user', 'مرحبا', 1700000000000),
    msg('a1', 'assistant', 'أهلا بك\nبكل لغاتك', 1700000001000),
    msg('u2', 'user', '   '), // empty after trim: skipped
  ];

  it('keeps the same skip rules as the Markdown export', () => {
    const html = buildConversationHtml('محادثتي', messages, DATE, labels, 'ar');
    expect(html).not.toContain('hidden system prompt');
    expect(html).toContain('مرحبا');
    expect(html).toContain('أهلا بك\nبكل لغاتك'); // newlines survive for pre-wrap
    expect(html.match(/class="msg /g)).toHaveLength(2);
  });

  it('labels speakers and formats dates through the callback', () => {
    const html = buildConversationHtml('t', messages, DATE, labels, 'ar');
    expect(html).toContain('أنت · DATE');
    expect(html).toContain('رفيق · DATE');
  });

  it('follows the locale for the document chrome and auto-direction per bubble', () => {
    const ar = buildConversationHtml('t', messages, DATE, labels, 'ar');
    expect(ar).toContain('lang="ar" dir="rtl"');
    const en = buildConversationHtml('t', messages, DATE, labels, 'en');
    expect(en).toContain('lang="en" dir="ltr"');
    expect(ar.match(/dir="auto"/g)!.length).toBeGreaterThanOrEqual(3); // every meta and bubble
  });

  it('escapes markup in titles, labels and message content', () => {
    const html = buildConversationHtml('<b>Title</b>', [msg('u1', 'user', '<script>alert(1)</script>')], DATE, labels, 'en');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Title</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Title&lt;/b&gt;');
  });

  it('produces a valid document even with nothing to show', () => {
    const html = buildConversationHtml('فارغة', [], DATE, labels, 'ar');
    expect(html).toContain('<main></main>');
    expect(html).toContain('فارغة');
  });
});
