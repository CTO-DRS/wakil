// Copyright (c) 2026 DRS AI. All rights reserved.
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, TAB_BAR_HEIGHT, TAB_BAR_MARGIN } from '../theme';

/** Bottom padding that keeps scroll content clear of the floating tab bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + TAB_BAR_MARGIN + insets.bottom + spacing.lg;
}
