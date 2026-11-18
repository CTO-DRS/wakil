// Copyright (c) 2026 DRS AI. All rights reserved.
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

import { copyMessageText, shareMessageText } from '../src/utils/messageActions';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const mockedSetString = Clipboard.setStringAsync as jest.Mock;

describe('messageActions', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('copies message text to the clipboard', async () => {
    mockedSetString.mockResolvedValue(undefined);
    await expect(copyMessageText('مرحبا بالعالم')).resolves.toBe(true);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('مرحبا بالعالم');
  });

  it('reports clipboard failures as false', async () => {
    mockedSetString.mockRejectedValue(new Error('clipboard denied'));
    await expect(copyMessageText('x')).resolves.toBe(false);
  });

  it('opens the system share sheet and reports success', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await expect(shareMessageText('نص للمشاركة')).resolves.toBe(true);
    expect(Share.share).toHaveBeenCalledWith({ message: 'نص للمشاركة' });
  });

  it('reports a dismissed share sheet as not shared', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    await expect(shareMessageText('hi')).resolves.toBe(false);
  });

  it('reports share errors as false', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no sheet'));
    await expect(shareMessageText('hi')).resolves.toBe(false);
  });
});
