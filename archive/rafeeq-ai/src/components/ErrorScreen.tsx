// Copyright (c) 2026 DRS AI. All rights reserved.
import { LinearGradient } from 'expo-linear-gradient';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import i18n from '../i18n';
import { BRAND } from '../theme';

/**
 * Plain error screen that depends on nothing but React Native, so it still renders when
 * the theme, stores or navigation are what failed.
 */
export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const err = error instanceof Error ? error : new Error(String(error));
  const t = (key: string, fallback: string) => {
    try {
      const v = i18n.t(key);
      return v && v !== key ? v : fallback;
    } catch {
      return fallback;
    }
  };
  return (
    <View style={styles.root}>
      <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.title}>{t('errors.title', 'Something went wrong')}</Text>
        <Text style={styles.subtitle}>{t('errors.body', 'Rafeeq hit an unexpected error. Details are below.')}</Text>
      </LinearGradient>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text selectable style={styles.errorName}>
          {err.name}: {err.message}
        </Text>
        {err.stack ? (
          <Text selectable style={styles.stack}>
            {err.stack}
          </Text>
        ) : null}
        <Text style={styles.hint}>{t('errors.copyHint', 'You can screenshot this screen and share it with DRS AI support.')}</Text>
      </ScrollView>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>{t('common.retry', 'Try again')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type BoundaryState = { error: unknown | null };

/** Root error boundary: catches render errors anywhere below it and shows ErrorScreen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[Rafeeq] Uncaught render error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060A' },
  header: { paddingTop: 64, paddingBottom: 24, paddingHorizontal: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#EDE9FE', fontSize: 15, marginTop: 6 },
  body: { flex: 1 },
  bodyContent: { padding: 20 },
  errorName: { color: '#FCA5A5', fontSize: 15, fontWeight: '700', marginBottom: 12, writingDirection: 'ltr', textAlign: 'left' },
  stack: { color: '#D4D4E0', fontSize: 12, fontFamily: 'monospace', writingDirection: 'ltr', textAlign: 'left' },
  hint: { color: '#A09DB8', fontSize: 13, marginTop: 16 },
  retry: { margin: 20, paddingVertical: 14, borderRadius: 999, backgroundColor: '#7C3AED', alignItems: 'center' },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
