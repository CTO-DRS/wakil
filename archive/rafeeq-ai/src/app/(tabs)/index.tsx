// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';

import { LookArea } from '../../components/LookArea';
import { RafeeqBot } from '../../components/RafeeqBot';
import { TextPromptModal } from '../../components/TextPromptModal';
import { Button, Chip, GlassSurface, PressableScale, ProgressBar, SectionTitle } from '../../components/ui';
import { dialogIcons } from '../../components/DialogIcons';
import { useActiveDownload } from '../../hooks/useActiveDownload';
import { useBotState } from '../../hooks/useBotState';
import { useTabBarSpace } from '../../hooks/useTabBarSpace';
import { useChatStore } from '../../store/chatStore';
import { confirmDialog, showDialog } from '../../store/dialogStore';
import { useModelStore } from '../../store/modelStore';
import { useSettingsStore } from '../../store/settingsStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../../theme';
import type { Conversation } from '../../types';
import { formatListTimestamp, buildConversationPreview } from '../../utils/listFormatting';
import { listFolderNames, MAX_FOLDER_NAME } from '../../utils/folders';
import { dueReminders, reminderPresets } from '../../utils/reminders';
import { TRASH_RETENTION_DAYS, UNDO_TOAST_MS } from '../../utils/trash';

function greetingKey(hour: number): 'home.greetingMorning' | 'home.greetingAfternoon' | 'home.greetingEvening' {
  if (hour >= 4 && hour < 12) return 'home.greetingMorning';
  if (hour >= 12 && hour < 17) return 'home.greetingAfternoon';
  return 'home.greetingEvening';
}

