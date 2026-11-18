// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * One library category's model list. Arrives with ?cat=<id> from the Models
 * tab's category cards; renders that category's real, documented entries with
 * the availability chips, and falls back to the full registry when the id is
 * unknown (deep links can't crash it).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BackChevron, Card, PressableScale, StatusChip } from '../../components/ui';
import { CategoryGlyph } from '../../components/LibraryIcons';
import { libraryCategory } from '../../models/library/categories';
import { modelsForCategory, searchLibraryModels } from '../../models/library/search';
import { goBack } from '../../navigation/goBack';
import { spacing, type as typeScale, useAppTheme } from '../../theme';

export default function ModelCategoryScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ catId?: string }>();

  const catId = typeof params.catId === 'string' ? params.catId : '';
  const cat = libraryCategory(catId);
  const models = useMemo(
    () => (cat ? modelsForCategory(cat.id) : searchLibraryModels('')),
    [cat],
  );
  const isAr = i18n.language === 'ar';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
          <BackChevron color={colors.text} />
        </PressableScale>
        <Text style={[typeScale.title, styles.auto, styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {cat ? (isAr ? cat.name.ar : cat.name.en) : t('library.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        {cat ? (
          <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>
            {isAr ? cat.desc.ar : cat.desc.en}
          </Text>
        ) : null}

        {models.length === 0 ? (
          <Card>
            <Text style={[typeScale.bodyStrong, styles.auto, { color: colors.text }]}>{t('library.emptyTitle')}</Text>
            <Text style={[typeScale.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.xs }]}>
              {t('library.emptyBody')}
            </Text>
          </Card>
        ) : (
          <Animated.View entering={FadeInDown.duration(280)}>
            {models.map((m) => (
              <PressableScale
                key={m.id}
                onPress={() => router.push(`/model/${m.id}`)}
                accessibilityRole="button"
                style={{ marginBottom: spacing.sm }}
              >
                <Card>
                  <View style={styles.row}>
                    <CategoryGlyph icon={cat?.icon ?? 'chat'} color={colors.primary} size={30} />
                    <View style={styles.rowText}>
                      <Text style={[typeScale.bodyStrong, styles.auto, { color: colors.text }]}>{m.name}</Text>
                      <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]} numberOfLines={1}>
                        {m.developer}
                        {m.params ? ` · ${m.params}` : ''}
                      </Text>
                    </View>
                    <StatusChip
                      label={m.availability === 'integrated' ? t('library.integrated') : t('library.catalog')}
                      tone={m.availability === 'integrated' ? 'success' : 'neutral'}
                    />
                  </View>
                </Card>
              </PressableScale>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  auto: { textAlign: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
});
