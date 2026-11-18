// Copyright (c) 2026 DRS AI. All rights reserved.
import * as Clipboard from 'expo-clipboard';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  I18nManager,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Markdown, {
  styles as markdownBase,
  type ASTNode,
  type MarkdownStyleMap,
  type RenderRules,
} from '@ronradtke/react-native-markdown-display';

import { FONT_FAMILY, radius, spacing, useAppTheme, type Palette } from '../theme';
import { haptic } from '../utils/haptics';
import { useSettingsStore } from '../store/settingsStore';

const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined });

/**
 * Theme-aware Markdown stylesheet, rebuilt only when the palette or layout
 * direction changes. Built on the library defaults with mergeStyle={false} so
 * every visual property stays under our control: brand colors, RTL-aware
 * borders (the quote bar flips sides) and LTR code inside the RTL layout.
 */
function buildMarkdownStyles(colors: Palette, rtl: boolean, scale = 1): MarkdownStyleMap {
  const hairline = colors.border;
  const fs = (n: number) => Math.round(n * scale * 100) / 100;
  return {
    ...markdownBase,
    body: { fontFamily: FONT_FAMILY, fontSize: fs(16), lineHeight: fs(26), color: colors.text },
    textgroup: { color: colors.text },
    text: { color: colors.text },
    heading1: { color: colors.text, fontFamily: FONT_FAMILY, fontSize: fs(22), lineHeight: fs(32), fontWeight: '700', marginTop: 12, marginBottom: 6 },
    heading2: { color: colors.text, fontFamily: FONT_FAMILY, fontSize: fs(19), lineHeight: fs(28), fontWeight: '700', marginTop: 10, marginBottom: 5 },
    heading3: { color: colors.text, fontFamily: FONT_FAMILY, fontSize: fs(17), lineHeight: fs(25), fontWeight: '700', marginTop: 8, marginBottom: 4 },
    heading4: { color: colors.text, fontFamily: FONT_FAMILY, fontSize: fs(16), lineHeight: fs(24), fontWeight: '700', marginTop: 8, marginBottom: 4 },
    heading5: { color: colors.text, fontFamily: FONT_FAMILY, fontSize: fs(15), lineHeight: fs(22), fontWeight: '700' },
    heading6: { color: colors.textMuted, fontFamily: FONT_FAMILY, fontSize: fs(14), lineHeight: fs(21), fontWeight: '700' },
    paragraph: { marginTop: 6, marginBottom: 6, flexWrap: 'wrap', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-start', width: '100%' },
    strong: { fontWeight: '700' },
    em: { fontStyle: 'italic' },
    link: { color: colors.accent, textDecorationLine: 'underline' },
    hr: { backgroundColor: hairline, height: 1 },
    blockquote: {
      backgroundColor: colors.surfaceAlt,
      borderColor: hairline,
      borderLeftWidth: rtl ? 0 : 3,
      borderRightWidth: rtl ? 3 : 0,
      marginVertical: 4,
      paddingVertical: 2,
      paddingHorizontal: spacing.sm,
    },
    bullet_list: {},
    ordered_list: {},
    list_item: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 2 },
    bullet_list_icon: { marginHorizontal: spacing.sm, color: colors.textMuted },
    ordered_list_icon: { marginHorizontal: spacing.sm, color: colors.textMuted },
    bullet_list_content: { flex: 1 },
    ordered_list_content: { flex: 1 },
    code_inline: {
      fontFamily: MONO_FONT,
      fontSize: fs(14),
      color: colors.text,
      backgroundColor: colors.surfaceAlt,
      borderColor: hairline,
      borderWidth: 1,
      borderRadius: 6,
      paddingVertical: 1,
      paddingHorizontal: 5,
      writingDirection: 'ltr',
    },
    fence: { borderWidth: 1, borderColor: hairline, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, overflow: 'hidden', marginVertical: 6 },
    fence_header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: hairline },
    fence_language_label: { fontSize: fs(11), color: colors.textFaint, fontFamily: MONO_FONT, writingDirection: 'ltr' },
    fence_copy_button: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
    fence_copy_text: { fontSize: fs(11), color: colors.accent, fontWeight: '600' },
    fence_code: { backgroundColor: 'transparent', padding: spacing.md },
    fence_token: { fontFamily: MONO_FONT, fontSize: fs(13), lineHeight: fs(20), color: colors.text, writingDirection: 'ltr' },
    table: { borderWidth: 1, borderColor: hairline, borderRadius: 8, marginVertical: 6 },
    th: { flex: 1, padding: 6, fontWeight: '700', color: colors.text },
    td: { flex: 1, padding: 6, color: colors.text },
    tr: { borderBottomWidth: 1, borderColor: hairline, flexDirection: 'row' },
    hardbreak: { width: '100%', height: 1 },
    softbreak: {},
  };
}

