// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { BackChevron, GlassSurface, PressableScale } from '../components/ui';
import { useChatStore } from '../store/chatStore';
import { radius, spacing, type, useAppTheme } from '../theme';
import type { MessageSearchHit } from '../types';
import { matchSnippet } from '../utils/snippet';
import { goBack } from '../navigation/goBack';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

function ClearIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function HitRow({ hit, query, onPress, dateLabel }: { hit: MessageSearchHit; query: string; onPress: () => void; dateLabel: string }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const parts = matchSnippet(hit.content, query);
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" style={styles.hitWrap}>
      <GlassSurface style={styles.hit}>
        <Text numberOfLines={1} style={[type.label, { color: colors.accent }]}>
          {hit.conversationTitle ?? t('conversations.untitled')}
        </Text>
        <Text style={[type.body, styles.auto, { color: colors.text }]}>
          {parts.before}
          {parts.match ? (
            <Text style={{ fontWeight: '700', color: colors.accent }}>{parts.match}</Text>
          ) : null}
          {parts.after}
        </Text>
        <Text style={[type.caption, styles.auto, { color: colors.textFaint }]}>{dateLabel}</Text>
      </GlassSurface>
    </PressableScale>
  );
}

export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MessageSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;
    const id = requestId.current + 1;
    requestId.current = id;
    const timer = setTimeout(async () => {
      setSearching(true);
      if (!useChatStore.getState().ready) await useChatStore.getState().init();
      const results = await useChatStore.getState().search(q);
      if (requestId.current !== id) return; // superseded by a newer query
      setHits(results);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const formatDate = useCallback(
    (ms: number) => {
      try {
        return new Date(ms).toLocaleString(i18n.language === 'ar' ? 'ar' : 'en', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      } catch {
        return new Date(ms).toISOString();
      }
    },
    [i18n.language],
  );

  const openHit = (hit: MessageSearchHit) => {
    Keyboard.dismiss();
    router.push({ pathname: '/chat/[id]', params: { id: hit.conversationId, messageId: hit.messageId } });
  };

  const trimmed = query.trim();
  const showHint = trimmed.length < MIN_QUERY;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
          <GlassSurface style={styles.iconBtn} radiusSize={radius.pill}>
            <BackChevron color={colors.text} />
          </GlassSurface>
        </PressableScale>
        <Text style={[type.headline, styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t('search.title')}
        </Text>
      </View>

      <GlassSurface strong radiusSize={radius.xl} style={styles.searchBar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.textFaint}
          autoFocus
          returnKeyType="search"
          maxLength={200}
          style={[type.body, styles.input, { color: colors.text }]}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            hitSlop={10}
            style={styles.clearBtn}
          >
            <ClearIcon color={colors.textMuted} />
          </Pressable>
        ) : null}
      </GlassSurface>

      {showHint ? (
        <Text style={[type.callout, styles.hint, { color: colors.textMuted }]}>{t('search.empty')}</Text>
      ) : (
        <>
          <Text style={[type.caption, styles.count, { color: colors.textFaint }]}>
            {searching ? t('search.searching') : hits ? t('search.results', { count: hits.length }) : ''}
          </Text>
          <FlatList
            style={styles.flex}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            data={searching ? [] : hits ?? []}
            keyExtractor={(h) => h.messageId}
            renderItem={({ item }) => (
              <HitRow hit={item} query={trimmed} onPress={() => openHit(item)} dateLabel={formatDate(item.createdAt)} />
            )}
            ListEmptyComponent={
              !searching && hits && hits.length === 0 ? (
                <Text style={[type.callout, styles.hint, { color: colors.textMuted }]}>{t('search.noResults')}</Text>
              ) : undefined
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  auto: { textAlign: 'auto' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerTitle: { flex: 1, textAlign: 'auto' },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginTop: spacing.xs, paddingStart: spacing.lg, paddingEnd: 10, paddingVertical: 4 },
  input: { flex: 1, minHeight: 44, paddingVertical: 9, textAlign: 'auto' },
  clearBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  count: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  hitWrap: { marginBottom: spacing.sm },
  hit: { padding: spacing.md, gap: 4 },
  hint: { textAlign: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, lineHeight: 22 },
});
