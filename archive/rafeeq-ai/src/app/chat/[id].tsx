// Copyright (c) 2026 DRS AI. All rights reserved.
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';

import { ConversationDetailsModal } from '../../components/ConversationDetailsModal';
import { AgentPanel } from '../../components/agent/AgentPanel';
import { dialogIcons } from '../../components/DialogIcons';
import { FocusOverlay } from '../../components/FocusOverlay';
import { LookArea } from '../../components/LookArea';
import { MarkdownBody } from '../../components/MarkdownBody';
import { PromptLibraryModal } from '../../components/PromptLibraryModal';
import { RafeeqBot } from '../../components/RafeeqBot';
import { BackChevron, Button, Chip, GlassSurface, PressableScale, ProgressBar, StatusChip } from '../../components/ui';
import { useActiveDownload } from '../../hooks/useActiveDownload';
import { useAgentSuggestions } from '../../hooks/useAgentSuggestions';
import { useBotState } from '../../hooks/useBotState';
import { useModelLoader } from '../../hooks/useModelLoader';
import { VOICE_MODEL_ID } from '../../models/catalog';
import { effectiveSystemPrompt, useChatStore, type SendOptions } from '../../store/chatStore';
import { applyStyleDirective, styleDirective } from '../../onboarding/profile';
import { useProfileStore } from '../../store/profileStore';
import { useAgentStore } from '../../store/agentStore';
import { confirmDialog, notify, showDialog } from '../../store/dialogStore';
import { useLlmStore } from '../../store/llmStore';
import { useModelStore } from '../../store/modelStore';
import { insertPromptIntoDraft } from '../../store/promptLibraryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTtsStore } from '../../store/ttsStore';
import { useVoiceStore } from '../../store/voiceStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../../theme';
import { focusTarget } from '../../utils/focus';
import type { ChatMessage } from '../../types';
import { findMessageMatches } from '../../utils/conversationSearch';
import { normalizeQuotedContent } from '../../utils/quote';
import { buildConversationMarkdown, shareConversationText } from '../../utils/conversationExport';
import { buildConversationHtml, renderConversationPdf, shareConversationPdf } from '../../utils/conversationPdf';
import { scaledTextStyle } from '../../utils/chatFont';
import { formatBytes } from '../../utils/format';
import { quickActionsFor } from '../../utils/quickActions';
import { suggestionsUiState } from '../../utils/suggestions';
import { variantsUiState } from '../../utils/variants';
import { haptic } from '../../utils/haptics';
import { copyMessageText, shareMessageText } from '../../utils/messageActions';
import { isNearBottom } from '../../utils/scroll';
import { goBack } from '../../navigation/goBack';

function DownloadBanner() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const download = useActiveDownload();
  if (!download) return null;
  return (
    <Animated.View entering={FadeInUp.duration(260)}>
      <GlassSurface style={styles.banner}>
        <Text style={[type.label, styles.auto, { color: colors.text }]} numberOfLines={1}>
          {t(download.status === 'paused' ? 'chat.downloadPausedBanner' : 'chat.downloadingBanner', {
            name: download.name,
            percent: Math.round(download.ratio * 100),
          })}
        </Text>
        <ProgressBar value={download.ratio} />
        <Text style={[type.caption, styles.auto, { color: colors.textMuted, marginTop: spacing.xs }]}>{t('chat.downloadHint')}</Text>
      </GlassSurface>
    </Animated.View>
  );
}

function ModelBar() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const loadWithChecks = useModelLoader();
  const status = useLlmStore((s) => s.status);
  const loadedModelId = useLlmStore((s) => s.loadedModelId);
  const llmError = useLlmStore((s) => s.error);
  const release = useLlmStore((s) => s.release);
  const generating = useChatStore((s) => s.generating);
  const suggesting = useChatStore((s) => s.suggesting);
  const downloadedRaw = useModelStore(useShallow((s) => s.downloadedModels()));
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const download = useActiveDownload();
  const [picking, setPicking] = useState(false);

  const downloaded = [...downloadedRaw].sort((a, b) => (a.id === selectedModelId ? -1 : b.id === selectedModelId ? 1 : 0));
  const loaded = loadedModelId ? useModelStore.getState().getModel(loadedModelId) : undefined;

  if (status === 'loading') {
    return (
      <View style={styles.modelRow}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={[type.label, { color: colors.textMuted }]}>{t('chat.loading')}</Text>
      </View>
    );
  }

  if (status === 'ready' && loaded && !picking) {
    return (
      <View style={styles.modelRow}>
        <Pressable onPress={() => !generating && setPicking(true)} accessibilityRole="button" style={styles.flexShrink}>
          <StatusChip tone="success" label={t('chat.ready', { name: loaded.name })} />
        </Pressable>
        <Button title={t('chat.release')} compact variant="ghost" onPress={() => void release()} disabled={generating || suggesting} />
      </View>
    );
  }

  if (downloaded.length === 0) {
    if (download) return null; // the download banner explains what is happening
    return (
      <GlassSurface style={styles.modelCard}>
        <Text style={[type.callout, styles.auto, { color: colors.textMuted }]}>{t('chat.noDownloaded')}</Text>
        <Button title={t('chat.goToModels')} variant="primary" compact onPress={() => router.push('/models')} style={styles.selfStart} />
      </GlassSurface>
    );
  }

  return (
    <GlassSurface style={styles.modelCard}>
      <Text style={[type.caption, styles.auto, { color: llmError ? colors.danger : colors.textMuted }]}>
        {llmError ? `${t('chat.noModel')} — ${llmError}` : t('chat.chooseModel')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {downloaded.map((m) => (
          <Button
            key={m.id}
            title={m.name}
            compact
            variant={m.id === loadedModelId ? 'primary' : 'secondary'}
            onPress={() => {
              setPicking(false);
              void loadWithChecks(m.id);
            }}
          />
        ))}
      </ScrollView>
    </GlassSurface>
  );
}

function Caret() {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.set(withRepeat(withSequence(withTiming(0.15, { duration: 420 }), withTiming(1, { duration: 420 })), -1, false));
    return () => cancelAnimation(o);
  }, [o, reduce]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.caret, st]} />;
}