type FenceNode = ASTNode & { content: string; sourceInfo?: string };

/**
 * Localized, icon-free code block. Replaces the library default, which pulls a
 * vector-icon dependency and hardcodes English labels; ours also skips syntax
 * highlighting, which is too expensive to re-run on low-RAM devices.
 */
function FenceBlock({
  node,
  styles,
  onCopyCode,
  copyLabel,
  copiedLabel,
}: {
  node: FenceNode;
  styles: MarkdownStyleMap;
  onCopyCode: ((code: string, language: string) => void) | undefined;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const language = typeof node.sourceInfo === 'string' ? (node.sourceInfo.trim().split(/\s+/)[0] ?? '') : '';

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    if (!onCopyCode) return;
    onCopyCode(node.content.replace(/\n$/, ''), language);
    setCopied(true);
  };

  const fenceStyle = styles.fence as StyleProp<ViewStyle>;
  const headerStyle = styles.fence_header as StyleProp<ViewStyle>;
  const codeStyle = styles.fence_code as StyleProp<TextStyle>;
  const tokenStyle = styles.fence_token as StyleProp<TextStyle>;

  return (
    <View style={fenceStyle}>
      {language.length > 0 || onCopyCode !== undefined ? (
        <View style={headerStyle}>
          <Text style={styles.fence_language_label as StyleProp<TextStyle>}>{language}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copyLabel}
            onPress={copy}
            style={styles.fence_copy_button as StyleProp<ViewStyle>}
            hitSlop={6}
          >
            <Text style={styles.fence_copy_text as StyleProp<TextStyle>}>{copied ? copiedLabel : copyLabel}</Text>
          </Pressable>
        </View>
      ) : null}
      <Text selectable style={codeStyle}>
        <Text style={tokenStyle}>{node.content.replace(/\n$/, '')}</Text>
      </Text>
    </View>
  );
}

/** Every Text rendered by the library flows through here, keeping selection available. */
function SelectableText(props: TextProps) {
  return <Text {...props} selectable />;
}

/**
 * Renders assistant replies as rich Markdown.
 *
 * Performance contract (low-RAM devices first): the chat screen renders the
 * streaming message as cheap plain text and mounts MarkdownBody only when the
 * reply is complete, so the document is parsed exactly once per message —
 * never again while tokens arrive. `memo` keeps completed replies stable while
 * the list scrolls.
 *
 * Privacy: remote images are disabled entirely, so model output can never make
 * the app fetch URLs (no tracking pixels, no data leaving the device).
 */
export const MarkdownBody = memo(function MarkdownBody({ content }: { content: string }) {
  const { t } = useTranslation();
  const { dark, colors } = useAppTheme();
  const rtl = I18nManager.isRTL;
  const fontScale = useSettingsStore((st) => st.chatFontScale);

  const styles = useMemo(() => buildMarkdownStyles(colors, rtl, fontScale), [colors, rtl, fontScale]);
  const copyLabel = t('common.copy');
  const copiedLabel = t('common.copied');

  const handleCopy = useCallback((code: string) => {
    haptic.light();
    void Clipboard.setStringAsync(code);
  }, []);

  const handleLink = useCallback((url: string) => {
    haptic.light();
    void Linking.openURL(url).catch(() => {}); // Invalid URLs must never crash the chat.
    return false; // we already opened it ourselves
  }, []);

  const rules = useMemo<RenderRules>(
    () => ({
      fence: (node, _children, _parent, ruleStyles, onCopyCode) => (
        <FenceBlock
          key={node.key}
          node={node as FenceNode}
          styles={ruleStyles}
          onCopyCode={typeof onCopyCode === 'function' ? onCopyCode : undefined}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
        />
      ),
    }),
    [copyLabel, copiedLabel],
  );

  return (
    <Markdown
      style={styles}
      mergeStyle={false}
      colorScheme={dark ? 'dark' : 'light'}
      textcomponent={SelectableText}
      rules={rules}
      allowedImageHandlers={[]}
      defaultImageHandler={null}
      onCopyCode={handleCopy}
      onLinkPress={handleLink}
    >
      {content}
    </Markdown>
  );
});
