// Copyright (c) 2026 DRS AI. All rights reserved.
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { summarizeUsage, usageTimeline } from '../model/usage/records';
import { useUsageStore } from '../model/usage/store';
import { shareStatsCard } from '../utils/statscard/share';
import { notify } from '../store/dialogStore';
import { haptic } from '../utils/haptics';
import { Button } from './ui';

export type ShareStatsButtonProps = {
  /** The chart span the dashboard is showing (7 or 30 days). */
  span: 7 | 30;
};

/**
 * The usage dashboard's "share" button: renders the stats card — the same
 * raster family as the score card, with the run/token totals and the activity
 * bars for the current span — into a PNG and opens the system share sheet.
 * Failures surface a quiet notice instead of crashing the dashboard.
 */
export const ShareStatsButton = memo(function ShareStatsButton({ span }: ShareStatsButtonProps) {
  const { t } = useTranslation();
  const entries = useUsageStore((s) => s.entries);
  const [sharing, setSharing] = useState(false);

  const onShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    haptic.light();
    try {
      const totals = summarizeUsage(entries, 1);
      const buckets = usageTimeline(entries, span, Date.now());
      const shared = await shareStatsCard({
        runs: totals.runs,
        tokens: totals.tokens,
        models: totals.models,
        buckets,
        span,
        at: Date.now(),
      });
      if (!shared) notify(t('usage.share'), t('usage.shareFailed'), t('common.ok'));
      else haptic.success();
    } catch {
      notify(t('usage.share'), t('usage.shareFailed'), t('common.ok'));
    } finally {
      setSharing(false);
    }
  }, [entries, sharing, span, t]);

  return (
    <Button
      title={sharing ? t('usage.sharing') : t('usage.share')}
      variant="ghost"
      compact
      loading={sharing}
      onPress={() => void onShare()}
      accessibilityLabel={t('usage.share')}
    />
  );
});
