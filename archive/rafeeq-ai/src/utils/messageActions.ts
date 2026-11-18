// Copyright (c) 2026 DRS AI. All rights reserved.
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

/** Copies message text to the clipboard; resolves false when the clipboard call fails. */
export async function copyMessageText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the system share sheet for message text. Uses the built-in React Native
 * Share API (no extra native module). Resolves false when the sheet is dismissed
 * or the share fails.
 */
export async function shareMessageText(text: string): Promise<boolean> {
  try {
    const result = await Share.share({ message: text });
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}
