// Copyright (c) 2026 DRS AI. All rights reserved.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { PinPad } from '../components/PinPad';
import { GlassSurface, PressableScale } from '../components/ui';
import { promptBiometric, useBiometricSupport } from '../hooks/useBiometric';
import { haptic } from '../utils/haptics';
import { usePinLockStore } from '../store/pinLockStore';
import { spacing, type, useAppTheme } from '../theme';

/**
 * Full-screen gate shown whenever the lock is enabled and the session is closed
 * (launch or return from background). It is the ONLY registered route while
 * locked — the stack swaps the whole tree, so no chat content sits behind it.
 * There is deliberately no reset path: the PIN is the key, with no backdoor.
 * When the user opted into biometrics and the device supports them, the system
 * prompt fires once on entry and a fingerprint button stays as the shortcut.
 */
export default function LockScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const pinLength = usePinLockStore((s) => s.pinLength) ?? 4;
  const unlock = usePinLockStore((s) => s.unlock);
  const unlockBiometric = usePinLockStore((s) => s.unlockBiometric);
  const biometricOn = usePinLockStore((s) => s.biometricEnabled);
  const supported = useBiometricSupport();
  const biometricReady = biometricOn && supported;
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const autoPrompted = useRef(false);

  const tryBiometric = async () => {
    if (await promptBiometric(t('lock.biometricPrompt'), t('common.cancel'))) {
      unlockBiometric();
      haptic.success();
    }
  };

  // One automatic prompt per lock-screen visit; cancelling keeps the pad usable.
  useEffect(() => {
    if (!biometricReady || autoPrompted.current) return;
    autoPrompted.current = true;
    void tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricReady]);

  const onFilled = (pin: string) => {
    if (unlock(pin)) {
      haptic.success();
      return;
    }
    haptic.error();
    setError(t('lock.wrongPin'));
    setResetKey((k) => k + 1);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
      <GlassSurface strong style={styles.badge} radiusSize={28}>
        <Svg width={30} height={30} viewBox="0 0 24 24">
          <Rect x="4.5" y="10" width="15" height="10.5" rx="3" stroke={colors.accent} strokeWidth={2} fill="none" />
          <Path
            d="M8 10 V7.5 a4 4 0 0 1 8 0 V10"
            stroke={colors.accent}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <Path d="M12 14 v3" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </GlassSurface>

      <Text style={[type.display, styles.title, { color: colors.text }]}>{t('lock.title')}</Text>
      <Text style={[type.callout, { color: colors.textMuted }]}>{t('lock.subtitle')}</Text>

      <View style={styles.padArea}>
        <PinPad
          length={pinLength}
          title=""
          error={error}
          resetKey={resetKey}
          onFilled={onFilled}
          onChange={() => setError(null)}
        />
      </View>

      {biometricReady ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('lock.useBiometric')}
          onPress={() => void tryBiometric()}
          hapticOnPress
          style={styles.biometric}
        >
          <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
            <Path
              d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"
              stroke={colors.textMuted}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <Path
              d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2"
              stroke={colors.textMuted}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <Path
              d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"
              stroke={colors.accent}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <Path
              d="M14 13.12c0 2.38 0 6.38-1 8.88"
              stroke={colors.textMuted}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <Path d="M21.8 16c.2-2 .131-5.354 0-6" stroke={colors.textMuted} strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M9 6.8a6 6 0 0 1 9 5.2v2" stroke={colors.textMuted} strokeWidth={1.8} strokeLinecap="round" />
            <Path
              d="M17.29 21.02c.12-.6.43-2.3.5-3.02"
              stroke={colors.textMuted}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <Circle cx="2" cy="16" r="0.9" fill={colors.textMuted} />
          </Svg>
          <Text style={[type.caption, { color: colors.textMuted }]}>{t('lock.useBiometric')}</Text>
        </PressableScale>
      ) : null}

      <Text style={[type.caption, styles.hint, { color: colors.textFaint }]}>{t('lock.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  badge: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: spacing.lg },
  padArea: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl },
  biometric: { alignItems: 'center', gap: 4, marginBottom: spacing.md, padding: spacing.sm },
  hint: { textAlign: 'center', paddingHorizontal: spacing.xl },
});
