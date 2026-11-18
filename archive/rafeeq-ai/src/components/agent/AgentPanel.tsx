// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The visible plan: goal, editable step list, live statuses, the confirmation
 * card for mutating steps, and the run/cancel controls. Everything comes from
 * the agent store; this component holds no logic of its own.
 */

import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, GlassSurface, StatusChip } from '../ui';
import { radius, spacing, type, useAppTheme } from '../../theme';
import { getAgentRegistry, useAgentStore, type AgentSessionStatus } from '../../store/agentStore';
import type { StepStatus } from '../../agent/types';
import { describeConfirmationA11y, describeStepA11y } from './a11y';

const STATUS_TONE: Record<StepStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  pending: 'neutral',
  confirming: 'warning',
  running: 'accent',
  done: 'success',
  failed: 'danger',
  skipped: 'neutral',
};

const STATUS_GLYPH: Record<StepStatus, string> = {
  pending: '○',
  confirming: '!',
  running: '◐',
  done: '✓',
  failed: '✕',
  skipped: '⤼',
};

function sessionStatusLabel(
  status: AgentSessionStatus,
  t: (k: string) => string,
): { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' } {
  switch (status) {
    case 'planning':
      return { label: t('agent.statusPlanning'), tone: 'accent' };
    case 'awaiting-plan':
      return { label: t('agent.statusAwaitingPlan'), tone: 'warning' };
    case 'running':
      return { label: t('agent.statusRunning'), tone: 'accent' };
    case 'finished':
      return { label: t('agent.statusFinished'), tone: 'success' };
    case 'failed':
      return { label: t('agent.statusFailed'), tone: 'danger' };
    case 'cancelled':
      return { label: t('agent.statusCancelled'), tone: 'neutral' };
    default:
      return { label: '', tone: 'neutral' };
  }
}

