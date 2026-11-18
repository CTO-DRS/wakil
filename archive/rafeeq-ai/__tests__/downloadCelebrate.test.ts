// Copyright (c) 2026 DRS AI. All rights reserved.
import { initI18n } from '../src/i18n';
import * as dialogStore from '../src/store/dialogStore';
import { detectDownloadCompleted, useDownloadCelebrateStore } from '../src/store/downloadCelebrate';

const files = (statuses: Record<string, string>) =>
  Object.fromEntries(Object.entries(statuses).map(([id, status]) => [id, { status }]));

describe('detectDownloadCompleted', () => {
  const nameOf = (id: string) => (id === 'm1' ? 'Qwen 3' : undefined);

  it.each([
    { name: 'celebrates a running download that finishes', before: { m1: 'downloading' }, after: { m1: 'downloaded' }, expected: 'Qwen 3' },
    { name: 'celebrates a resumed download that finishes', before: { m1: 'paused' }, after: { m1: 'downloaded' }, expected: 'Qwen 3' },
    { name: 'ignores a model that was already on disk', before: { m1: 'downloaded' }, after: { m1: 'downloaded' }, expected: null },
    { name: 'ignores the first disk sync of a fresh session', before: {}, after: { m1: 'downloaded' }, expected: null },
    { name: 'ignores unrelated patches', before: { m1: 'downloading' }, after: { m1: 'downloading' }, expected: null },
    { name: 'ignores a download that went idle', before: { m1: 'downloading' }, after: { m1: 'idle' }, expected: null },
  ] as { name: string; before: Record<string, string>; after: Record<string, string>; expected: string | null }[])('$name', ({ before, after, expected }) => {
    expect(detectDownloadCompleted(files(before), files(after), nameOf)).toBe(expected);
  });

  it('falls back to the model id when it has no name', () => {
    expect(detectDownloadCompleted(files({ m2: 'downloading' }), files({ m2: 'downloaded' }), () => undefined)).toBe('m2');
  });
});

describe('download celebrate store', () => {
  let notifySpy: jest.SpyInstance;

  beforeEach(() => {
    initI18n('ar');
    notifySpy = jest.spyOn(dialogStore, 'notify').mockImplementation(() => {});
    useDownloadCelebrateStore.setState({ justCompleted: null, modelsScreenVisible: false, notifiedFor: null });
  });

  afterEach(() => {
    notifySpy.mockRestore();
  });

  it('keeps the finished model for the in-card banner', () => {
    useDownloadCelebrateStore.getState().markCompleted('Qwen 3');
    expect(useDownloadCelebrateStore.getState().justCompleted).toBe('Qwen 3');
  });

  it('pops the download-complete notice for a user elsewhere in the app', () => {
    useDownloadCelebrateStore.getState().markCompleted('Qwen 3');
    expect(notifySpy).toHaveBeenCalledTimes(1);
    const [title, body] = notifySpy.mock.calls[0];
    expect(title).toContain('انتهى التنزيل');
    expect(body).toContain('Qwen 3');
  });

  it('stays quiet while the user is already on the models screen', () => {
    useDownloadCelebrateStore.setState({ modelsScreenVisible: true });
    useDownloadCelebrateStore.getState().markCompleted('Qwen 3');
    expect(notifySpy).not.toHaveBeenCalled();
    expect(useDownloadCelebrateStore.getState().justCompleted).toBe('Qwen 3');
  });

  it('notifies once per completed model within a session', () => {
    useDownloadCelebrateStore.getState().markCompleted('Qwen 3');
    useDownloadCelebrateStore.getState().markCompleted('Qwen 3');
    expect(notifySpy).toHaveBeenCalledTimes(1);
    useDownloadCelebrateStore.getState().markCompleted('Gemma 2');
    expect(notifySpy).toHaveBeenCalledTimes(2);
  });

  it('dismisses the banner', () => {
    useDownloadCelebrateStore.getState().markCompleted('Qwen 3');
    useDownloadCelebrateStore.getState().dismiss();
    expect(useDownloadCelebrateStore.getState().justCompleted).toBeNull();
  });
});
