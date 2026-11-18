// Copyright (c) 2026 DRS AI. All rights reserved.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { ChatMessage } from '../types';
import type { ExportLabels } from './conversationExport';

/** Escapes the five HTML-significant characters; Arabic and other text passes through untouched. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sortable, human-friendly PDF file name, e.g. rafeeq-chat-20260105-0930.pdf. */
export function pdfFileName(exportedAt = Date.now()): string {
  const d = new Date(exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `rafeeq-chat-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.pdf`;
}

const PDF_STYLES = `
  @page { size: A4; margin: 16mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'Noto Sans Arabic', 'Segoe UI', sans-serif; color: #1b232e; }
  header { padding-bottom: 12px; margin-bottom: 16px; border-bottom: 3px solid; border-image: linear-gradient(90deg, #7C3AED, #2563EB) 1; }
  h1 { margin: 0 0 4px; font-size: 20px; line-height: 1.4; }
  .generated { font-size: 11px; color: #667085; }
  main { display: block; }
  .msg { margin-bottom: 14px; page-break-inside: avoid; }
  .meta { font-size: 11px; font-weight: 700; margin-bottom: 3px; }
  .assistant .meta { color: #2563EB; }
  .user .meta { color: #7C3AED; }
  .bubble { font-size: 13px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: break-word; border-radius: 8px; padding: 9px 12px; }
  .assistant .bubble { background: #eef4fe; }
  .user .bubble { background: #f5f4fb; }
`.trim();

/**
 * Builds a self-contained, print-ready HTML transcript that expo-print renders
 * into a PDF. Same skip rules as the Markdown builder: system-prompt entries and
 * messages without content are left out. Pure — fully covered by unit tests.
 *
 * The document chrome follows the app locale (RTL for Arabic), while every
 * bubble carries `dir="auto"` so mixed Arabic/English content flows correctly
 * per paragraph — the WebKit print engine does the Arabic shaping.
 */
export function buildConversationHtml(
  title: string,
  messages: ChatMessage[],
  formatDate: (ms: number) => string,
  labels: ExportLabels,
  locale = 'en',
): string {
  const rtl = /^(ar|fa|he|ur)\b/.test(locale);
  const blocks: string[] = [];
  for (const m of messages) {
    const content = m.content.trim();
    if (!content || m.role === 'system') continue;
    const speaker = m.role === 'user' ? labels.user : labels.assistant;
    blocks.push(
      `<div class="msg ${m.role}">` +
        `<div class="meta" dir="auto">${escapeHtml(speaker)} · ${escapeHtml(formatDate(m.createdAt))}</div>` +
        `<div class="bubble" dir="auto">${escapeHtml(content)}</div>` +
        `</div>`,
    );
  }
  const lang = rtl ? 'ar' : 'en';
  const dir = rtl ? 'rtl' : 'ltr';
  const heading = escapeHtml(title);
  const generated = escapeHtml(formatDate(Date.now()));
  return (
    `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">` +
    `<title>${heading}</title><style>${PDF_STYLES}</style></head><body>` +
    `<header><h1 dir="auto">${heading}</h1><div class="generated" dir="auto">${generated}</div></header>` +
    `<main>${blocks.join('\n')}</main></body></html>`
  );
}

/**
 * Renders HTML into a PDF in the cache directory and returns its file URI.
 * The printed file lands under a generic name, so it is copied to a
 * rafeeq-chat-… name; if the copy fails the original still shares fine.
 */
export async function renderConversationPdf(html: string, fileName = pdfFileName()): Promise<string> {
  const printed = await Print.printToFileAsync({ html });
  try {
    const target = new File(Paths.cache, fileName);
    if (target.exists) target.delete();
    await new File(printed.uri).copy(target);
    return target.uri;
  } catch {
    return printed.uri;
  }
}

/** Opens the system share sheet for a conversation PDF. Resolves false on failure. */
export async function shareConversationPdf(uri: string): Promise<boolean> {
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Rafeeq AI' });
    return true;
  } catch {
    return false;
  }
}
