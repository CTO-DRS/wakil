// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ReactNode } from 'react';
import { create } from 'zustand';

/**
 * Themed in-app dialog system. The native Alert.alert renders a flat system
 * dialog that ignores the app's glass design language, so every prompt, menu
 * and confirmation goes through this store instead: `AppDialogHost` (mounted
 * once at the root) renders the head of the queue as a bottom sheet, and the
 * module-level helpers below are fire-and-forget call-site replacements for
 * Alert.alert that work from components, hooks and store subscriptions alike.
 */

/** Accent family for a row's icon (and tinted circle); destructive always wins with danger. */
export type DialogTone = 'neutral' | 'accent' | 'primary' | 'success' | 'warning';

/** Renders the row glyph in the tone color the host resolved (theme-free call sites). */
export type DialogIcon = (color: string) => ReactNode;

export type DialogAction = {
  label: string;
  onPress?: () => void;
  /** Destructive rows render in the danger color. */
  destructive?: boolean;
  /** The dismissive row (Cancel): rendered apart, bold, resolves confirms to false. */
  cancel?: boolean;
  /** Stroke glyph drawn in a tinted circle at the row's start (pass `dialogIcons.x`). */
  icon?: DialogIcon;
  /** Accent family for the icon circle; defaults to neutral text color. */
  tone?: DialogTone;
};

export type DialogOptions = {
  title: string;
  message?: string;
  actions?: DialogAction[];
  /** Called when the dialog leaves without an action: backdrop tap or Android back. */
  onDismiss?: () => void;
};

export type ActiveDialog = DialogOptions & { key: number };

type DialogState = {
  /** FIFO queue; the head is the visible dialog. */
  queue: ActiveDialog[];
  show: (options: DialogOptions) => void;
  /** Runs the action at `index`, then closes the dialog (nested dialogs queue up). */
  press: (index: number) => void;
  /** Closes the dialog without running an action, invoking onDismiss. */
  dismiss: () => void;
};

let nextKey = 1;

export const useDialogStore = create<DialogState>()((set, get) => ({
  queue: [],

  show: (options) => {
    const request: ActiveDialog = { ...options, key: nextKey++ };
    set((s) => ({ queue: [...s.queue, request] }));
  },

  press: (index) => {
    const head = get().queue[0];
    const action = head?.actions?.[index];
    if (!head || !action) return;
    // Close first, so an onPress that opens another dialog becomes the new
    // head immediately instead of waiting behind the closing one.
    set((s) => ({ queue: s.queue.slice(1) }));
    action.onPress?.();
  },

  dismiss: () => {
    const head = get().queue[0];
    if (!head) return;
    set((s) => ({ queue: s.queue.slice(1) }));
    head.onDismiss?.();
  },
}));

/** Opens a themed dialog. Without actions it behaves like an informational alert. */
export function showDialog(options: DialogOptions): void {
  useDialogStore.getState().show(options);
}

/** Informational dialog with a single OK row. */
export function notify(title: string, message?: string, okLabel = 'OK'): void {
  showDialog({ title, message, actions: [{ label: okLabel, cancel: true }] });
}

/** Two-button confirmation resolving to true only when the confirm row is pressed. */
export function confirmDialog(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (!done) {
        done = true;
        resolve(value);
      }
    };
    showDialog({
      title: options.title,
      message: options.message,
      actions: [
        { label: options.cancelLabel, cancel: true, onPress: () => finish(false) },
        { label: options.confirmLabel, destructive: options.destructive, onPress: () => finish(true) },
      ],
      onDismiss: () => finish(false),
    });
  });
}
