// Copyright (c) 2026 DRS AI. All rights reserved.
import { confirmDialog, notify, showDialog, useDialogStore, type DialogAction } from '../src/store/dialogStore';

const head = () => useDialogStore.getState().queue[0] ?? null;
const reset = () => useDialogStore.setState({ queue: [] });

/** Drains a promise resolution count for onDismiss/assert helpers. */
const counter = () => {
  let n = 0;
  return { bump: () => void n++, get: () => n };
};

/** Runs every press path against a fresh queue and records the outcomes. */
const pressCases: { name: string; actions: DialogAction[]; index: number; expectedCall?: string }[] = [
  { name: 'first action runs', actions: [{ label: 'A', onPress: () => void counter }, { label: 'B' }], index: 0 },
  { name: 'second action runs', actions: [{ label: 'A' }, { label: 'B' }], index: 1 },
  { name: 'cancel action runs', actions: [{ label: 'A' }, { label: 'C', cancel: true }], index: 1 },
];

describe('dialogStore queue', () => {
  beforeEach(reset);

  it.each([
    { name: 'one dialog', count: 1 },
    { name: 'several dialogs queue FIFO', count: 3 },
  ])('$name: head is the first shown, queue holds the rest', ({ count }) => {
    for (let i = 0; i < count; i++) showDialog({ title: `t${i}` });
    expect(useDialogStore.getState().queue).toHaveLength(count);
    expect(head()?.title).toBe('t0');
    if (count > 1) expect(head()?.key).toBeLessThan(useDialogStore.getState().queue[count - 1].key!);
  });

  it('press runs the action and closes the dialog', () => {
    const calls: string[] = [];
    showDialog({ title: 'Menu', actions: [{ label: 'A', onPress: () => calls.push('A') }, { label: 'B', onPress: () => calls.push('B') }] });
    useDialogStore.getState().press(1);
    expect(calls).toEqual(['B']);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it.each(pressCases)('press index resolution: $name', ({ actions, index }) => {
    showDialog({ title: 'T', actions });
    useDialogStore.getState().press(index);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('press with an out-of-range index is a no-op', () => {
    showDialog({ title: 'T', actions: [{ label: 'A' }] });
    useDialogStore.getState().press(5);
    expect(useDialogStore.getState().queue).toHaveLength(1);
  });

  it('a nested show inside onPress becomes the new head immediately', () => {
    showDialog({ title: 'First', actions: [{ label: 'Next', onPress: () => showDialog({ title: 'Second' }) }] });
    useDialogStore.getState().press(0);
    expect(useDialogStore.getState().queue).toHaveLength(1);
    expect(head()?.title).toBe('Second');
  });

  it('dismiss closes the head and fires onDismiss', () => {
    const dismissed = counter();
    showDialog({ title: 'T', onDismiss: dismissed.bump });
    showDialog({ title: 'U' });
    useDialogStore.getState().dismiss();
    expect(dismissed.get()).toBe(1);
    expect(head()?.title).toBe('U');
    useDialogStore.getState().dismiss();
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('dismiss on an empty queue is a no-op', () => {
    useDialogStore.getState().dismiss();
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('notify builds a single OK row', () => {
    notify('Title', 'Body', 'حسنًا');
    expect(head()?.title).toBe('Title');
    expect(head()?.message).toBe('Body');
    expect(head()?.actions).toEqual([{ label: 'حسنًا', cancel: true }]);
  });
});

/** Presses the row with the given label through the store — the real UI path. */
const pressByLabel = (label: string) => {
  const actions = head()?.actions ?? [];
  const index = actions.findIndex((a) => a.label === label);
  if (index >= 0) useDialogStore.getState().press(index);
};

describe('confirmDialog resolution', () => {
  beforeEach(reset);

  it('resolves true when the confirm row is pressed', async () => {
    const promise = confirmDialog({ title: 'T', confirmLabel: 'Yes', cancelLabel: 'No' });
    pressByLabel('Yes');
    await expect(promise).resolves.toBe(true);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it.each([
    { name: 'cancel row pressed', act: () => pressByLabel('No') },
    { name: 'dismissed from the backdrop', act: () => useDialogStore.getState().dismiss() },
  ])('resolves false when $name', async ({ act }) => {
    const promise = confirmDialog({ title: 'T', confirmLabel: 'Yes', cancelLabel: 'No' });
    act();
    await expect(promise).resolves.toBe(false);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('ignores a second resolution attempt', async () => {
    const promise = confirmDialog({ title: 'T', confirmLabel: 'Yes', cancelLabel: 'No' });
    const stray = head()?.actions?.find((a) => a.label === 'No')?.onPress;
    useDialogStore.getState().dismiss(); // backdrop resolves false first
    stray?.(); // a late stray cancel call must not flip it
    await expect(promise).resolves.toBe(false);
  });

  it('destructive flag reaches the confirm row', () => {
    void confirmDialog({ title: 'T', confirmLabel: 'Yes', cancelLabel: 'No', destructive: true });
    expect((head()?.actions ?? []).find((a) => a.label === 'Yes')?.destructive).toBe(true);
  });
});