function CheckIcon({ color }: { color: string }) {
  // Direction-neutral check glyph for the "resend edited message" action.
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Inline editor shown in place of a user bubble while it is being rewritten. */
function EditBubble({
  message,
  onSubmit,
  onCancel,
}: {
  message: ChatMessage;
  onSubmit: (messageId: string, text: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(message.content);
  const canSubmit = draft.trim().length > 0;
  return (
    <View style={styles.editWrap}>
      <GlassSurface strong radiusSize={radius.lg} style={styles.editCard}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          multiline
          maxLength={8000}
          accessibilityLabel={t('chat.editMessage')}
          style={[type.body, styles.auto, styles.editInput, { color: colors.text }]}
        />
      </GlassSurface>
      <View style={styles.editActions}>
        <PressableScale
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          hitSlop={8}
          style={[styles.regenerateBtn, { borderColor: colors.border }]}
        >
          <Text style={[type.label, { color: colors.textMuted }]}>{t('common.cancel')}</Text>
        </PressableScale>
        <PressableScale
          onPress={() => onSubmit(message.id, draft)}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('chat.editResend')}
          accessibilityState={{ disabled: !canSubmit }}
          hitSlop={8}
          style={[styles.regenerateBtn, { borderColor: colors.border }, { opacity: canSubmit ? 1 : 0.4 }]}
        >
          <CheckIcon color={colors.accent} />
          <Text style={[type.label, { color: colors.accent }]}>{t('chat.editResend')}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

/** The small quoted-context block a bubble shows above its own text. */
function QuoteBlock({
  quotedId,
  snippet,
  missing,
  onJump,
  onUser,
}: {
  quotedId: string;
  snippet: string;
  missing: boolean;
  onJump?: (messageId: string) => void;
  onUser: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const jumpable = !!onJump && !missing;
  const textColor = onUser ? colors.userBubbleText : colors.textMuted;
  return (
    <Pressable
      onPress={jumpable ? () => onJump!(quotedId) : undefined}
      disabled={!jumpable}
      accessibilityRole={jumpable ? 'button' : undefined}
      accessibilityLabel={t('chat.quotedReply')}
      style={[
        styles.quoteBlock,
        {
          borderStartColor: onUser ? 'rgba(255,255,255,0.8)' : colors.accent,
          backgroundColor: onUser ? 'rgba(255,255,255,0.16)' : 'rgba(128,128,128,0.14)',
        },
      ]}
    >
      {missing ? (
        <Text numberOfLines={1} style={[type.caption, styles.auto, { color: textColor, opacity: 0.8, fontStyle: 'italic' }]}>
          {t('chat.quoteMissing')}
        </Text>
      ) : (
        <>
          <Text numberOfLines={1} style={[type.label, styles.auto, { color: onUser ? colors.userBubbleText : colors.accent, opacity: 0.9 }]}>
            {t('chat.quotedReply')}
          </Text>
          <Text numberOfLines={2} style={[type.caption, styles.auto, { color: textColor }]}>
            {snippet}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const Message = memo(function Message({
  message,
  streaming,
  isLast,
  allowRegenerate,
  onRegenerate,
  onMessageAction,
  highlight,
  speaking,
  onSpeakToggle,
  onCopy,
  editing,
  onEditSubmit,
  onEditCancel,
  quotedId,
  quotedSnippet,
  quotedMissing,
  onQuotePress,
  variantContent,
  variantStat,
  variantBadge,
  variantLoadingLabel,
  variantActive,
  onVariantsPrepare,
  onVariantPrev,
  onVariantNext,
  onVariantKeep,
  onVariantDismiss,
}: {
  message: ChatMessage;
  streaming: boolean;
  /** This message is the newest in the conversation; regenerate lives only here. */
  isLast?: boolean;
  /** Engine-level gate: model loaded and not generating right now. */
  allowRegenerate?: boolean;
  onRegenerate?: () => void;
  onMessageAction?: (message: ChatMessage) => void;
  highlight?: boolean;
  speaking?: boolean;
  onSpeakToggle?: (message: ChatMessage) => void;
  onCopy?: (message: ChatMessage) => void;
  editing?: boolean;
  onEditSubmit?: (messageId: string, text: string) => void;
  onEditCancel?: () => void;
  /** Quote context of this message, resolved by the caller as stable primitives. */
  quotedId?: string | null;
  quotedSnippet?: string;
  quotedMissing?: boolean;
  onQuotePress?: (messageId: string) => void;
  /** Previewed alternate draft; null/absent shows the persisted text. */
  variantContent?: string | null;
  /** Engine stats of the previewed draft, when it is not the original reply. */
  variantStat?: { tokensPerSecond: number | null; tokenCount: number | null } | null;
  /** "٢/٣" position label of the switcher, when ready. */
  variantBadge?: string | null;
  /** Loader label while extra drafts are being prepared. */
  variantLoadingLabel?: string | null;
  /** The switcher owns this reply right now, so the prepare trigger steps aside. */
  variantActive?: boolean;
  onVariantsPrepare?: () => void;
  onVariantPrev?: () => void;
  onVariantNext?: () => void;
  onVariantKeep?: () => void;
  onVariantDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const isUser = message.role === 'user';
  // The switcher previews an alternate draft inside the same bubble; storage
  // is only rewritten by the explicit keep action.
  const shown = variantContent ?? message.content;
  const statSource = variantStat ?? message;
  // Accessibility: message text follows the chat font size chosen in settings.
  const fontScale = useSettingsStore((st) => st.chatFontScale);
  const bodyScaled = scaledTextStyle(type.body, fontScale);
  // Per-message engine stats, joined when both are available ("512 · 24.3 رمز/ث").
  const statParts: string[] = [];
  if (!streaming && statSource.tokenCount != null) statParts.push(t('chat.tokenCount', { value: statSource.tokenCount }));
  if (!streaming && statSource.tokensPerSecond) {
    statParts.push(t('chat.tokensPerSecond', { value: statSource.tokensPerSecond.toFixed(1) }));
  }
  // Long-press opens the copy/share menu once the message has final text.
  const canAct = !!onMessageAction && !streaming && !editing && shown.trim().length > 0;
  const handleLongPress = canAct ? () => onMessageAction!(message) : undefined;
  const quoteBlock =
    quotedId && onQuotePress ? (
      <QuoteBlock quotedId={quotedId} snippet={quotedSnippet ?? ''} missing={!!quotedMissing} onJump={onQuotePress} onUser={isUser} />
    ) : null;
  if (isUser) {
    return (
      <Animated.View entering={FadeInDown.duration(240)} style={[styles.row, styles.rowUser, highlight && [styles.rowHighlighted, { backgroundColor: colors.highlight }]]}>
        {editing && onEditSubmit && onEditCancel ? (
          <EditBubble message={message} onSubmit={onEditSubmit} onCancel={onEditCancel} />
        ) : (
          <Pressable
            onLongPress={handleLongPress}
            disabled={!handleLongPress}
            accessibilityRole="button"
            accessibilityLabel={t('chat.messageOptions')}
          >
            <LinearGradient
              colors={BRAND.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.userBubble, { shadowColor: BRAND.from }]}
            >
              {quoteBlock}
              <Text selectable style={[type.body, bodyScaled, styles.auto, { color: colors.userBubbleText }]}>
                {message.content}
              </Text>
            </LinearGradient>
          </Pressable>
        )}
      </Animated.View>
    );
  }
  const botState = streaming ? (message.content ? 'speaking' : 'thinking') : 'idle';
  // One-tap row under the bubble: copy/speak for every completed reply,
  // regenerate only for the newest one while the engine is free.
  const quick = quickActionsFor({
    role: message.role,
    streaming,
    editing: !!editing,
    content: message.content,
    isLast: !!isLast,
    allowRegenerate: !!allowRegenerate,
  });
  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      layout={LinearTransition.duration(180)}
      style={[styles.row, highlight && [styles.rowHighlighted, { backgroundColor: colors.highlight }]]}
    >
      <View style={styles.avatar}>
        <RafeeqBot size={30} state={botState} animated={streaming} />
      </View>
      <Pressable
        onLongPress={handleLongPress}
        disabled={!handleLongPress}
        accessibilityRole={handleLongPress ? 'button' : undefined}
        accessibilityLabel={handleLongPress ? t('chat.messageOptions') : undefined}
        style={styles.assistant}
      >
        {quoteBlock}
        {shown ? (
          streaming ? (
            // Cheap plain text while tokens arrive; Markdown parses once on completion.
            <Text selectable style={[type.body, bodyScaled, styles.auto, { color: colors.text }]}>
              {shown}{' '}
            </Text>
          ) : (
            <MarkdownBody content={shown} />
          )
        ) : (
          <Text style={[type.callout, styles.auto, { color: colors.textMuted }]}>{t('chat.thinking')}</Text>
        )}
        {streaming && message.content ? <Caret /> : null}
        {statParts.length > 0 ? (
          <Text style={[type.caption, styles.auto, { color: colors.textFaint, marginTop: 6 }]}>{statParts.join(' · ')}</Text>
        ) : null}
        {quick.length > 0 ? (
          <View style={styles.quickRow}>
            {quick.includes('copy') && onCopy ? (
              <PressableScale
                onPress={() => onCopy(message)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.copyMessage')}
                hitSlop={8}
                style={[styles.quickBtn, { borderColor: colors.border }]}
              >
                {dialogIcons.copy(colors.textMuted, 15)}
              </PressableScale>
            ) : null}
            {quick.includes('speak') && onSpeakToggle ? (
              <PressableScale
                onPress={() => onSpeakToggle(message)}
                accessibilityRole="button"
                accessibilityLabel={speaking ? t('chat.stopSpeech') : t('chat.speak')}
                accessibilityHint={t('chat.speakHint')}
                hitSlop={8}
                style={[styles.quickBtn, { borderColor: colors.border }]}
              >
                {speaking ? <StopGlyph color={colors.accent} /> : <SpeakerIcon color={colors.textMuted} />}
              </PressableScale>
            ) : null}
            {quick.includes('regenerate') && onRegenerate ? (
              <PressableScale
                onPress={onRegenerate}
                accessibilityRole="button"
                accessibilityLabel={t('chat.regenerate')}
                accessibilityHint={t('chat.regenerateHint')}
                hitSlop={8}
                style={[styles.quickBtn, { borderColor: colors.border }]}
              >
                <RefreshIcon color={colors.textMuted} />
              </PressableScale>
            ) : null}
            {quick.includes('variants') && onVariantsPrepare && !variantActive ? (
              <PressableScale
                onPress={onVariantsPrepare}
                accessibilityRole="button"
                accessibilityLabel={t('chat.variantsAction')}
                accessibilityHint={t('chat.variantsHint')}
                hitSlop={8}
                style={[styles.quickBtn, { borderColor: colors.border }]}
              >
                <LayersIcon color={colors.textMuted} />
              </PressableScale>
            ) : null}
          </View>
        ) : null}
        {variantActive ? (
          <View style={[styles.variantBar, { borderColor: colors.border }]}>
            {variantLoadingLabel ? (
              <View style={styles.variantLoading}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[type.caption, styles.auto, { color: colors.textMuted }]}>{variantLoadingLabel}</Text>
              </View>
            ) : (
              <>
                <PressableScale
                  onPress={onVariantPrev}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.variantsPrev')}
                  hitSlop={8}
                  style={styles.variantNav}
                >
                  {I18nManager.isRTL ? <ChevronRightIcon color={colors.textMuted} /> : <ChevronLeftIcon color={colors.textMuted} />}
                </PressableScale>
                <Text style={[type.caption, styles.variantBadge, { color: colors.text }]}>{variantBadge}</Text>
                <PressableScale
                  onPress={onVariantNext}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.variantsNext')}
                  hitSlop={8}
                  style={styles.variantNav}
                >
                  {I18nManager.isRTL ? <ChevronLeftIcon color={colors.textMuted} /> : <ChevronRightIcon color={colors.textMuted} />}
                </PressableScale>
                <PressableScale
                  onPress={onVariantKeep}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.variantsKeep')}
                  accessibilityHint={t('chat.variantsKeepHint')}
                  hitSlop={6}
                  style={[styles.variantKeep, { borderColor: colors.accent }]}
                >
                  <CheckIcon color={colors.accent} />
                  <Text style={[type.caption, { color: colors.accent }]}>{t('chat.variantsKeep')}</Text>
                </PressableScale>
                <PressableScale
                  onPress={onVariantDismiss}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.variantsDismiss')}
                  hitSlop={8}
                  style={styles.variantNav}
                >
                  <ClearGlyph color={colors.textMuted} />
                </PressableScale>
              </>
            )}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

function SendIcon({ stop }: { stop?: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      {stop ? (
        <Rect x={7} y={7} width={10} height={10} rx={2.5} fill="#FFFFFF" />
      ) : (
        // Arrow pointing up: direction-neutral, so it reads the same in Arabic and English.
        <Path d="M12 19V6M6 11.5L12 5.5L18 11.5" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
    </Svg>
  );
}

function RefreshIcon({ color }: { color: string }) {
  // Direction-neutral "rotate-cw" glyph, drawn inline to stay dependency-free.
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M23 4v6h-6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function SpeakerIcon({ color }: { color: string }) {
  // Loudspeaker glyph: universally recognizable, reads the same in RTL.
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M11 5L6 9H2v6h4l5 4V5z" fill={color} />
      <Path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function StopGlyph({ color }: { color: string }) {
  // Colorable stop square for the 'stop reading' state (the composer's white
  // variant sits on a filled danger button; this one sits on the glass pill).
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Rect x={5} y={5} width={14} height={14} rx={3} fill={color} />
    </Svg>
  );
}

function ShareIcon({ color }: { color: string }) {
  // iOS-style share glyph (arrow out of a tray): direction-neutral, reads the same in RTL.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 15V3.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d="M7.5 7.5L12 3l4.5 4.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v7A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H17" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function MicIcon({ color }: { color: string }) {
  // Standard microphone glyph: capsule body + stand. Reads the same in RTL.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill={color} />
      <Path d="M19 10.5v.5a7 7 0 0 1-14 0v-.5M12 18v4" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function StopSquareIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Rect x={6.5} y={6.5} width={11} height={11} rx={2.5} fill="#FFFFFF" />
    </Svg>
  );
}

function BookmarkIcon({ color }: { color: string }) {
  // Bookmark glyph for the saved-prompt library: direction-neutral, reads the same in RTL.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-3.8L5.5 20.5v-16a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function PinIcon({ color }: { color: string }) {
  // Pushpin glyph for the pinned-message banner: direction-neutral, reads the same in RTL.
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M12 17v5" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path
        d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  // Magnifier glyph for in-conversation search: direction-neutral, reads the same in RTL.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={2.2} fill="none" />
      <Path d="M15.8 15.8L20.5 20.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function InfoIcon({ color }: { color: string }) {
  // Info circle glyph for the details panel: direction-neutral, reads the same in RTL.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={2.2} fill="none" />
      <Path d="M12 11.5V16" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={8} r={1.4} fill={color} />
    </Svg>
  );
}

function ChevronUpIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M6 14.5l6-6 6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ChevronDownIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M6 9.5l6 6 6-6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M14.5 6l-6 6 6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ChevronRightIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M9.5 6l6 6-6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function LayersIcon({ color }: { color: string }) {
  // Stacked-sheets glyph for the alternate-drafts switcher: direction-neutral.
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M12 3.5L21 8l-9 4.5L3 8z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M4.5 12.5L12 16.2l7.5-3.7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M4.5 16.5L12 20.2l7.5-3.7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ClearGlyph({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function AgentGlyph({ color }: { color: string }) {
  // Compass glyph for agent mode: a planning needle inside a ring. Direction-neutral.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M15.2 8.8l-2.1 4.9-4.9 2.1 2.1-4.9z" fill={color} />
    </Svg>
  );
}

function QuoteGlyph({ color }: { color: string }) {
  // Chat-bubble glyph for quoting a message: direction-neutral, reads the same in RTL.
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M12 4.5c-4.7 0-8.5 3.1-8.5 7 0 2.1 1.1 4 2.9 5.3l-.8 3a.5.5 0 0 0 .68.58l3.5-1.5c.71.15 1.46.22 2.22.22 4.7 0 8.5-3.1 8.5-7s-3.8-7.6-8.5-7.6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Red dot pulsing next to the elapsed time while the mic is live. */
function RecordingDot() {
  const { colors } = useAppTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.set(withRepeat(withSequence(withTiming(0.25, { duration: 500 }), withTiming(1, { duration: 500 })), -1, false));
    return () => cancelAnimation(o);
  }, [o, reduce]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.recDot, st, { backgroundColor: colors.danger }]} />;
}

/** The "Recording… Ns" pill above the composer; mounts fresh per session. */
function RecordingBadge({ startedAt }: { startedAt: number }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
  useEffect(() => {
    const iv = setInterval(() => setSecs(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.recordingRow}>
      <RecordingDot />
      <Text style={[type.label, { color: colors.danger }]}>{t('voice.recording', { seconds: secs })}</Text>
    </Animated.View>
  );
}

/**
 * What the user currently sees for a message: the previewed alternate draft
 * when the variants switcher points at it, otherwise the persisted text. Copy,
 * speak and the long-press menu all follow what is actually on screen.
 */
function shownContent(message: ChatMessage): string {
  const v = useChatStore.getState().variants;
  if (v && v.forMessageId === message.id && v.activeIndex > 0) return v.items[v.activeIndex] ?? message.content;
  return message.content;
}

/** Settings snapshot used for both sending and regenerating. */
function sendOptions(t: (key: string) => string, loadedModelId: string | null, replyTo?: string): SendOptions {
  const s = useSettingsStore.getState();
  // A conversation's own instructions win over the global default from Settings;
  // an empty override inherits it (then the localized default applies).
  const cs = useChatStore.getState();
  const prompt = effectiveSystemPrompt(cs.conversations.find((c) => c.id === cs.currentId), s.systemPrompt);
  // The onboarding personalization rides on top of whatever base prompt won:
  // a concise/detailed style and the speed/accuracy tilt become a short
  // directive appended to the system prompt (empty = model default).
  const profile = useProfileStore.getState();
  const directive = styleDirective(profile, s.language);
  return {
    systemPrompt: applyStyleDirective(prompt || t('settings.systemPromptDefault'), directive),
    temperature: s.temperature,
    contextSize: useLlmStore.getState().loadedContextSize ?? s.contextSize,
    maxTokens: s.maxTokens,
    modelId: loadedModelId,
    fallbackTitle: t('conversations.untitled'),
    replyTo,
  };
}

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id, prompt, messageId } = useLocalSearchParams<{ id: string; prompt?: string; messageId?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  // Tracks whether the user is reading near the bottom; auto-scroll only follows then.
  const nearBottom = useRef(true);
  // Message to jump to after opening (deep link from global search).
  const pendingJump = useRef<string | null>(typeof messageId === 'string' && messageId.length > 0 ? messageId : null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => (typeof prompt === 'string' ? prompt : ''));
  // Id of the user message currently being rewritten inline (null when none).
  const [editingId, setEditingId] = useState<string | null>(null);
  // Saved-prompt library sheet: open flag plus the "save this message" seed.
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [promptSeed, setPromptSeed] = useState<{ body: string } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Focus mode: a calm full-screen reading surface for the streaming/last reply.
  const [focusOpen, setFocusOpen] = useState(false);
  // Id of the message the next send will quote; cleared on send and on chat switch.
  const [quotedId, setQuotedId] = useState<string | null>(null);
  // In-conversation search: bar visibility, query, current match, highlighted message.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [searchMatchId, setSearchMatchId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messages = useChatStore((s) => s.messages);
  const currentId = useChatStore((s) => s.currentId);
  const conversations = useChatStore((s) => s.conversations);
  const generating = useChatStore((s) => s.generating);
  const agentMode = useAgentStore((s) => s.modeEnabled);
  const agentSession = useAgentStore((s) => s.session);
  const agentSuggestionsOn = useSettingsStore((s) => s.agentSuggestions);
  const agentLang = useSettingsStore((s) => s.language);
  const proactiveSuggestions = useAgentSuggestions(agentMode && agentSuggestionsOn && !agentSession);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const suggesting = useChatStore((s) => s.suggesting);
  const suggestions = useChatStore((s) => s.suggestions);
  const variants = useChatStore((s) => s.variants);
  const variantsBusy = useChatStore((s) => s.variantsBusy);
  const chatError = useChatStore((s) => s.error);
  const openConversation = useChatStore((s) => s.openConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const regenerate = useChatStore((s) => s.regenerate);
  const editUserMessage = useChatStore((s) => s.editUserMessage);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const clearError = useChatStore((s) => s.clearError);
  const llmStatus = useLlmStore((s) => s.status);
  const loadedModelId = useLlmStore((s) => s.loadedModelId);
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const selectedStatus = useModelStore((s) => (selectedModelId ? s.files[selectedModelId]?.status : undefined));
  const selectedVoiceModelId = useSettingsStore((s) => s.selectedVoiceModelId);
  // The mic transcribes with the user's chosen voice model (the Saudi dialectal
  // fine-tune when imported); the catalog default is the fallback.
  const voiceModelId = selectedVoiceModelId ?? VOICE_MODEL_ID;
  const voicePath = useModelStore((s) => s.localPath(voiceModelId));
  const voiceLanguage = useModelStore((s) => s.getModel(voiceModelId)?.voiceLanguage ?? null);
  const voiceStatus = useVoiceStore((s) => s.status);
  const voiceStartedAt = useVoiceStore((s) => s.startedAt);
  const voiceToggle = useVoiceStore((s) => s.toggle);
  const ttsStatus = useTtsStore((s) => s.status);
  const ttsMessageId = useTtsStore((s) => s.messageId);
  const loadWithChecks = useModelLoader();
  const bot = useBotState({ includeChatError: true });

  useEffect(() => {
    void openConversation(id && id !== 'new' ? id : null);
  }, [id, openConversation]);

  // Opening (or switching) a conversation always starts pinned to the latest message.
  useEffect(() => {
    nearBottom.current = true;
  }, [id]);

  // A pending quote belongs to the conversation it was picked in: reset it when
  // the route id changes. Done during render (React's recommended state-reset
  // pattern) instead of an effect, so no cascading commit is triggered.
  const [quoteOwnerId, setQuoteOwnerId] = useState(id);
  if (id !== quoteOwnerId) {
    setQuoteOwnerId(id);
    setQuotedId(null);
  }

  // Deep link from global search: once the target message exists, jump to it and flash it.
  useEffect(() => {
    const target = pendingJump.current;
    if (!target) return;
    const index = messages.findIndex((m) => m.id === target);
    if (index < 0) return;
    pendingJump.current = null;
    nearBottom.current = false; // the jump wins over auto-scroll-to-end
    const jump = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
    }, 80);
    setHighlightId(target);
    const clear = setTimeout(() => setHighlightId(null), 2200);
    return () => {
      clearTimeout(jump);
      clearTimeout(clear);
    };
  }, [messages]);

  // When the selected model finishes downloading while we wait here, load it automatically.
  const prevStatus = useRef(selectedStatus);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = selectedStatus;
    if (was === 'downloading' && selectedStatus === 'downloaded' && selectedModelId && useLlmStore.getState().status !== 'loading') {
      haptic.success();
      void loadWithChecks(selectedModelId);
    }
  }, [selectedStatus, selectedModelId, loadWithChecks]);

  // Smart reply choices + rolling summary: when a turn finishes (send,
  // regenerate, edit or a manual stop), refresh the summarizing memory when
  // due and prepare fresh suggestions for the newest reply. Merely opening or
  // switching a conversation never touches the engine.
  const prevGenerating = useRef(false);
  useEffect(() => {
    const was = prevGenerating.current;
    prevGenerating.current = generating;
    if (was && !generating) void useChatStore.getState().runPostTurn();
  }, [generating]);

  const currentConv = conversations.find((c) => c.id === currentId);
  const title = currentConv?.title ?? t('conversations.newChat');
  // The banner shows the conversation's pinned message, resolved against the
  // loaded list; a dangling pin (hand-edited backup) simply stays hidden.
  const pinnedMessage = currentConv?.pinnedMessageId
    ? (messages.find((m) => m.id === currentConv.pinnedMessageId) ?? null)
    : null;
  // Quote resolution for both the composer banner and the bubbles: a deleted
  // quoted message drops the banner by itself instead of leaving a dead pill.
  const quotedMessage = quotedId ? (messages.find((m) => m.id === quotedId) ?? null) : null;
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  // The composer refuses sends while an agent session is active on this screen.
  const agentBusy = !!agentSession && ['planning', 'awaiting-plan', 'running'].includes(agentSession.status);
  const agentShownHere = !!agentSession && agentSession.conversationId === currentId;

  const onSend = async () => {
    const text = draft.trim();
    if (!text || generating || agentBusy) return;
    haptic.medium();
    setDraft('');
    // The quote is consumed with the send; the new bubble carries the reference.
    setQuotedId(null);
    // Agent mode: the goal lands as a normal message and the agent store owns
    // the turn (plan card → confirmations → final answer bubble).
    if (agentMode) {
      try {
        await useAgentStore.getState().startGoal(text, sendOptions(t, loadedModelId, quotedMessage?.id));
      } catch (e) {
        const code = e instanceof Error ? e.message : String(e);
        notify(t('agent.mode'), code === 'NO_MODEL' ? t('agent.noModel') : t('agent.busy'), t('common.ok'));
      }
      return;
    }
    await sendMessage(text, sendOptions(t, loadedModelId, quotedMessage?.id));
  };

  const onRegenerate = useCallback(() => {
    if (generating) return;
    haptic.medium();
    void regenerate(sendOptions(t, loadedModelId));
  }, [generating, regenerate, t, loadedModelId]);

  // Inline edit of a user message: keeps the draft inside the bubble, and on
  // submit the store truncates the later turns and answers the new text again.
  const startEdit = useCallback((message: ChatMessage) => {
    setEditingId(message.id);
  }, []);
  const cancelEdit = useCallback(() => setEditingId(null), []);
  const submitEdit = useCallback(
    (messageId: string, text: string) => {
      if (generating || !text.trim()) return;
      haptic.medium();
      setEditingId(null);
      void editUserMessage(messageId, text, sendOptions(t, loadedModelId));
    },
    [generating, editUserMessage, t, loadedModelId],
  );

  // Stable speak toggle (reads from the store, so it never goes stale).
  const toggleSpeech = useCallback((message: ChatMessage) => {
    haptic.light();
    useTtsStore.getState().toggle(message.id, shownContent(message));
  }, []);

  // Stable copy handler for the quick row under assistant replies. Reads the
  // previewed draft so copying follows what is actually on screen.
  const copyMessage = useCallback((message: ChatMessage) => {
    void copyMessageText(shownContent(message).trim()).then((ok) => ok && haptic.success());
  }, []);

  const openMessageActions = useCallback(
    (message: ChatMessage) => {
      const text = shownContent(message).trim();
      if (!text) return;
      haptic.light();
      const cs = useChatStore.getState();
      const busy = cs.generating;
      const isPinned = cs.conversations.find((c) => c.id === message.conversationId)?.pinnedMessageId === message.id;
      const canEdit = message.role === 'user' && !busy;
      const editNow = () => {
        haptic.light();
        startEdit(message);
      };
      showDialog({
        title: t('chat.messageOptions'),
        actions: [
          {
            // Quoting pre-fills the composer banner: the next send references this
            // message. Works for both roles, while the composer is free.
            label: t('chat.quote'),
            icon: dialogIcons.quote,
            tone: 'accent' as const,
            onPress: () => {
              haptic.light();
              setQuotedId(message.id);
            },
          },
          ...(canEdit
            ? [
                {
                  label: t('chat.editMessage'),
                  icon: dialogIcons.pencil,
                  tone: 'primary' as const,
                  onPress: () => {
                    // Editing rewrites history: warn once when later turns would be deleted.
                    const msgs = useChatStore.getState().messages;
                    const idx = msgs.findIndex((m) => m.id === message.id);
                    if (idx >= 0 && idx < msgs.length - 1) {
                      void confirmDialog({
                        title: t('chat.editMessage'),
                        message: t('chat.editWarning'),
                        confirmLabel: t('chat.editResend'),
                        cancelLabel: t('common.cancel'),
                      }).then((ok) => {
                        if (ok) editNow();
                      });
                    } else {
                      editNow();
                    }
                  },
                },
              ]
            : []),
          ...(message.role === 'user'
            ? [
                {
                  label: t('chat.saveAsPrompt'),
                  icon: dialogIcons.sparkles,
                  tone: 'success' as const,
                  onPress: () => {
                    haptic.light();
                    setPromptSeed({ body: text });
                    setPromptsOpen(true);
                  },
                },
              ]
            : []),
          {
            label: t('chat.copyMessage'),
            icon: dialogIcons.copy,
            tone: 'primary' as const,
            onPress: () => {
              void copyMessageText(text).then((ok) => ok && haptic.success());
            },
          },
          { label: t('chat.shareMessage'), icon: dialogIcons.share, tone: 'primary' as const, onPress: () => void shareMessageText(text) },
          {
            label: t(isPinned ? 'chat.unpinMessage' : 'chat.pinMessage'),
            icon: isPinned ? dialogIcons.unpin : dialogIcons.pin,
            tone: 'accent' as const,
            onPress: () => {
              haptic.light();
              void useChatStore.getState().setMessagePin(message.conversationId, isPinned ? null : message.id);
            },
          },
          ...(message.role === 'assistant'
            ? [{ label: t('chat.speak'), icon: dialogIcons.speaker, tone: 'accent' as const, onPress: () => toggleSpeech(message) }]
            : []),
          ...(busy
            ? []
            : [
                {
                  label: t('chat.deleteMessage'),
                  icon: dialogIcons.trash,
                  destructive: true,
                  onPress: () => {
                    void confirmDialog({
                      title: t('chat.deleteTitle'),
                      message: t('chat.deleteBody'),
                      confirmLabel: t('common.delete'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    }).then((ok) => {
                      if (ok) void useChatStore.getState().deleteMessage(message.id);
                    });
                  },
                },
              ]),
          { label: t('common.cancel'), cancel: true },
        ],
      });
    },
    [t, toggleSpeech, startEdit],
  );

  // Export the whole conversation as Markdown or PDF via the system share sheet.
  // Reads the store directly, so the callback stays stable during streaming.
  const onExport = useCallback(() => {
    const state = useChatStore.getState();
    if (state.messages.length === 0) return;
    haptic.light();
    const fallbackTitle = state.conversations.find((c) => c.id === state.currentId)?.title ?? t('conversations.newChat');
    const formatDate = (ms: number) => {
      try {
        return new Date(ms).toLocaleString(i18n.language === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
      } catch {
        return new Date(ms).toISOString();
      }
    };
    const labels = { user: t('chat.exportYou'), assistant: t('chat.exportRafeeq') };
    const exportPdf = async () => {
      const html = buildConversationHtml(fallbackTitle, state.messages, formatDate, labels, i18n.language);
      const uri = await renderConversationPdf(html);
      const shared = await shareConversationPdf(uri);
      if (shared) haptic.success();
    };
    showDialog({
      title: t('chat.exportConversation'),
      actions: [
        {
          label: t('chat.exportMarkdown'),
          icon: dialogIcons.fileText,
          tone: 'primary',
          onPress: () => void shareConversationText(buildConversationMarkdown(fallbackTitle, state.messages, formatDate, labels)),
        },
        { label: t('chat.exportPdf'), icon: dialogIcons.fileDown, tone: 'accent', onPress: () => void exportPdf() },
        { label: t('common.cancel'), cancel: true },
      ],
    });
  }, [t, i18n]);

  // Focus mode target: the newest non-empty assistant reply (live while streaming).
  const focus = focusTarget(messages);
  // Regenerate is one tap away only while the engine is free; the per-message
  // gates (newest reply, final text, not editing) live in quickActionsFor.
  const allowRegenerate = !generating && llmStatus === 'ready';
  // While an inline edit is open, the composer steps aside: sending a new turn
  // underneath an unfinished edit would silently become a victim of the truncation.
  // The edit only counts while its message is still on screen, so switching to a
  // different conversation never leaves the composer disabled.
  const editing = editingId !== null && messages.some((m) => m.id === editingId);
  const canSend = llmStatus === 'ready' && draft.trim().length > 0 && !generating && !editing && !agentBusy;
  const homeSuggestions = t('home.suggestions', { returnObjects: true }) as unknown;
  const chips = Array.isArray(homeSuggestions) ? (homeSuggestions as string[]).slice(0, 3) : [];

  // Smart reply choices for the newest assistant reply, resolved once per render.
  const newest = messages.length > 0 ? messages[messages.length - 1] : null;
  const suggestState = suggestionsUiState({
    engineReady: llmStatus === 'ready',
    generating,
    editing,
    suggesting,
    suggestions,
    newestId: newest?.id ?? null,
    newestRole: newest?.role ?? null,
    newestContent: newest?.content ?? '',
  });
  const applySuggestion = (text: string) => {
    haptic.light();
    setDraft((d) => insertPromptIntoDraft(d, text));
  };
  const refreshSuggestions = () => {
    haptic.light();
    void useChatStore.getState().refreshSuggestions();
  };
  const hideSuggestions = () => {
    haptic.light();
    void useChatStore.getState().clearSuggestions();
  };

  // Alternate-drafts switcher state for the newest reply (hidden/loading/ready).
  const variantMode = variantsUiState({
    engineReady: llmStatus === 'ready',
    generating,
    editing,
    variantsBusy,
    variants,
    newestId: newest?.id ?? null,
    newestRole: newest?.role ?? null,
    newestContent: newest?.content ?? '',
  });

  // ----- Alternate drafts switcher ----------------------------------------
  // The drafts live under the newest reply; these handlers read the store
  // directly so they never go stale while the FlatList recycles rows.
  const onVariantsPrepare = useCallback(async () => {
    haptic.light();
    await useChatStore.getState().prepareVariants(sendOptions(t, loadedModelId));
    if (!useChatStore.getState().variants) notify(t('chat.variantsTitle'), t('chat.variantsFailed'), t('common.ok'));
  }, [t, loadedModelId]);
  const onVariantPrev = useCallback(() => {
    haptic.light();
    useChatStore.getState().cycleVariant(-1);
  }, []);
  const onVariantNext = useCallback(() => {
    haptic.light();
    useChatStore.getState().cycleVariant(1);
  }, []);
  const onVariantKeep = useCallback(() => {
    haptic.success();
    void useChatStore.getState().keepVariant();
  }, []);
  const onVariantDismiss = useCallback(() => {
    haptic.light();
    void useChatStore.getState().dismissVariants();
  }, []);

  const onMicPress = () => {
    haptic.light();
    void voiceToggle({ id: voiceModelId, path: voicePath, language: voiceLanguage });
  };

  const openPrompts = useCallback(() => {
    haptic.light();
    setPromptSeed(null);
    setPromptsOpen(true);
  }, []);

  const openDetails = useCallback(() => {
    haptic.light();
    setDetailsOpen(true);
  }, []);

  // A saved prompt was picked: close the sheet and drop the text into the
  // composer (appended on its own line below whatever is already there).
  const insertPrompt = useCallback((body: string) => {
    setPromptsOpen(false);
    setDraft((d) => insertPromptIntoDraft(d, body));
  }, []);

  // ----- In-conversation search -------------------------------------------
  const matches = useMemo(() => (searchOpen ? findMessageMatches(messages, query) : []), [searchOpen, messages, query]);
  // Streaming appends can shrink the list between renders: clamp instead of chasing it in an effect.
  const matchIndex = matches.length > 0 ? Math.min(activeMatch, matches.length - 1) : 0;

  const jumpToMessage = useCallback((messageId: string) => {
    const index = useChatStore.getState().messages.findIndex((m) => m.id === messageId);
    if (index < 0) return;
    nearBottom.current = false; // the jump wins over auto-scroll-to-end
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    setSearchMatchId(messageId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setSearchMatchId(null), 2200);
  }, []);

  // Banner ✕: clears the conversation's pinned message (store and repository).
  const unpinCurrent = useCallback(() => {
    const cid = useChatStore.getState().currentId;
    if (!cid) return;
    haptic.light();
    void useChatStore.getState().setMessagePin(cid, null);
  }, []);

  const openSearch = useCallback(() => {
    haptic.light();
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
    setActiveMatch(0);
    setSearchMatchId(null);
  }, []);

  const onSearchQuery = (text: string) => {
    setQuery(text);
    setActiveMatch(0);
    const first = findMessageMatches(messages, text)[0];
    if (first) jumpToMessage(first);
    else setSearchMatchId(null);
  };

  // Typing keeps the keyboard up; explicit navigation closes it so the match is visible.
  const goMatch = (step: 1 | -1) => {
    if (matches.length === 0) return;
    Keyboard.dismiss();
    const next = (matchIndex + step + matches.length) % matches.length;
    setActiveMatch(next);
    jumpToMessage(matches[next]);
  };

  // Leaving the chat screen always silences playback and frees the engine
  // from every background pass, and clears the search timer.
  useEffect(() => {
    return () => {
      void useTtsStore.getState().stop();
      void useChatStore.getState().cancelBackgroundPasses();
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  // Voice sessions report through the store; a subscription (not an effect body)
  // handles outcomes so manual stops and the auto-stop timeout reach the UI the
  // same way, and alerts/draft updates never run synchronously during render.
  useEffect(() => {
    return useVoiceStore.subscribe((state) => {
      if (state.status !== 'idle') return;
      const error = state.error;
      if (error) {
        if (error === 'NO_VOICE_MODEL') {
          const missingId = useSettingsStore.getState().selectedVoiceModelId ?? VOICE_MODEL_ID;
          showDialog({
            title: t('voice.needModelTitle'),
            message: t('voice.needModelBody', { size: formatBytes(useModelStore.getState().getModel(missingId)?.sizeBytes ?? 0) }),
            actions: [
              { label: t('common.cancel'), cancel: true },
              { label: t('voice.goDownload'), icon: dialogIcons.download, tone: 'accent', onPress: () => router.push('/models') },
            ],
          });
        } else {
          const msg =
            error === 'PERMISSION_DENIED'
              ? t('voice.permissionDenied')
              : error === 'TOO_SHORT'
                ? t('voice.tooShort')
                : error === 'EMPTY'
                  ? t('voice.empty')
                  : t('voice.failed');
          notify(t('chat.voiceInput'), msg, t('common.ok'));
        }
        useVoiceStore.getState().consume();
        return;
      }
      const text = state.result;
      if (text) {
        haptic.success();
        setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text));
        useVoiceStore.getState().consume();
      }
    });
  }, [t, router]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
          <GlassSurface style={styles.iconBtn} radiusSize={radius.pill}>
            <BackChevron color={colors.text} />
          </GlassSurface>
        </PressableScale>
        <Text style={[type.headline, styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {messages.length > 0 ? (
          <View style={styles.headerActions}>
            {focus ? (
              <PressableScale
                onPress={() => {
                  haptic.light();
                  setFocusOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.focusEnter')}
                hitSlop={10}
              >
                <GlassSurface style={styles.iconBtn} radiusSize={radius.pill}>
                  {dialogIcons.maximize(colors.text, 20)}
                </GlassSurface>
              </PressableScale>
            ) : null}
            <PressableScale onPress={openSearch} accessibilityRole="button" accessibilityLabel={t('chat.searchInChat')} hitSlop={10}>
              <GlassSurface style={styles.iconBtn} radiusSize={radius.pill}>
                <SearchIcon color={colors.text} />
              </GlassSurface>
            </PressableScale>
            <PressableScale onPress={openDetails} accessibilityRole="button" accessibilityLabel={t('chat.details')} hitSlop={10}>
              <GlassSurface style={styles.iconBtn} radiusSize={radius.pill}>
                <InfoIcon color={colors.text} />
              </GlassSurface>
            </PressableScale>
            <PressableScale onPress={onExport} accessibilityRole="button" accessibilityLabel={t('chat.exportConversation')} hitSlop={10}>
              <GlassSurface style={styles.iconBtn} radiusSize={radius.pill}>
                <ShareIcon color={colors.text} />
              </GlassSurface>
            </PressableScale>
          </View>
        ) : null}
      </View>
      {searchOpen ? (
        <View style={styles.searchBarWrap}>
          <GlassSurface strong radiusSize={radius.xl} style={styles.searchBar}>
            <TextInput
              value={query}
              onChangeText={onSearchQuery}
              placeholder={t('chat.searchPlaceholder')}
              placeholderTextColor={colors.textFaint}
              autoFocus
              returnKeyType="search"
              maxLength={200}
              style={[type.body, styles.searchInput, { color: colors.text }]}
            />
            {query.length > 0 ? (
              <Text style={[type.caption, styles.searchCount, { color: colors.textMuted }]}>
                {matches.length > 0
                  ? t('chat.searchPosition', { index: matchIndex + 1, total: matches.length })
                  : t('chat.searchNoMatches')}
              </Text>
            ) : null}
            <PressableScale
              onPress={() => goMatch(-1)}
              disabled={matches.length === 0}
              accessibilityRole="button"
              accessibilityLabel={t('chat.searchPrev')}
              accessibilityState={{ disabled: matches.length === 0 }}
              style={styles.searchNav}
            >
              <ChevronUpIcon color={matches.length === 0 ? colors.textFaint : colors.textMuted} />
            </PressableScale>
            <PressableScale
              onPress={() => goMatch(1)}
              disabled={matches.length === 0}
              accessibilityRole="button"
              accessibilityLabel={t('chat.searchNext')}
              accessibilityState={{ disabled: matches.length === 0 }}
              style={styles.searchNav}
            >
              <ChevronDownIcon color={matches.length === 0 ? colors.textFaint : colors.textMuted} />
            </PressableScale>
            <PressableScale onPress={closeSearch} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.searchNav}>
              <ClearGlyph color={colors.textMuted} />
            </PressableScale>
          </GlassSurface>
        </View>
      ) : null}
      <View style={styles.bars}>
        <DownloadBanner />
        <ModelBar />
        {chatError ? (
          <Pressable onPress={clearError} style={[styles.errorBanner, { borderColor: colors.danger + '66', backgroundColor: colors.danger + '14' }]}>
            <Text style={[type.callout, styles.auto, { color: colors.danger }]}>
              {chatError === 'NO_MODEL' ? t('chat.noModel') : t('chat.errorGenerate', { message: chatError })}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {pinnedMessage ? (
        <View style={styles.searchBarWrap}>
          <GlassSurface strong radiusSize={radius.xl} style={styles.pinnedBar}>
            <Pressable
              onPress={() => jumpToMessage(pinnedMessage.id)}
              accessibilityRole="button"
              accessibilityLabel={t('chat.pinnedJump')}
              style={styles.pinnedTouch}
            >
              <PinIcon color={colors.accent} />
              <View style={styles.pinnedText}>
                <Text numberOfLines={1} style={[type.caption, styles.auto, { color: colors.accent }]}>
                  {t('chat.pinnedMessage')}
                </Text>
                <Text numberOfLines={1} style={[type.callout, styles.auto, { color: colors.text }]}>
                  {pinnedMessage.content}
                </Text>
              </View>
            </Pressable>
            <PressableScale
              onPress={unpinCurrent}
              accessibilityRole="button"
              accessibilityLabel={t('chat.unpinMessage')}
              hitSlop={8}
              style={styles.searchNav}
            >
              <ClearGlyph color={colors.textMuted} />
            </PressableScale>
          </GlassSurface>
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        style={styles.flex}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(e) => {
          const { y } = e.nativeEvent.contentOffset;
          nearBottom.current = isNearBottom(y, e.nativeEvent.contentSize.height, e.nativeEvent.layoutMeasurement.height);
        }}
        onContentSizeChange={() => {
          if (nearBottom.current) listRef.current?.scrollToEnd({ animated: false });
        }}
        onScrollToIndexFailed={(info) => {
          // Variable bubble heights: retry once the target row has rendered.
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: false });
          }, 120);
        }}
        ListEmptyComponent={
          <LookArea style={styles.empty}>
            <RafeeqBot size={150} interactive state={bot.state} progress={bot.progress} />
            <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('chat.emptyChat')}</Text>
            <View style={styles.emptyChips}>
              {chips.map((c) => (
                <Chip key={c} label={c} onPress={() => setDraft(c)} />
              ))}
            </View>
          </LookArea>
        }
        renderItem={({ item, index }) => {
          const variant = item.id === variants?.forMessageId ? variants : null;
          const variantReady = !!variant && variantMode === 'ready' && variant.items.length > 1;
          return (
            <Message
              message={item}
              streaming={item.id === streamingMessageId}
              isLast={index === messages.length - 1}
              allowRegenerate={allowRegenerate}
              onRegenerate={onRegenerate}
              onMessageAction={openMessageActions}
              highlight={item.id === highlightId || item.id === searchMatchId}
              speaking={ttsStatus === 'speaking' && ttsMessageId === item.id}
              onSpeakToggle={toggleSpeech}
              onCopy={copyMessage}
              editing={item.id === editingId}
              onEditSubmit={submitEdit}
              onEditCancel={cancelEdit}
              quotedId={item.replyToId ?? null}
              quotedSnippet={item.replyToId ? (messagesById.get(item.replyToId)?.content ?? '') : undefined}
              quotedMissing={item.replyToId ? !messagesById.has(item.replyToId) : undefined}
              onQuotePress={jumpToMessage}
              variantContent={variant && variant.activeIndex > 0 ? (variant.items[variant.activeIndex] ?? null) : null}
              variantStat={variant && variant.activeIndex > 0 ? (variant.stats[variant.activeIndex] ?? null) : null}
              variantBadge={variantReady ? t('chat.variantsOf', { index: variant.activeIndex + 1, total: variant.items.length }) : null}
              variantLoadingLabel={
                variant && variantMode === 'loading' ? t('chat.variantsPreparing', { index: Math.min(variant.items.length + 1, 3) }) : null
              }
              variantActive={variantReady}
              onVariantsPrepare={suggesting ? undefined : () => void onVariantsPrepare()}
              onVariantPrev={onVariantPrev}
              onVariantNext={onVariantNext}
              onVariantKeep={onVariantKeep}
              onVariantDismiss={onVariantDismiss}
            />
          );
        }}
      />
      <View style={[styles.composerWrap, { paddingBottom: spacing.sm + insets.bottom }]}>
        {agentShownHere ? <AgentPanel /> : null}
        {agentMode && !agentSession ? (
          <GlassSurface strong radiusSize={radius.lg} style={styles.agentBar}>
            <AgentGlyph color={colors.accent} />
            <Text numberOfLines={2} style={[type.caption, styles.auto, { color: colors.text }]}>
              {t('agent.modeActive')}
            </Text>
            <PressableScale
              onPress={() => {
                haptic.light();
                useAgentStore.getState().setModeEnabled(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('agent.turnOff')}
              hitSlop={8}
              style={styles.searchNav}
            >
              <ClearGlyph color={colors.textMuted} />
            </PressableScale>
          </GlassSurface>
        ) : null}
        {agentMode && !agentSession && proactiveSuggestions.length > 0 ? (
          <Animated.View entering={FadeInUp.duration(220)}>
            <GlassSurface strong radiusSize={radius.lg} style={styles.suggestBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.suggestRow}
              >
                {proactiveSuggestions.map((s) => {
                  const label = agentLang === 'ar' ? s.ar : s.en;
                  return (
                    <PressableScale
                      key={s.id}
                      onPress={() => {
                        haptic.light();
                        setDraft(label);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      style={[styles.suggestChip, { borderColor: colors.border }]}
                    >
                      <Text numberOfLines={2} style={[type.caption, styles.auto, { color: colors.text }]}>
                        {label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>
            </GlassSurface>
          </Animated.View>
        ) : null}
        {quotedMessage ? (
          <GlassSurface strong radiusSize={radius.lg} style={styles.quoteBar}>
            <Pressable
              onPress={() => jumpToMessage(quotedMessage.id)}
              accessibilityRole="button"
              accessibilityLabel={t('chat.quotedReply')}
              style={styles.pinnedTouch}
            >
              <QuoteGlyph color={colors.accent} />
              <View style={styles.pinnedText}>
                <Text numberOfLines={1} style={[type.caption, styles.auto, { color: colors.accent }]}>
                  {t('chat.quotedReply')}
                </Text>
                <Text numberOfLines={1} style={[type.callout, styles.auto, { color: colors.text }]}>
                  {normalizeQuotedContent(quotedMessage.content)}
                </Text>
              </View>
            </Pressable>
            <PressableScale
              onPress={() => {
                haptic.light();
                setQuotedId(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              hitSlop={8}
              style={styles.searchNav}
            >
              <ClearGlyph color={colors.textMuted} />
            </PressableScale>
          </GlassSurface>
        ) : null}
        {voiceStatus === 'recording' && voiceStartedAt ? <RecordingBadge startedAt={voiceStartedAt} /> : null}
        {suggestState === 'loading' || suggestState === 'ready' ? (
          <Animated.View entering={FadeInUp.duration(220)}>
            <GlassSurface strong radiusSize={radius.lg} style={styles.suggestBar}>
              {suggestState === 'loading' ? (
                <View style={styles.suggestLoading}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={[type.caption, styles.auto, { color: colors.textMuted }]}>{t('chat.suggesting')}</Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.suggestRow}
                >
                  {(suggestions?.items ?? []).map((item, index) => (
                    <PressableScale
                      key={`${suggestions?.forMessageId ?? ''}:${index}`}
                      onPress={() => applySuggestion(item)}
                      accessibilityRole="button"
                      accessibilityLabel={item}
                      style={[styles.suggestChip, { borderColor: colors.border }]}
                    >
                      <Text numberOfLines={2} style={[type.caption, styles.auto, { color: colors.text }]}>
                        {item}
                      </Text>
                    </PressableScale>
                  ))}
                  <PressableScale
                    onPress={refreshSuggestions}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.suggestionsRefresh')}
                    hitSlop={8}
                    style={styles.suggestTool}
                  >
                    <RefreshIcon color={colors.textMuted} />
                  </PressableScale>
                  <PressableScale
                    onPress={hideSuggestions}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.suggestionsHide')}
                    hitSlop={8}
                    style={styles.suggestTool}
                  >
                    <ClearGlyph color={colors.textMuted} />
                  </PressableScale>
                </ScrollView>
              )}
            </GlassSurface>
          </Animated.View>
        ) : null}
        <GlassSurface strong radiusSize={radius.xl} style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={voiceStatus === 'transcribing' ? t('voice.transcribing') : agentMode ? t('agent.placeholder') : t('chat.placeholder')}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={8000}
            style={[type.body, styles.input, { color: colors.text }]}
          />
          {!generating ? (
            <PressableScale
              onPress={openPrompts}
              disabled={editing}
              accessibilityRole="button"
              accessibilityLabel={t('prompts.open')}
              style={[styles.micBtn, { borderColor: colors.border }]}
            >
              <BookmarkIcon color={colors.text} />
            </PressableScale>
          ) : null}
          {!generating ? (
            <PressableScale
              onPress={() => {
                haptic.light();
                useAgentStore.getState().setModeEnabled(!agentMode);
              }}
              disabled={editing}
              accessibilityRole="button"
              accessibilityLabel={t('agent.mode')}
              accessibilityState={{ selected: agentMode }}
              style={[styles.micBtn, agentMode ? { backgroundColor: colors.accent, borderColor: colors.accent } : { borderColor: colors.border }]}
            >
              <AgentGlyph color={agentMode ? colors.surfaceStrong : colors.text} />
            </PressableScale>
          ) : null}
          {!generating ? (
            <PressableScale
              onPress={onMicPress}
              disabled={editing || voiceStatus === 'loading' || voiceStatus === 'transcribing'}
              accessibilityRole="button"
              accessibilityLabel={voiceStatus === 'recording' ? t('chat.voiceStop') : t('chat.voiceInput')}
              accessibilityState={{ busy: voiceStatus !== 'idle' }}
              style={[
                styles.micBtn,
                { borderColor: colors.border },
                voiceStatus === 'recording' && { backgroundColor: colors.danger, borderColor: colors.danger },
              ]}
            >
              {voiceStatus === 'loading' || voiceStatus === 'transcribing' ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : voiceStatus === 'recording' ? (
                <StopSquareIcon />
              ) : (
                <MicIcon color={colors.text} />
              )}
            </PressableScale>
          ) : null}
          {generating ? (
            <PressableScale
              onPress={() => {
                haptic.light();
                void stopGeneration();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.stop')}
              style={[styles.sendBtn, { backgroundColor: colors.danger }]}
            >
              <SendIcon stop />
            </PressableScale>
          ) : (
            <PressableScale
              onPress={() => void onSend()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={t('chat.send')}
              accessibilityState={{ disabled: !canSend }}
              style={[styles.sendBtn, canSend && styles.sendGlow, { opacity: canSend ? 1 : 0.4, shadowColor: BRAND.cyan, backgroundColor: BRAND.to }]}
            >
              <LinearGradient colors={[BRAND.from, BRAND.to, BRAND.cyan]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              <SendIcon />
            </PressableScale>
          )}
        </GlassSurface>
      </View>
      <PromptLibraryModal
        visible={promptsOpen}
        onClose={() => setPromptsOpen(false)}
        onInsert={insertPrompt}
        editSeed={promptSeed}
      />
      <ConversationDetailsModal
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        conversation={currentConv ?? null}
        messages={messages}
      />
      <FocusOverlay
        visible={focusOpen}
        message={focus}
        generating={generating}
        onStop={() => void stopGeneration()}
        onClose={() => setFocusOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  auto: { textAlign: 'auto' },
  center: { textAlign: 'center' },
  selfStart: { alignSelf: 'flex-start' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBarWrap: { paddingHorizontal: spacing.lg },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingStart: spacing.lg, paddingEnd: 6, paddingVertical: 4, gap: spacing.xs },
  searchInput: { flex: 1, minHeight: 40, paddingVertical: 8, textAlign: 'auto' },
  searchCount: { flexShrink: 1, textAlign: 'center' },
  searchNav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pinnedBar: { flexDirection: 'row', alignItems: 'center', paddingStart: spacing.md, paddingEnd: 6, paddingVertical: spacing.xs },
  pinnedTouch: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  pinnedText: { flex: 1, gap: 1 },
  quoteBar: { flexDirection: 'row', alignItems: 'center', paddingStart: spacing.md, paddingEnd: 6, paddingVertical: spacing.xs, marginBottom: spacing.sm },
  agentBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingStart: spacing.md, paddingEnd: 6, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  quoteBlock: {
    borderStartWidth: 2.5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    gap: 2,
    marginBottom: 6,
  },
  headerTitle: { flex: 1, textAlign: 'auto' },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  bars: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  banner: { padding: spacing.md, gap: 2 },
  modelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 36 },
  modelCard: { padding: spacing.md, gap: spacing.sm },
  chipsRow: { gap: spacing.sm, paddingVertical: 2 },
  errorBanner: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  messages: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.md },
  emptyChips: { alignSelf: 'stretch', gap: spacing.sm },
  row: { flexDirection: 'row', marginBottom: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  rowUser: { justifyContent: 'flex-end' },
  rowHighlighted: { borderRadius: radius.md },
  userBubble: {
    maxWidth: '84%',
    borderRadius: radius.lg,
    borderBottomEndRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  avatar: { width: 30, height: 30, marginTop: 2 },
  assistant: { flex: 1, paddingTop: 2 },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  quickRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  variantBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingStart: 4,
    paddingEnd: 6,
    paddingVertical: 3,
  },
  variantNav: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  variantBadge: { minWidth: 30, textAlign: 'center', fontVariant: ['tabular-nums'] },
  variantKeep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginStart: 4,
  },
  variantLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4, paddingHorizontal: 6 },
  quickBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editWrap: { maxWidth: '84%', gap: spacing.xs },
  editCard: { padding: spacing.md },
  editInput: { minHeight: 60, maxHeight: 160, padding: 0, textAlign: 'auto' },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  caret: { width: 8, height: 16, borderRadius: 2, backgroundColor: BRAND.cyan, marginTop: 4 },
  composerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingStart: spacing.lg, paddingEnd: 6, paddingVertical: 6, gap: spacing.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 140, paddingVertical: 9, textAlign: 'auto' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  sendGlow: { elevation: 8, shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  micBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  suggestBar: { paddingStart: spacing.sm, paddingEnd: 6, paddingVertical: 6, marginBottom: spacing.sm },
  suggestRow: { alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  suggestChip: {
    maxWidth: 260,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  suggestTool: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  suggestLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, paddingHorizontal: spacing.sm },
});