/** The agent card mounted above the composer while a session is active. */
export function AgentPanel() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const session = useAgentStore((s) => s.session);
  const toggleIncludedStep = useAgentStore((s) => s.toggleIncludedStep);
  const approvePlan = useAgentStore((s) => s.approvePlan);
  const cancelPlan = useAgentStore((s) => s.cancelPlan);
  const confirmStep = useAgentStore((s) => s.confirmStep);
  const dismissSession = useAgentStore((s) => s.dismissSession);

  if (!session) return null;
  const editable = session.status === 'awaiting-plan';
  const headline = sessionStatusLabel(session.status, t);
  const canRun = editable && session.includedStepIds.length > 0;
  const confirmation = session.pendingConfirmation;

  return (
    <Animated.View entering={FadeInDown.duration(240)}>
      <GlassSurface strong radiusSize={radius.lg} style={styles.card}>
        <View style={styles.header} accessibilityLiveRegion="polite">
          <Text style={[type.callout, styles.auto, { color: colors.text }]} numberOfLines={2} accessibilityRole="header">
            {session.goal}
          </Text>
          <StatusChip label={headline.label} tone={headline.tone} />
        </View>

        {session.plan.length > 0 ? (
          <View style={styles.steps}>
            {session.plan.map((step, index) => {
              const status = session.stepStatus[step.id] ?? 'pending';
              const included = session.includedStepIds.includes(step.id);
              const mutating = step.tool ? (getAgentRegistry().get(step.tool)?.mutating ?? false) : false;
              return (
                <Pressable
                  key={step.id}
                  onPress={editable ? () => toggleIncludedStep(step.id) : undefined}
                  accessibilityRole={editable ? 'checkbox' : 'text'}
                  accessibilityState={{ checked: included }}
                  accessibilityLabel={describeStepA11y(index + 1, step.title, status, mutating, included, t)}
                  style={[styles.stepRow, !included && styles.stepExcluded]}
                >
                  <Text style={[type.callout, styles.glyph, { color: statusColor(status, colors) }]}>{STATUS_GLYPH[status]}</Text>
                  <View style={styles.stepText}>
                    <Text style={[type.label, styles.auto, { color: included ? colors.text : colors.textMuted }]} numberOfLines={2}>
                      {step.title}
                    </Text>
                    <Text style={[type.caption, styles.auto, { color: colors.textMuted }]} numberOfLines={1}>
                      {step.tool ? `${step.tool} · ${mutating ? t('agent.mutating') : t('agent.readOnly')}` : t('agent.answerStep')}
                    </Text>
                  </View>
                  <StatusChip label={t(`agent.step_${status}`)} tone={STATUS_TONE[status]} dot={false} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={[type.label, styles.auto, { color: colors.textMuted }]}>{t('agent.planning')}</Text>
        )}

        {confirmation ? (
          <View accessibilityLiveRegion="assertive">
            <GlassSurface radiusSize={radius.md} style={styles.confirmCard}>
              <Text style={[type.label, styles.auto, { color: colors.warning }]} accessibilityRole="header">
                {t('agent.confirmTitle')}
              </Text>
              <Text style={[type.label, styles.auto, { color: colors.text }]}>
                {describeConfirmationA11y(confirmation.tool, confirmation.args, t)}
              </Text>
              <Text
                style={[type.caption, styles.args, styles.auto, { color: colors.textMuted }]}
                numberOfLines={3}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden={true}
              >
                {JSON.stringify(confirmation.args)}
              </Text>
              <View style={styles.buttonRow}>
                <Button
                  title={t('agent.approve')}
                  variant="primary"
                  onPress={() => confirmStep(true)}
                  compact
                  style={styles.auto}
                  accessibilityLabel={t('agent.a11yApprove')}
                  accessibilityHint={t('agent.a11yApproveHint')}
                />
                <Button
                  title={t('agent.skip')}
                  variant="secondary"
                  onPress={() => confirmStep(false)}
                  compact
                  style={styles.auto}
                  accessibilityLabel={t('agent.a11ySkip')}
                  accessibilityHint={t('agent.a11ySkipHint')}
                />
              </View>
            </GlassSurface>
          </View>
        ) : null}

        {session.answer ? (
          <Text style={[type.label, styles.auto, { color: colors.textMuted }]} numberOfLines={4}>
            {session.answer}
          </Text>
        ) : null}

        {session.error ? <Text style={[type.label, styles.auto, { color: colors.danger }]}>{session.error}</Text> : null}

        {editable ? (
          <>
            <Text style={[type.caption, styles.auto, { color: colors.textMuted }]}>{t('agent.editHint')}</Text>
            <View style={styles.buttonRow}>
              <Button
                title={t('agent.run')}
                variant="primary"
                onPress={approvePlan}
                disabled={!canRun}
                style={styles.auto}
                accessibilityHint={t('agent.a11yRunHint')}
              />
              <Button title={t('agent.cancel')} variant="secondary" onPress={cancelPlan} style={styles.auto} />
            </View>
          </>
        ) : null}

        {session.status === 'planning' || session.status === 'running' ? (
          <View style={styles.buttonRow}>
            <Button title={t('agent.cancel')} variant="secondary" onPress={cancelPlan} compact style={styles.auto} />
          </View>
        ) : null}

        {session.status === 'finished' || session.status === 'failed' || session.status === 'cancelled' ? (
          <View style={styles.buttonRow}>
            <Button title={t('agent.close')} variant="secondary" onPress={dismissSession} compact style={styles.auto} />
          </View>
        ) : null}
      </GlassSurface>
    </Animated.View>
  );
}

function statusColor(
  status: StepStatus,
  colors: { success: string; danger: string; warning: string; accent: string; textMuted: string },
): string {
  switch (status) {
    case 'done':
      return colors.success;
    case 'failed':
      return colors.danger;
    case 'confirming':
      return colors.warning;
    case 'running':
      return colors.accent;
    default:
      return colors.textMuted;
  }
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  steps: { gap: spacing.xs },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, minHeight: 44 },
  stepExcluded: { opacity: 0.5 },
  glyph: { width: 22, textAlign: 'center' },
  stepText: { flex: 1, gap: 1 },
  confirmCard: { padding: spacing.sm, gap: spacing.xs },
  args: { fontFamily: 'monospace', fontSize: 11 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  auto: { flexShrink: 1, flexGrow: 1 },
});