function SearchIcon({ color }: { color: string }) {
  // Direction-neutral magnifier.
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2.2} fill="none" />
      <Path d="M16.5 16.5L21 21" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function PinGlyph({ color }: { color: string }) {
  // Direction-neutral pushpin: reads the same in Arabic and English layouts.
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path
        d="M9 3h6M10 3v5.5L6.5 12v2h11v-2L14 8.5V3M12 14v7"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function BellGlyph({ color, size = 13 }: { color: string; size?: number }) {
  // Direction-neutral bell: reads the same in Arabic and English layouts.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10M10.2 19a2 2 0 0 0 3.6 0"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const { colors } = useAppTheme();
  const conversations = useChatStore((s) => s.conversations);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const setConversationPinned = useChatStore((s) => s.setConversationPinned);
  const setConversationArchived = useChatStore((s) => s.setConversationArchived);
  const setConversationFolder = useChatStore((s) => s.setConversationFolder);
  const setConversationReminder = useChatStore((s) => s.setConversationReminder);
  const setConversationSystemPrompt = useChatStore((s) => s.setConversationSystemPrompt);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const trash = useChatStore((s) => s.trash);
  const restoreConversation = useChatStore((s) => s.restoreConversation);
  const purgeConversation = useChatStore((s) => s.purgeConversation);
  const emptyTrash = useChatStore((s) => s.emptyTrash);
  const hasModel = useModelStore(useShallow((s) => s.downloadedModels().length > 0));
  const download = useActiveDownload();
  const bot = useBotState();
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [persona, setPersona] = useState<Conversation | null>(null);
  // Folder move sheet: the conversation being filed (null = closed).
  const [moving, setMoving] = useState<Conversation | null>(null);
  // Folder shelf: active filter; null shows every conversation.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  // Archive shelf: the main list hides archived chats behind this explicit toggle.
  const [showArchive, setShowArchive] = useState(false);
  // Trash shelf: soft-deleted chats rest here until restored or purged.
  const [showTrash, setShowTrash] = useState(false);
  // Conversation most recently moved to the trash; powers the undo pill.
  const [undoId, setUndoId] = useState<string | null>(null);
  const [hour] = useState(() => new Date().getHours());

  // The undo offer is short-lived: after the window it lapses quietly (the
  // conversation simply stays in the trash until its retention runs out).
  useEffect(() => {
    if (!undoId) return;
    const timer = setTimeout(() => setUndoId(null), UNDO_TOAST_MS);
    return () => clearTimeout(timer);
  }, [undoId]);

  // After onboarding picked a path, jump straight into a new chat (it shows the download banner).
  useEffect(() => {
    if (useSettingsStore.getState().consumeOpenChatAfterOnboarding()) {
      router.push({ pathname: '/chat/[id]', params: { id: 'new' } });
    }
  }, [router]);

  const suggestions = t('home.suggestions', { returnObjects: true }) as unknown;
  const chips = Array.isArray(suggestions) ? (suggestions as string[]) : [];
  // Wall clock for the list timestamps; refreshed on a timer, never read during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);
  const listLocale = i18n.language === 'ar' ? 'ar' : 'en';

  const openActions = (c: Conversation) => {
    showDialog({
      title: c.title,
      message: t('conversations.actions'),
      actions: [
        {
          label: t(c.pinned ? 'conversations.unpin' : 'conversations.pin'),
          icon: c.pinned ? dialogIcons.unpin : dialogIcons.pin,
          tone: 'accent',
          onPress: () => void setConversationPinned(c.id, !c.pinned),
        },
        {
          label: t(c.archived ? 'conversations.unarchive' : 'conversations.archive'),
          icon: c.archived ? dialogIcons.unarchive : dialogIcons.archive,
          tone: 'primary',
          onPress: () => void setConversationArchived(c.id, !c.archived),
        },
        { label: t('common.rename'), icon: dialogIcons.pencil, tone: 'primary', onPress: () => setRenaming(c) },
        { label: t('conversations.customInstructions'), icon: dialogIcons.sparkles, tone: 'warning', onPress: () => setPersona(c) },
        { label: t('conversations.moveToFolder'), icon: dialogIcons.folder, tone: 'accent', onPress: () => setMoving(c) },
        { label: t('conversations.remind'), icon: dialogIcons.bell, tone: 'warning', onPress: () => openReminderPicker(c) },
        {
          label: t('common.delete'),
          icon: dialogIcons.trash,
          destructive: true,
          // No confirmation dialog: deletion lands in the trash and the undo
          // pill offers a way back, so the extra step would only add friction.
          onPress: () => {
            void deleteConversation(c.id);
            setUndoId(c.id);
          },
        },
        { label: t('common.cancel'), cancel: true },
      ],
    });
  };

  const openTrashActions = (c: Conversation) => {
    showDialog({
      title: c.title,
      message: t('conversations.actions'),
      actions: [
        { label: t('conversations.restore'), icon: dialogIcons.restore, tone: 'success', onPress: () => void restoreConversation(c.id) },
        {
          label: t('conversations.deleteForever'),
          icon: dialogIcons.trash,
          destructive: true,
          onPress: () =>
            void confirmDialog({
              title: t('conversations.deleteTitle'),
              message: t('conversations.deleteBody'),
              confirmLabel: t('common.delete'),
              cancelLabel: t('common.cancel'),
              destructive: true,
            }).then((ok) => {
              if (ok) void purgeConversation(c.id);
            }),
        },
        { label: t('common.cancel'), cancel: true },
      ],
    });
  };

  /** The follow-up chooser: three preset moments, plus an exit when one exists. */
  const openReminderPicker = (c: Conversation) => {
    // Presets come from the shared wall-clock tick (at most half a minute
    // stale) — keeps the render pure and matches the timestamps on screen.
    showDialog({
      title: c.title,
      message: t('conversations.remindTitle'),
      actions: [
        ...reminderPresets(now).map((p) => ({
          label: t(
            p.key === 'inHour'
              ? 'conversations.remindInHour'
              : p.key === 'tomorrow'
                ? 'conversations.remindTomorrow'
                : 'conversations.remindNextWeek',
          ),
          icon: p.key === 'inHour' ? dialogIcons.clock : p.key === 'tomorrow' ? dialogIcons.sunrise : dialogIcons.calendar,
          tone: 'warning' as const,
          onPress: () => void setConversationReminder(c.id, p.at),
        })),
        ...(c.remindAt
          ? [
              {
                label: t('conversations.remindClear'),
                icon: dialogIcons.bellOff,
                destructive: true,
                onPress: () => void setConversationReminder(c.id, null),
              },
            ]
          : []),
        { label: t('common.cancel'), cancel: true },
      ],
    });
  };

  /** Opens a conversation from the reminder shelf: the reminder is consumed. */
  const consumeReminder = (c: Conversation) => {
    void setConversationReminder(c.id, null);
    router.push({ pathname: '/chat/[id]', params: { id: c.id } });
  };

  const newChat = (prompt?: string) =>
    router.push({ pathname: '/chat/[id]', params: prompt ? { id: 'new', prompt } : { id: 'new' } });

  // The visible shelf: all chats, the archived ones, or the trash contents —
  // the two real shelves also respect the active folder filter (trash ignores it).
  const archivedCount = useMemo(() => conversations.reduce((n, c) => n + (c.archived ? 1 : 0), 0), [conversations]);
  const folders = useMemo(() => listFolderNames(conversations), [conversations]);
  // Derived, self-healing filter: a folder whose last conversation was moved
  // away or deleted simply stops matching (no state reset needed), and resumes
  // filtering if the folder ever comes back.
  const effectiveFolder = activeFolder !== null && folders.includes(activeFolder) ? activeFolder : null;
  const visible = useMemo(
    () =>
      showTrash
        ? trash
        : conversations.filter((c) => c.archived === showArchive && (!effectiveFolder || c.folder === effectiveFolder)),
    [conversations, trash, showArchive, showTrash, effectiveFolder],
  );
  // Due follow-up reminders: resurfaced above the list (never in the trash
  // view). Recomputed with the wall-clock tick, so a reminder becomes due at
  // most half a minute after its moment passes.
  const due = useMemo(() => (showTrash ? [] : dueReminders(conversations, now)), [conversations, now, showTrash]);

  return (
    <LookArea style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: bottom }]}>
        <View style={styles.topRow}>
          <Text style={[type.headline, { color: colors.text }]}>{t('appName')}</Text>
          <View style={[styles.liveDot, { backgroundColor: colors.accent, shadowColor: BRAND.cyan }]} />
          <PressableScale
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel={t('search.open')}
            hitSlop={8}
            style={styles.searchEntry}
          >
            <GlassSurface style={styles.searchBtn} radiusSize={radius.pill}>
              <SearchIcon color={colors.text} />
            </GlassSurface>
          </PressableScale>
        </View>

        <View style={styles.hero}>
          <RafeeqBot size={176} interactive state={bot.state} progress={bot.progress} />
          <Animated.Text entering={FadeInDown.duration(420)} style={[type.display, styles.center, { color: colors.text }]}>
            {t(greetingKey(hour))}
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(80).duration(420)} style={[type.body, styles.center, { color: colors.textMuted }]}>
            {t('home.subtitle')}
          </Animated.Text>
        </View>

        {download ? (
          <PressableScale onPress={() => router.push('/models')} accessibilityRole="button">
            <GlassSurface style={styles.banner}>
              <Text style={[type.label, { color: colors.text }]} numberOfLines={1}>
                {t(download.status === 'paused' ? 'chat.downloadPausedBanner' : 'chat.downloadingBanner', {
                  name: download.name,
                  percent: Math.round(download.ratio * 100),
                })}
              </Text>
              <ProgressBar value={download.ratio} />
            </GlassSurface>
          </PressableScale>
        ) : !hasModel ? (
          <GlassSurface style={styles.banner}>
            <Text style={[type.callout, { color: colors.textMuted }]}>{t('home.noModelHint')}</Text>
            <Button title={t('chat.goToModels')} variant="primary" compact onPress={() => router.push('/models')} style={styles.bannerBtn} />
          </GlassSurface>
        ) : null}

        <SectionTitle>{t('home.suggestionsTitle')}</SectionTitle>
        <View style={styles.chips}>
          {chips.map((c, i) => (
            <Animated.View key={c} entering={FadeInDown.delay(120 + i * 60).duration(380)} style={styles.chipCell}>
              <Chip label={c} onPress={() => newChat(c)} style={styles.chip} />
            </Animated.View>
          ))}
        </View>

        <Button title={`＋  ${t('conversations.newChat')}`} variant="primary" onPress={() => newChat()} style={styles.newChat} />

        {!showTrash && (archivedCount > 0 || showArchive) ? (
          <PressableScale
            onPress={() => setShowArchive((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showArchive ? t('conversations.backToChats') : t('conversations.archiveView', { n: archivedCount })}
            style={styles.archiveToggleWrap}
          >
            <GlassSurface style={styles.archiveToggle} radiusSize={radius.pill}>
              <Text style={[type.label, { color: showArchive ? colors.accent : colors.textMuted }]}>
                {showArchive ? t('conversations.backToChats') : t('conversations.archiveView', { n: archivedCount })}
              </Text>
            </GlassSurface>
          </PressableScale>
        ) : null}

        {trash.length > 0 || showTrash ? (
          <PressableScale
            onPress={() => setShowTrash((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showTrash ? t('conversations.backToChats') : t('conversations.trashView', { n: trash.length })}
            style={styles.archiveToggleWrap}
          >
            <GlassSurface style={styles.archiveToggle} radiusSize={radius.pill}>
              <Text style={[type.label, { color: showTrash ? colors.danger : colors.textMuted }]}>
                {showTrash ? t('conversations.backToChats') : t('conversations.trashView', { n: trash.length })}
              </Text>
            </GlassSurface>
          </PressableScale>
        ) : null}

        {folders.length > 0 && !showTrash ? (
          <View style={styles.folderShelf}>
            <PressableScale
              onPress={() => setActiveFolder(null)}
              accessibilityRole="button"
              accessibilityLabel={t('conversations.allConversations')}
            >
              <GlassSurface style={styles.folderPill} radiusSize={radius.pill}>
                <Text style={[type.label, { color: effectiveFolder === null ? colors.accent : colors.textMuted }]}>
                  {t('conversations.allConversations')}
                </Text>
              </GlassSurface>
            </PressableScale>
            {folders.map((name) => (
              <PressableScale
                key={name}
                onPress={() => setActiveFolder((cur) => (cur === name ? null : name))}
                accessibilityRole="button"
                accessibilityLabel={name}
              >
                <GlassSurface style={styles.folderPill} radiusSize={radius.pill}>
                  <Text numberOfLines={1} style={[type.label, { color: effectiveFolder === name ? colors.accent : colors.textMuted }]}>
                    {name}
                  </Text>
                </GlassSurface>
              </PressableScale>
            ))}
          </View>
        ) : null}

        {due.length > 0 ? (
          <View style={styles.reminderShelf}>
            {due.map((c) => (
              <PressableScale
                key={c.id}
                onPress={() => consumeReminder(c)}
                accessibilityRole="button"
                accessibilityLabel={`${t('conversations.remindDue', {
                  time: formatListTimestamp(c.remindAt, now, listLocale, t('conversations.justNow')),
                })}: ${c.title || t('conversations.untitled')}`}
              >
                <GlassSurface style={styles.reminderCard} radiusSize={radius.lg}>
                  <BellGlyph color={colors.accent} size={16} />
                  <View style={styles.reminderBody}>
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.text }]}>
                      {c.title || t('conversations.untitled')}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { color: colors.textMuted }]}>
                      {t('conversations.remindDue', {
                        time: formatListTimestamp(c.remindAt, now, listLocale, t('conversations.justNow')),
                      })}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('conversations.remindClear')}
                    hitSlop={10}
                    onPress={() => void setConversationReminder(c.id, null)}
                  >
                    <Text style={[type.headline, { color: colors.textMuted, paddingHorizontal: spacing.sm }]}>×</Text>
                  </Pressable>
                </GlassSurface>
              </PressableScale>
            ))}
          </View>
        ) : null}

        {showTrash && trash.length > 0 ? (
          <Button
            title={t('conversations.emptyTrash')}
            variant="danger"
            compact
            onPress={() =>
              void confirmDialog({
                title: t('conversations.emptyTrashTitle'),
                message: t('conversations.emptyTrashBody'),
                confirmLabel: t('common.delete'),
                cancelLabel: t('common.cancel'),
                destructive: true,
              }).then((ok) => {
                if (ok) void emptyTrash();
              })
            }
            style={styles.emptyTrash}
          />
        ) : null}

        {visible.length > 0 ? <SectionTitle>{showTrash ? t('conversations.trashView', { n: trash.length }) : t('home.recent')}</SectionTitle> : null}
        {visible.map((item, i) => (
          <Animated.View key={item.id} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(320)} layout={LinearTransition}>
            <PressableScale
              accessibilityRole="button"
              onPress={showTrash ? () => openTrashActions(item) : () => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
              onLongPress={() => (showTrash ? openTrashActions(item) : openActions(item))}
            >
              <GlassSurface style={styles.item} radiusSize={radius.lg}>
                <View style={[styles.itemIcon, { backgroundColor: colors.surfaceAlt }]}>
                  <RafeeqBot size={30} animated={false} />
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.titleRow}>
                    {item.pinned ? <PinGlyph color={colors.accent} /> : null}
                    {item.remindAt ? <BellGlyph color={colors.textMuted} /> : null}
                    <Text numberOfLines={1} style={[type.bodyStrong, styles.auto, styles.titleText, { color: colors.text }]}>
                      {item.title || t('conversations.untitled')}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, styles.itemTime, { color: colors.textFaint }]}>
                      {formatListTimestamp(
                        showTrash ? (item.deletedAt ?? item.updatedAt) : (item.lastMessageAt ?? item.updatedAt),
                        now,
                        listLocale,
                        t('conversations.justNow'),
                      )}
                    </Text>
                  </View>
                  {item.lastPreview ? (
                    <Text numberOfLines={1} style={[type.caption, styles.auto, styles.itemPreview, { color: colors.textMuted }]}>
                      {item.folder ? `${item.folder} · ` : ''}
                      {buildConversationPreview(item.lastPreview)}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('conversations.actions')}
                  hitSlop={10}
                  onPress={() => (showTrash ? openTrashActions(item) : openActions(item))}
                >
                  <Text style={[type.headline, { color: colors.textMuted, paddingHorizontal: spacing.sm }]}>⋯</Text>
                </Pressable>
              </GlassSurface>
            </PressableScale>
          </Animated.View>
        ))}
        {showTrash && visible.length === 0 ? (
          <Text style={[type.callout, styles.center, styles.emptyHint, { color: colors.textFaint }]}>
            {t('conversations.trashEmptyHint', { days: TRASH_RETENTION_DAYS })}
          </Text>
        ) : null}
        {!showArchive && !showTrash && conversations.length === 0 ? (
          <Text style={[type.callout, styles.center, styles.emptyHint, { color: colors.textFaint }]}>{t('conversations.emptyHint')}</Text>
        ) : null}
      </ScrollView>

      {undoId ? (
        <Animated.View entering={FadeInDown.duration(260)} style={[styles.undoToast, { bottom: bottom + spacing.md }]} pointerEvents="box-none">
          <GlassSurface style={styles.undoPill} radiusSize={radius.pill}>
            <Text numberOfLines={1} style={[type.label, styles.undoText, { color: colors.text }]}>
              {t('conversations.movedToTrash')}
            </Text>
            <PressableScale
              onPress={() => {
                const id = undoId;
                setUndoId(null);
                if (id) void restoreConversation(id);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('conversations.undo')}
              hitSlop={8}
            >
              <Text style={[type.label, styles.undoAction, { color: colors.accent }]}>{t('conversations.undo')}</Text>
            </PressableScale>
          </GlassSurface>
        </Animated.View>
      ) : null}
      <TextPromptModal
        visible={renaming !== null}
        title={t('conversations.renameTitle')}
        initialValue={renaming?.title ?? ''}
        onCancel={() => setRenaming(null)}
        onSubmit={(v) => {
          if (renaming) void renameConversation(renaming.id, v);
          setRenaming(null);
        }}
      />
      <TextPromptModal
        visible={moving !== null}
        title={t('conversations.folderTitle')}
        hint={t('conversations.folderHint')}
        initialValue={moving?.folder ?? ''}
        maxLength={MAX_FOLDER_NAME}
        allowEmpty
        onCancel={() => setMoving(null)}
        onSubmit={(v) => {
          if (moving) void setConversationFolder(moving.id, v);
          setMoving(null);
        }}
      />
      <TextPromptModal
        visible={persona !== null}
        title={t('conversations.customInstructionsTitle')}
        hint={t('conversations.customInstructionsHint')}
        initialValue={persona?.systemPrompt ?? ''}
        multiline
        maxLength={2000}
        allowEmpty
        onCancel={() => setPersona(null)}
        onSubmit={(v) => {
          if (persona) void setConversationSystemPrompt(persona.id, v);
          setPersona(null);
        }}
      />
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4 },
  searchEntry: { marginLeft: 'auto' },
  searchBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingTop: spacing.xxl + spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  center: { textAlign: 'center' },
  auto: { textAlign: 'auto' },
  banner: { padding: spacing.lg, marginTop: spacing.md, gap: spacing.xs },
  bannerBtn: { alignSelf: 'flex-start', marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  chipCell: { width: '50%', padding: spacing.xs },
  chip: { minHeight: 76 },
  newChat: { marginTop: spacing.lg },
  archiveToggleWrap: { alignSelf: 'flex-start', marginTop: spacing.md },
  archiveToggle: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  emptyTrash: { marginTop: spacing.md, alignSelf: 'flex-start' },
  folderShelf: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  folderPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    alignSelf: 'flex-start',
  },
  reminderShelf: { gap: spacing.sm, marginTop: spacing.md },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  reminderBody: { flex: 1 },
  undoToast: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  undoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  undoText: { flexShrink: 1 },
  undoAction: { fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md },
  itemIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  titleText: { flex: 1 },
  itemTime: { flexShrink: 0, marginStart: spacing.xs },
  itemPreview: { marginTop: 2 },
  emptyHint: { marginTop: spacing.xl, paddingHorizontal: spacing.xl },
});
