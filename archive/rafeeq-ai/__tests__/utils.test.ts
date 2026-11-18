// Copyright (c) 2026 DRS AI. All rights reserved.
import { checkRam, DISK_MARGIN_BYTES, estimateRuntimeBytes, hasDiskSpace } from '../src/models/resources';
import { formatBytes, newId, progressRatio, titleFromMessage } from '../src/utils/format';
import { isNearBottom } from '../src/utils/scroll';
import { buildPromptMessages } from '../src/llm/prompt';
import { stripStopWords } from '../src/llm/engine';
import { shouldReleaseModel } from '../src/llm/lifecycle';
import type { ChatMessage } from '../src/types';

describe('format', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(491400032)).toBe('468.6 MB');
    expect(formatBytes(1117320736)).toBe('1.0 GB');
  });
  it('computes progress ratio safely', () => {
    expect(progressRatio(50, 100)).toBe(0.5);
    expect(progressRatio(10, 0)).toBe(0);
    expect(progressRatio(200, 100)).toBe(1);
  });
  it('creates unique ids and titles', () => {
    expect(newId('m_')).not.toBe(newId('m_'));
    expect(newId('c_')).toMatch(/^c_[a-z0-9]+-[a-z0-9]{4}$/);
    expect(titleFromMessage('  مرحبا   يا رفيق ')).toBe('مرحبا يا رفيق');
    expect(titleFromMessage('a'.repeat(100), 10)).toHaveLength(10);
  });
  it('never collides when generating many ids in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId('m_')));
    expect(ids.size).toBe(5000);
  });
});

describe('scroll', () => {
  it('treats the list as near the bottom only within the threshold', () => {
    expect(isNearBottom(450, 1000, 500)).toBe(true); // 50px from the bottom
    expect(isNearBottom(420, 1000, 500)).toBe(true); // exactly at the 80px threshold
    expect(isNearBottom(400, 1000, 500)).toBe(false); // 100px from the bottom
  });
  it('always counts short or empty content as near the bottom', () => {
    expect(isNearBottom(0, 300, 500)).toBe(true); // content shorter than the viewport
    expect(isNearBottom(0, 0, 500)).toBe(true); // empty content
  });
});

describe('resources', () => {
  const MB = 1024 * 1024;
  it('estimates runtime memory', () => {
    expect(estimateRuntimeBytes(500 * MB, 2048)).toBeGreaterThan(500 * MB);
  });
  it('classifies RAM availability', () => {
    expect(checkRam(500 * MB, 2048, 4000 * MB).verdict).toBe('ok');
    expect(checkRam(500 * MB, 2048, 500 * MB).verdict).toBe('tight');
    expect(checkRam(1100 * MB, 4096, 300 * MB).verdict).toBe('insufficient');
    expect(checkRam(500 * MB, 2048, null).verdict).toBe('unknown');
  });
  it('checks disk space with a margin', () => {
    expect(hasDiskSpace(100, 100 + DISK_MARGIN_BYTES)).toBe(true);
    expect(hasDiskSpace(100, 99 + DISK_MARGIN_BYTES)).toBe(false);
    expect(hasDiskSpace(100, null)).toBe(true);
  });
});

describe('prompt building', () => {
  const msg = (i: number, role: 'user' | 'assistant', content: string): ChatMessage => ({
    id: `m${i}`,
    conversationId: 'c',
    role,
    content,
    createdAt: i,
    tokensPerSecond: null,
    tokenCount: null,
  });
  it('adds the system prompt and keeps history order', () => {
    const out = buildPromptMessages([msg(1, 'user', 'hi'), msg(2, 'assistant', 'hello'), msg(3, 'user', 'q')], 'SYS', 2048, 256);
    expect(out.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(out[0].content).toBe('SYS');
  });
  it('drops old turns that do not fit, always keeping the newest, starting with user', () => {
    const long = 'x'.repeat(2000);
    const out = buildPromptMessages(
      [msg(1, 'user', long), msg(2, 'assistant', long), msg(3, 'user', long), msg(4, 'assistant', 'short'), msg(5, 'user', 'last')],
      '',
      1024,
      256,
    );
    expect(out[out.length - 1].content).toBe('last');
    expect(out[0].role).toBe('user');
    expect(out.length).toBeLessThan(5);
  });
  it('skips empty messages', () => {
    const out = buildPromptMessages([msg(1, 'user', 'a'), msg(2, 'assistant', '')], '', 2048, 256);
    expect(out).toHaveLength(1);
  });
  it('keeps the newest message when the budget goes negative (maxTokens > nCtx or huge system prompt)', () => {
    const hugeSystem = 'S'.repeat(2000);
    const out = buildPromptMessages(
      [msg(1, 'user', 'old-1'), msg(2, 'assistant', 'old-2'), msg(3, 'user', 'newest')],
      hugeSystem,
      512,
      2048,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ role: 'system', content: hugeSystem });
    expect(out[1]).toMatchObject({ role: 'user', content: 'newest' });
  });
});

describe('engine helpers', () => {
  it('strips trailing stop words', () => {
    expect(stripStopWords('Hello<|im_end|>')).toBe('Hello');
    expect(stripStopWords('Hi <end_of_turn>\n')).toBe('Hi');
    expect(stripStopWords('plain')).toBe('plain');
  });
});

describe('model lifecycle', () => {
  const base = { trimLevel: null, memoryWarning: false, lowMemory: false, generating: false, modelLoaded: true };
  it('keeps the model when backgrounded without pressure', () => {
    expect(shouldReleaseModel({ ...base, appState: 'background' })).toBe(false);
    expect(shouldReleaseModel({ ...base, appState: 'background', trimLevel: 20 })).toBe(false);
  });
  it('releases in background under memory pressure', () => {
    expect(shouldReleaseModel({ ...base, appState: 'background', memoryWarning: true })).toBe(true);
    expect(shouldReleaseModel({ ...base, appState: 'background', trimLevel: 40 })).toBe(true);
    expect(shouldReleaseModel({ ...base, appState: 'background', lowMemory: true })).toBe(true);
  });
  it('does nothing when no model is loaded or while generating in foreground', () => {
    expect(shouldReleaseModel({ ...base, modelLoaded: false, appState: 'background', memoryWarning: true })).toBe(false);
    expect(shouldReleaseModel({ ...base, appState: 'active', trimLevel: 15, generating: true })).toBe(false);
    expect(shouldReleaseModel({ ...base, appState: 'active', trimLevel: 15 })).toBe(true);
  });
});
