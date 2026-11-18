// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { BackChevron, PressableScale } from '../components/ui';
import { dialogIcons } from '../components/DialogIcons';
import { PinPad } from '../components/PinPad';
import { haptic } from '../utils/haptics';
import { PIN_LENGTH } from '../utils/pinHash';
import { usePinLockStore } from '../store/pinLockStore';
import { showDialog } from '../store/dialogStore';
import { spacing, type, useAppTheme } from '../theme';
import { goBack } from '../navigation/goBack';

type Step = 'verify' | 'enter' | 'confirm';

/**
 * Setup screen behind the Settings switch: with a PIN configured it verifies
 * the current one to disable the lock; without one it collects the PIN twice
 * (enter → confirm) before enabling. Both paths end with an alert and return
 * to Settings — nothing changes when the user backs out midway.
 */
export default function PinSetupScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const hasPin = usePinLockStore((s) => s.enabled);
  const setPin = usePinLockStore((s) => s.setPin);
  const removePin = usePinLockStore((s) => s.removePin);

  const [step, setStep] = useState<Step>(hasPin ? 'verify' : 'enter');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const title =
    step === 'verify'
      ? t('pinSetup.verifyTitle')
      : step === 'enter'
        ? t('pinSetup.enterTitle')
        : t('pinSetup.confirmTitle');

  const onFilled = (pin: string) => {
    if (step === 'verify') {
      if (removePin(pin)) {
        haptic.success();
        showDialog({
          title: t('pinSetup.disabledTitle'),
          message: t('pinSetup.disabledBody'),
          actions: [{ label: t('common.ok'), icon: dialogIcons.check, tone: 'success', onPress: () => goBack(router, '/settings') }],
        });
        return;
      }
      haptic.error();
      setError(t('lock.wrongPin'));
      setResetKey((k) => k + 1);
      return;
    }
    if (step === 'enter') {
      setFirst(pin);
      setStep('confirm');
      setResetKey((k) => k + 1);
      return;
    }
    if (pin !== first) {
      haptic.error();
      setFirst('');
      setStep('enter');
      setError(t('pinSetup.mismatch'));
      setResetKey((k) => k + 1);
      return;
    }
    setPin(pin);
    haptic.success();
    showDialog({
      title: t('pinSetup.enabledTitle'),
      message: t('pinSetup.enabledBody'),
      actions: [{ label: t('common.ok'), icon: dialogIcons.check, tone: 'success', onPress: () => goBack(router, '/settings') }],
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={() => goBack(router, '/settings')}
          hapticOnPress
        >
          <BackChevron color={colors.text} />
        </PressableScale>
        <Text style={[type.title, { color: colors.text }]}>{t('pinSetup.title')}</Text>
      </View>

      <View style={styles.padArea}>
        <PinPad
          length={PIN_LENGTH}
          title={title}
          error={error}
          resetKey={resetKey}
          onFilled={onFilled}
          onChange={() => setError(null)}
        />
      </View>

      <Text style={[type.caption, styles.hint, { color: colors.textFaint }]}>{t('pinSetup.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  padArea: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl },
  hint: { textAlign: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
});
