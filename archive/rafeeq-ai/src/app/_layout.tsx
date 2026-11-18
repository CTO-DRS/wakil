// Copyright (c) 2026 DRS AI. All rights reserved.
import { reloadAppAsync } from 'expo';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Storage } from 'expo-sqlite/kv-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDialogHost } from '../components/AppDialogHost';
import { ErrorBoundary as RootBoundary, ErrorScreen } from '../components/ErrorScreen';
import { AuroraBackground } from '../components/AuroraBackground';
import { MemoryChatRepository } from '../db/repository';
import { SqliteChatRepository } from '../db/sqliteRepository';
import { useModelLifecycle } from '../hooks/useModelLifecycle';
import { applyLayoutDirection, initI18n, RTL_RELOAD_KEY } from '../i18n';
import { startMeasureController } from '../measure/controller';
import { setChatRepository, useChatStore } from '../store/chatStore';
import { startDownloadCelebrationWatch } from '../store/downloadCelebrate';
import { useModelStore } from '../store/modelStore';
import { shouldLockOnReturn, usePinLockStore } from '../store/pinLockStore';
import { useSettingsStore } from '../store/settingsStore';
import { themeById, useAppTheme } from '../theme';
import { useAppearanceStore } from '../store/appearanceStore';

/** Route-level error boundary (expo-router convention). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorScreen error={error} onRetry={() => void retry()} />;
}

function useBootstrap() {
  const language = useSettingsStore((s) => s.language);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);

  // i18n is synchronous (bundled resources); initialise before the first render of children.
  useState(() => initI18n(language));

  useEffect(() => {
    let cancelled = false;
    let stopCelebrationWatch: (() => void) | null = null;
    (async () => {
      try {
        // Align native layout direction with the chosen language (Arabic => RTL).
        if (applyLayoutDirection(language)) {
          // Reload once per language so the new direction applies; never loop.
          if (Storage.getItemSync(RTL_RELOAD_KEY) !== language) {
            Storage.setItemSync(RTL_RELOAD_KEY, language);
            await reloadAppAsync('layout direction changed');
            return;
          }
        }
        try {
          const repo = new SqliteChatRepository();
          await repo.init();
          setChatRepository(repo);
        } catch (e) {
          console.error('[Rafeeq] SQLite unavailable, using in-memory storage', e);
          setChatRepository(new MemoryChatRepository());
        }
        await useChatStore.getState().init();
        // Decides where models live (internal vs shared Download/Rafeeq), migrates
        // existing files if the root changed, syncs state with the disk and resumes
        // downloads the app itself interrupted — every step idempotent.
        await useModelStore.getState().reinitStorage();
        // Fires the «download finished» notice when it completes elsewhere.
        stopCelebrationWatch = startDownloadCelebrationWatch();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setFatal(e);
      }
    })();
    return () => {
      cancelled = true;
      stopCelebrationWatch?.();
    };
    // Bootstrap runs once; language changes trigger an explicit reload from Settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ready, fatal };
}

/**
 * Closes the PIN session on background→foreground transitions, honoring the
 * user's grace window: autoLockMinutes 0 locks on every return, 1/5 only when
 * the absence actually lasted that long (Android freezes JS in the background,
 * so the timestamp is taken on the way out and judged on the way back in).
 */
function useAutoLockOnBackground() {
  const autoLockMinutes = usePinLockStore((s) => s.autoLockMinutes);
  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const { unlocked, lock } = usePinLockStore.getState();
        if (unlocked && shouldLockOnReturn(leftAt, autoLockMinutes)) lock();
        leftAt = null;
      } else if (state === 'background') {
        leftAt = Date.now();
      }
    });
    return () => sub.remove();
  }, [autoLockMinutes]);
}

function AppStack() {
  const { dark } = useAppTheme();
  const onboarded = useSettingsStore((s) => s.onboardingCompleted);
  // The lock is the ONLY registered route while closed: nothing renders behind it.
  const locked = usePinLockStore((s) => s.enabled && !s.unlocked);
  useModelLifecycle();
  useAutoLockOnBackground();
  // The measure lab's app-level sampler: reconciles any rehydrated session
  // (auto-finishing past its deadline) and keeps sampling while one runs,
  // on any screen — idempotent, app-lifetime.
  useEffect(() => {
    startMeasureController();
  }, []);
  return (
    <View style={styles.root}>
      <AuroraBackground />
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/*
        Every route is declared and belongs to exactly one guard group, so in each
        state exactly one group is reachable. A route left out of every group stays
        reachable everywhere, and Stack.Protected picks the first reachable route as
        its redirect target: v0.3.0 left "search" undeclared, so a guarded "/" was
        redirected to /search and that stray Search screen sat at the bottom of the
        stack, where Back has nothing to pop.
      */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade',
        }}
      >
        <Stack.Protected guard={locked}>
          <Stack.Screen name="lock" />
        </Stack.Protected>
        <Stack.Protected guard={!locked && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="search" />
          <Stack.Screen name="pin-setup" />
          <Stack.Screen name="memory" />
          <Stack.Screen name="appearance" />
          <Stack.Screen name="models-category/[catId]" />
          <Stack.Screen name="model/[id]" />
          <Stack.Screen name="permissions" />
          <Stack.Screen name="profile" />
        </Stack.Protected>
        <Stack.Protected guard={!locked && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
      </Stack>
      {/* Themed replacement for every native Alert.alert, above any screen. */}
      <AppDialogHost />
    </View>
  );
}

export default function RootLayout() {
  const { ready, fatal } = useBootstrap();
  // The splash follows the appearance store so a themed cold start never
  // flashes the classic dark behind a light or custom theme. The "system"
  // id resolves to the classic dark until the app shell (and the OS scheme
  // hook) take over one frame later.
  const splashTheme = useAppearanceStore((s) => s.themeId);
  const splashColor = themeById(splashTheme === 'system' ? 'dark' : splashTheme).palette.background;
  return (
    <SafeAreaProvider>
      <RootBoundary>
        {fatal ? (
          <ErrorScreen error={fatal} />
        ) : ready ? (
          <AppStack />
        ) : (
          <View style={[styles.splash, { backgroundColor: splashColor }]}>
            <ActivityIndicator color="#22D3EE" size="large" />
          </View>
        )}
      </RootBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
