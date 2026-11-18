// Copyright (c) 2026 DRS AI. All rights reserved.
import Constants from 'expo-constants';
import { reloadAppAsync } from 'expo';
import { useRouter, useFocusEffect } from 'expo-router';
import { Storage } from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { RafeeqFastDl } from '../../../modules/rafeeq-fastdl';
import { syncBriefingReminder } from '../../agent/briefingReminder';
import { useMemoryStore } from '../../agent/memory';
import { dialogIcons } from '../../components/DialogIcons';
import { Button, Card, ScreenHeader, Segmented, SectionTitle, Stepper } from '../../components/ui';
import { useTabBarSpace } from '../../hooks/useTabBarSpace';
import { useBiometricSupport } from '../../hooks/useBiometric';
import { applyLayoutDirection, initI18n, RTL_RELOAD_KEY } from '../../i18n';
import { formatTimeKey, parseTimeKey } from '../../utils/reminderSchedule';
import { readPickedBackup, shareBackupFile, writeBackupFile } from '../../utils/backupFiles';
import { nativeBackupReminderIO } from '../../utils/backupReminderNative';
import { backupReminderPlan, syncBackupReminder } from '../../utils/backupSchedule';
import { haptic } from '../../utils/haptics';
import { getChatRepository, useChatStore } from '../../store/chatStore';
import { useModelStore } from '../../store/modelStore';
import { notify, showDialog } from '../../store/dialogStore';
import type { ChatStats } from '../../db/repository';
import { usePinLockStore } from '../../store/pinLockStore';
import {
  CONTEXT_SIZES,
  DOWNLOAD_CONNECTIONS_MAX,
  DOWNLOAD_CONNECTIONS_MIN,
  MAX_TOKEN_OPTIONS,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
  useSettingsStore,
} from '../../store/settingsStore';
import { radius, spacing, type, useAppTheme } from '../../theme';
import { averageMessagesPerConversation, averageTokensPerReply } from '../../utils/stats';
import type { Language } from '../../types';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const bottom = useTabBarSpace();
  const { colors } = useAppTheme();
  const s = useSettingsStore();
  const router = useRouter();
  const pinLockEnabled = usePinLockStore((st) => st.enabled);
  const biometricEnabled = usePinLockStore((st) => st.biometricEnabled);
  const setBiometricEnabled = usePinLockStore((st) => st.setBiometricEnabled);
  const biometricSupported = useBiometricSupport();
  const autoLockMinutes = usePinLockStore((st) => st.autoLockMinutes);
  const setAutoLockMinutes = usePinLockStore((st) => st.setAutoLockMinutes);
  // Local-usage totals for the data card; read once per mount, refreshed on back.
  const [stats, setStats] = useState<ChatStats | null>(null);

  // Model storage state ("All files access" grant + active root). Lazy requires
  // keep expo-file-system and the native module out of module init (and tests).
  const [storageState, setStorageState] = useState<{ supported: boolean; granted: boolean; root: 'public' | 'internal' } | null>(null);
  const refreshStorage = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('../../models/publicStorage') as typeof import('../../models/publicStorage');
    const st = await storage.refreshStatus().catch(() => null);
    if (!st) return;
    setStorageState({ supported: st.supported, granted: st.granted, root: st.root });
    // The user may have just flipped the Android grant in Settings: switching
    // the root (and migrating existing files) applies it immediately.
    if (st.supported && st.granted && st.root === 'internal' && useSettingsStore.getState().publicModels) {
      await useModelStore.getState().reinitStorage();
      const st2 = await storage.refreshStatus().catch(() => null);
      if (st2) setStorageState({ supported: st2.supported, granted: st2.granted, root: st2.root });
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void refreshStorage();
    }, [refreshStorage]),
  );

  const onPublicModelsChange = async (value: boolean) => {
    haptic.tap();
    s.setPublicModels(value);
    if (value && !storageState?.granted) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { openAllFilesAccessSettings } = require('../../models/publicStorage') as typeof import('../../models/publicStorage');
      await openAllFilesAccessSettings();
    }
    // Applies the new root right away (or after the user returns from Settings).
    await useModelStore.getState().reinitStorage();
    void refreshStorage();
  };

  useEffect(() => {
    let alive = true;
    getChatRepository()
      .getStats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The morning briefing rides one repeating DAILY trigger: every change (or
  // visit) re-syncs it — cancel the old id, schedule the new time — so the
  // schedule never stacks, and a denied permission surfaces once, politely.
  const briefingTime = parseTimeKey(s.briefingTime) ?? { hour: 7, minute: 0 };
  const syncBriefing = async () => {
    const st = useSettingsStore.getState();
    const { id } = await syncBriefingReminder(st.briefingEnabled, st.briefingTime, st.briefingReminderId);
    useSettingsStore.getState().setBriefingSchedule(id);
    if (st.briefingEnabled && id === null) notify(t('settings.briefingSwitch'), t('settings.reminderDenied'), t('common.ok'));
  };
  const toggleBriefing = (value: boolean) => {
    s.setBriefingEnabled(value);
    void syncBriefing();
  };
  const changeBriefingTime = (hour: number, minute: number) => {
    s.setBriefingTime(formatTimeKey(hour, minute));
    if (s.briefingEnabled) void syncBriefing();
  };
  const memoryCount = useMemoryStore((st) => st.memories.length);

  const rerunOnboarding = () => {
    showDialog({
      title: t('settings.rerunTitle'),
      message: t('settings.rerunBody'),
      actions: [
        {
          label: t('settings.rerunOnboarding'),
          icon: dialogIcons.restart,
          tone: 'primary',
          onPress: () => {
            // The wizard restarts, but nothing is wiped: the profile stays
            // for pre-filling and every chat/model/setting stays untouched.
            useSettingsStore.getState().resetOnboarding();
          },
        },
        { label: t('common.cancel'), icon: dialogIcons.close, tone: 'neutral' },
      ],
    });
  };

  // The monthly backup reminder rides one one-shot at a time: every visit to
  // this screen syncs it (a month past the last full export, cooldown week
  // between nudges), and a fresh full export retires whatever was scheduled.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const st = useSettingsStore.getState();
      const { id } = await syncBackupReminder(st.backupReminder, {
        now: Date.now(),
        lastBackupAt: st.lastBackupAt,
        remindedAt: st.backupRemindedAt,
      }, nativeBackupReminderIO);
      if (!alive || id === null) return;
      const fresh = useSettingsStore.getState();
      if (fresh.backupReminderId && fresh.backupReminderId !== id) {
        try {
          await nativeBackupReminderIO.cancel?.(fresh.backupReminderId);
        } catch {
          // A stale id that no longer exists is not a failure.
        }
      }
      useSettingsStore.getState().setBackupReminderSchedule(id, Date.now());
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The morning briefing syncs once per visit (settings-driven schedule).
  useEffect(() => {
    void syncBriefing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeLanguage = (lang: Language) => {
    if (lang === s.language) return;
    s.setLanguage(lang);
    initI18n(lang);
    if (applyLayoutDirection(lang)) {
      Storage.setItemSync(RTL_RELOAD_KEY, lang);
      showDialog({
        title: t('settings.restartTitle'),
        message: t('settings.restartBody'),
        actions: [
          {
            label: t('settings.restartNow'),
            icon: dialogIcons.restart,
            tone: 'primary',
            onPress: () => void reloadAppAsync('language changed'),
          },
        ],
      });
    }
  };

  const onExportBackup = async () => {
    haptic.light();
    const json = await useChatStore.getState().exportBackup();
    if (!json) {
      notify(t('settings.backupFailedTitle'), t('settings.backupFailedBody'), t('common.ok'));
      return;
    }
    try {
      const uri = await writeBackupFile(json);
      const shared = await shareBackupFile(uri);
      if (shared) haptic.success();
    } catch {
      notify(t('settings.backupFailedTitle'), t('settings.backupFailedBody'), t('common.ok'));
    }
  };

  /** Same flow as the regular export, but the file carries the whole state. */
  const onExportFullBackup = async () => {
    haptic.light();
    const json = await useChatStore.getState().exportFullBackup();
    if (!json) {
      notify(t('settings.backupFailedTitle'), t('settings.backupFailedBody'), t('common.ok'));
      return;
    }
    try {
      const uri = await writeBackupFile(json, Date.now(), 'full');
      // A fresh full export restarts the monthly clock and retires the nudge.
      const pendingId = useSettingsStore.getState().backupReminderId;
      if (pendingId) {
        try {
          await nativeBackupReminderIO.cancel?.(pendingId);
        } catch {
          // A stale id that no longer exists is not a failure.
        }
      }
      useSettingsStore.getState().markFullBackup(Date.now());
      const shared = await shareBackupFile(uri);
      if (shared) haptic.success();
    } catch {
      notify(t('settings.backupFailedTitle'), t('settings.backupFailedBody'), t('common.ok'));
    }
  };

  const onImportBackup = async () => {
    haptic.light();
    const json = await readPickedBackup();
    if (json === null) return; // canceled or unreadable pick
    const summary = await useChatStore.getState().importBackup(json);
    if (!summary) {
      notify(t('settings.importInvalidTitle'), t('settings.importInvalidBody'), t('common.ok'));
      return;
    }
    haptic.success();
    const doneBody = t('settings.importDoneBody', {
      conversations: summary.addedConversations,
      messages: summary.addedMessages,
      skipped: summary.skippedConversations,
    });
    const doneLines = [doneBody];
    if (summary.addedTrashed > 0) doneLines.push(t('settings.importDoneTrashed', { count: summary.addedTrashed }));
    if (summary.settingsApplied) doneLines.push(t('settings.importDoneSettings'));
    if (summary.customModelsAdded > 0) doneLines.push(t('settings.importDoneModels', { count: summary.customModelsAdded }));
    if (summary.promptsAdded > 0) doneLines.push(t('settings.importDonePrompts', { count: summary.promptsAdded }));
    notify(t('settings.importDoneTitle'), doneLines.join('\n'), t('common.ok'));
  };

  const version = Constants.expoConfig?.version ?? '0.4.0';
  const fastAvailable = RafeeqFastDl !== null;
  // The monthly-backup verdict reads once per visit (and per stamp change);
  // the reminder sync itself runs in the mount effect above.
  const backupPlan = useMemo(
    () =>
      backupReminderPlan({
        // eslint-disable-next-line react-hooks/purity -- the clock is read once per visit, like the usage chart's span
        now: Date.now(),
        lastBackupAt: s.lastBackupAt,
        remindedAt: s.backupRemindedAt,
      }),
    [s.lastBackupAt, s.backupRemindedAt],
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottom }} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />
      <View style={styles.content}>
      <SectionTitle>{t('settings.setup')}</SectionTitle>
      <Card>
        <Button title={t('settings.permissionsCenter')} variant="secondary" onPress={() => router.push('/permissions')} />
        <Button title={t('settings.myGoals')} variant="secondary" onPress={() => router.push('/profile')} />
        <Button title={t('settings.rerunOnboarding')} variant="ghost" onPress={rerunOnboarding} />
      </Card>

      <SectionTitle>{t('settings.language')}</SectionTitle>
      <Segmented<Language>
        value={s.language}
        onChange={changeLanguage}
        options={[
          { value: 'ar', label: t('settings.arabic') },
          { value: 'en', label: t('settings.english') },
        ]}
      />

      <SectionTitle>{t('settings.theme')}</SectionTitle>
      <Card>
        <Text style={[styles.label, { color: colors.text }]}>{t('appearance.entryTitle')}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('appearance.entryHint')}</Text>
        <View style={styles.sectionActions}>
          <Button
            title={t('appearance.entryOpen')}
            variant="primary"
            compact
            onPress={() => {
              haptic.tap();
              router.push('/appearance');
            }}
          />
        </View>
      </Card>

      <SectionTitle>{t('settings.generation')}</SectionTitle>
      <Card>
        <Text style={[styles.label, { color: colors.text }]}>{t('settings.systemPrompt')}</Text>
        <TextInput
          value={s.systemPrompt}
          onChangeText={s.setSystemPrompt}
          placeholder={t('settings.systemPromptDefault')}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          style={[styles.prompt, { color: colors.text, borderColor: colors.border, backgroundColor: colors.input }]}
        />
        {s.systemPrompt ? (
          <View style={styles.row}>
            <Button title={t('settings.resetPrompt')} compact variant="ghost" onPress={() => s.setSystemPrompt('')} />
          </View>
        ) : null}

        <View style={styles.settingRow}>
          <Text style={[styles.label, { color: colors.text }]}>{t('settings.temperature')}</Text>
          <Stepper
            value={s.temperature}
            onChange={s.setTemperature}
            step={0.1}
            min={TEMPERATURE_MIN}
            max={TEMPERATURE_MAX}
            format={(v) => v.toFixed(1)}
          />
        </View>

        <Text style={[styles.label, styles.spaced, { color: colors.text }]}>{t('settings.contextSize')}</Text>
        <Segmented<number>
          value={s.contextSize}
          onChange={s.setContextSize}
          options={CONTEXT_SIZES.map((n) => ({ value: n, label: String(n) }))}
        />
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.contextHint')}</Text>

        <Text style={[styles.label, styles.spaced, { color: colors.text }]}>{t('settings.maxTokens')}</Text>
        <Segmented<number>
          value={s.maxTokens}
          onChange={s.setMaxTokens}
          options={MAX_TOKEN_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
        />
        <View style={[styles.settingRow, styles.spaced]}>
          <View style={styles.switchText}>
            <Text style={[styles.label, { color: colors.text }]}>{t('settings.autoSummary')}</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.autoSummaryHint')}</Text>
          </View>
          <Switch
            value={s.autoSummary}
            onValueChange={s.setAutoSummary}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
            accessibilityLabel={t('settings.autoSummary')}
          />
        </View>
      </Card>

      <SectionTitle>{t('settings.speech')}</SectionTitle>
      <Card>
        <View style={styles.settingRow}>
          <View style={styles.switchText}>
            <Text style={[styles.label, { color: colors.text }]}>{t('settings.autoSpeak')}</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.autoSpeakHint')}</Text>
          </View>
          <Switch
            value={s.autoSpeak}
            onValueChange={s.setAutoSpeak}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
            accessibilityLabel={t('settings.autoSpeak')}
          />
        </View>
        <Text style={[styles.label, styles.spaced, { color: colors.text }]}>{t('settings.chatFontSize')}</Text>
        <Segmented<number>
          value={s.chatFontScale}
          onChange={s.setChatFontScale}
          options={[
            { value: 0.9, label: t('settings.fontSmall') },
            { value: 1, label: t('settings.fontDefault') },
            { value: 1.15, label: t('settings.fontLarge') },
            { value: 1.3, label: t('settings.fontLarger') },
          ]}
        />
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.chatFontSizeHint')}</Text>
      </Card>

      <SectionTitle>{t('settings.downloads')}</SectionTitle>
      <Card>
        <View style={[styles.settingRow, styles.noTop]}>
          <View style={styles.switchText}>
            <Text style={[styles.label, { color: colors.text }]}>{t('settings.fastDownload')}</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {fastAvailable ? t('settings.fastDownloadHint') : t('settings.fastDownloadUnavailable')}
            </Text>
          </View>
          <Switch
            value={s.fastDownload && fastAvailable}
            onValueChange={s.setFastDownload}
            disabled={!fastAvailable}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
            accessibilityLabel={t('settings.fastDownload')}
          />
        </View>
        {s.fastDownload && fastAvailable ? (
          <>
            <View style={styles.settingRow}>
              <Text style={[styles.label, { color: colors.text }]}>{t('settings.connections')}</Text>
              <Stepper
                value={s.downloadConnections}
                onChange={s.setDownloadConnections}
                step={1}
                min={DOWNLOAD_CONNECTIONS_MIN}
                max={DOWNLOAD_CONNECTIONS_MAX}
                format={(v) => String(Math.round(v))}
              />
            </View>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.connectionsHint')}</Text>
          </>
        ) : null}
        {storageState?.supported ? (
          <View style={[styles.settingRow, styles.spaced]}>
            <View style={styles.switchText}>
              <Text style={[styles.label, { color: colors.text }]}>{t('settings.publicModels')}</Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {storageState.granted && s.publicModels
                  ? t('settings.publicModelsOn')
                  : storageState.granted && !s.publicModels
                    ? t('settings.publicModelsOff')
                    : t('settings.publicModelsHint')}
              </Text>
            </View>
            <Switch
              value={s.publicModels}
              onValueChange={(v) => void onPublicModelsChange(v)}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('settings.publicModels')}
            />
          </View>
        ) : null}
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.updateHint')}</Text>
      </Card>

      <SectionTitle>{t('settings.security')}</SectionTitle>
      <Card>
        <View style={styles.settingRow}>
          <View style={styles.switchText}>
            <Text style={[styles.label, { color: colors.text }]}>{t('settings.appLock')}</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.appLockHint')}</Text>
          </View>
          <Switch
            value={pinLockEnabled}
            onValueChange={() => router.push('/pin-setup')}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
            accessibilityLabel={t('settings.appLock')}
          />
        </View>
        {pinLockEnabled ? (
          <View style={styles.settingRow}>
            <View style={styles.switchText}>
              <Text style={[styles.label, { color: colors.text }]}>{t('settings.biometric')}</Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {biometricSupported ? t('settings.biometricHint') : t('settings.biometricUnavailable')}
              </Text>
            </View>
            <Switch
              value={biometricEnabled && biometricSupported}
              onValueChange={setBiometricEnabled}
              disabled={!biometricSupported}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('settings.biometric')}
            />
          </View>
        ) : null}
        {pinLockEnabled ? (
          <View style={styles.spaced}>
            <Text style={[styles.label, { color: colors.text }]}>{t('settings.autoLock')}</Text>
            <Segmented<number>
              value={autoLockMinutes}
              onChange={setAutoLockMinutes}
              options={[
                { value: 0, label: t('settings.autoLockNow') },
                { value: 1, label: t('settings.autoLock1m') },
                { value: 5, label: t('settings.autoLock5m') },
              ]}
            />
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.autoLockHint')}</Text>
          </View>
        ) : null}
      </Card>

      <SectionTitle>{t('settings.data')}</SectionTitle>
      <Card>
        {stats ? (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.conversations.toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('settings.statsConversations')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.messages.toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('settings.statsMessages')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.tokens.toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('settings.statsTokens')}</Text>
            </View>
          </View>
        ) : null}
        {stats && stats.countedReplies > 0 ? (
          <View style={styles.statsInsights}>
            <Text style={[styles.hint, styles.insightLine, { color: colors.textMuted }]}>
              {t('settings.statsAvgTokens', { n: averageTokensPerReply(stats.tokens, stats.countedReplies).toLocaleString() })}
            </Text>
            <Text style={[styles.hint, styles.insightLine, { color: colors.textMuted }]}>
              {t('settings.statsAvgMessages', { n: averageMessagesPerConversation(stats.messages, stats.conversations).toLocaleString() })}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.hint, styles.noTop, { color: colors.textMuted }]}>{t('settings.dataHint')}</Text>
        <View style={styles.dataRow}>
          <Button title={t('settings.exportBackup')} compact variant="primary" onPress={() => void onExportBackup()} />
          <Button title={t('settings.importBackup')} compact variant="ghost" onPress={() => void onImportBackup()} />
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.fullExportHint')}</Text>
        <View style={[styles.row, styles.startRow]}>
          <Button title={t('settings.exportFullBackup')} compact variant="ghost" onPress={() => void onExportFullBackup()} />
        </View>
        <>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {backupPlan.daysSince === null
              ? t('settings.lastBackupNever')
              : backupPlan.daysSince === 0
                ? t('settings.lastBackupToday')
                : t('settings.lastBackupAt', { days: backupPlan.daysSince })}
          </Text>
          {backupPlan.due ? <Text style={[styles.hint, { color: colors.danger }]}>{t('settings.backupDue')}</Text> : null}
        </>
        <View style={styles.settingRow}>
          <View style={styles.switchText}>
            <Text style={[styles.label, { color: colors.text }]}>{t('settings.backupReminderSwitch')}</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.backupReminderHint')}</Text>
          </View>
          <Switch value={s.backupReminder} onValueChange={s.setBackupReminder} accessibilityLabel={t('settings.backupReminderSwitch')} />
        </View>
      </Card>

      <SectionTitle>{t('settings.lab')}</SectionTitle>
      <Card>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.labHint')}</Text>
        <View style={styles.dataRow}>
          <Button title={t('settings.measureLab')} compact variant="primary" onPress={() => router.push('/measure')} />
          <Button title={t('settings.trialDiary')} compact variant="ghost" onPress={() => router.push('/trial-diary')} />
        </View>
      </Card>

      <SectionTitle>{t('settings.agentSection')}</SectionTitle>
      <Card>
        <Text style={[styles.label, { color: colors.text }]}>{t('settings.briefing')}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.briefingHint')}</Text>
        <View style={styles.settingRow}>
          <View style={styles.switchText}>
            <Text style={[styles.label, { color: colors.text }]}>{t('settings.briefingSwitch')}</Text>
          </View>
          <Switch
            value={s.briefingEnabled}
            onValueChange={toggleBriefing}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
            accessibilityLabel={t('settings.briefingSwitch')}
          />
        </View>
        {s.briefingEnabled ? (
          <>
            <Text style={[styles.label, styles.spaced, { color: colors.text }]}>{t('settings.briefingTime')}</Text>
            <Stepper
              value={briefingTime.hour}
              onChange={(hour) => changeBriefingTime(hour, briefingTime.minute)}
              step={1}
              min={0}
              max={23}
              format={(v) => String(v).padStart(2, '0')}
            />
            <Stepper
              value={briefingTime.minute}
              onChange={(minute) => changeBriefingTime(briefingTime.hour, minute)}
              step={5}
              min={0}
              max={55}
              format={(v) => String(v).padStart(2, '0')}
            />
          </>
        ) : null}
        <View style={styles.settingRow}>
          <View style={styles.switchText}>
            <Text style={[styles.label, { color: colors.text }]}>{t('settings.suggestions')}</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.suggestionsHint')}</Text>
          </View>
          <Switch
            value={s.agentSuggestions}
            onValueChange={s.setAgentSuggestions}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
            accessibilityLabel={t('settings.suggestions')}
          />
        </View>
        <View style={styles.dataRow}>
          <Button title={t('settings.manageMemory')} compact variant="primary" onPress={() => router.push('/memory')} />
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {memoryCount > 0 ? t('settings.memorySummary', { count: memoryCount }) : t('settings.memorySummaryEmpty')}
        </Text>
      </Card>

      <SectionTitle>{t('settings.onboarding')}</SectionTitle>
      <Card>
        <Text style={[styles.hint, styles.noTop, { color: colors.textMuted }]}>{t('settings.replayHint')}</Text>
        <View style={[styles.row, styles.startRow]}>
          <Button title={t('settings.replayOnboarding')} compact variant="primary" onPress={() => s.resetOnboarding()} />
        </View>
      </Card>

      <SectionTitle>{t('settings.about')}</SectionTitle>
      <Card>
        <Text style={[styles.label, { color: colors.text }]}>
          {t('appName')} — {t('settings.version', { version })}
        </Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('tagline')}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.privacy')}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('settings.copyright')}</Text>
      </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  content: { paddingHorizontal: spacing.lg },
  label: { ...type.label, textAlign: 'auto' },
  spaced: { marginTop: spacing.lg, marginBottom: spacing.sm },
  hint: { ...type.caption, marginTop: spacing.sm, textAlign: 'auto' },
  noTop: { marginTop: 0 },
  startRow: { justifyContent: 'flex-start', marginTop: spacing.md },
  prompt: {
    ...type.callout,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 90,
    marginTop: spacing.sm,
    textAlignVertical: 'top',
    textAlign: 'auto',
  },
  row: { flexDirection: 'row', justifyContent: 'flex-end' },
  dataRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, justifyContent: 'flex-start' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statsInsights: { marginBottom: spacing.sm },
  insightLine: { marginTop: 0, marginBottom: spacing.xs },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
  },
  statValue: { ...type.bodyStrong, fontVariant: ['tabular-nums'] },
  statLabel: { ...type.caption, marginTop: 2, textAlign: 'center' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  switchText: { flex: 1, paddingEnd: spacing.md },
});
