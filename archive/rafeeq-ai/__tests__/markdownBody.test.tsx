// Copyright (c) 2026 DRS AI. All rights reserved.
import * as Clipboard from 'expo-clipboard';
import { create, act, type ReactTestRendererJSON } from 'react-test-renderer';

import { MarkdownBody } from '../src/components/MarkdownBody';
import { initI18n } from '../src/i18n';

type Json = ReactTestRendererJSON | ReactTestRendererJSON[] | null;

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
}));

/** Concatenates every string rendered anywhere in the tree (words are split by the parser). */
function allText(node: Json): string {
  const parts: string[] = [];
  const walk = (n: ReactTestRendererJSON) => {
    for (const child of n.children ?? []) {
      if (typeof child === 'string') parts.push(child);
      else walk(child);
    }
  };
  if (Array.isArray(node)) node.forEach(walk);
  else if (node) walk(node);
  return parts.join(' ').replace(/\s+/g, ' ');
}

function containsNodeType(node: Json, type: string): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some((n) => containsNodeType(n, type));
  if (node.type === type) return true;
  return (node.children ?? []).some((child) => typeof child !== 'string' && containsNodeType(child, type));
}

function hasLtrStyle(style: unknown): boolean {
  if (Array.isArray(style)) return style.some(hasLtrStyle);
  return typeof style === 'object' && style !== null && (style as { writingDirection?: string }).writingDirection === 'ltr';
}

describe('MarkdownBody', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders rich content without literal markdown syntax', () => {
    initI18n('ar');
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(<MarkdownBody content={'# عنوان\n\n**عريض** و *مائل*\n\n- بند أول\n- بند ثاني\n'} />);
    });
    const text = allText(tree!.toJSON());
    expect(text).toContain('عنوان');
    expect(text).toContain('عريض');
    expect(text).toContain('مائل');
    expect(text).toContain('بند أول');
    expect(text).not.toContain('**');
    expect(text).not.toContain('# عنوان');
    expect(text).not.toContain('- بند');
  });

  it('renders fenced code with a language label and a localized copy button', async () => {
    initI18n('ar');
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(<MarkdownBody content={'```python\nprint("مرحبا")\n```\n'} />);
    });
    expect(allText(tree!.toJSON())).toContain('python');
    expect(allText(tree!.toJSON())).toContain('print("مرحبا")');

    const button = tree!.root.find((n) => n.props.accessibilityLabel === 'نسخ');
    await act(async () => {
      button.props.onPress();
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('print("مرحبا")');
    expect(allText(tree!.toJSON())).toContain('تم النسخ');
  });

  it('never renders remote images from model output (privacy)', () => {
    initI18n('en');
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(<MarkdownBody content={'![logo](https://evil.example/track.png)\n\nplain text stays'} />);
    });
    const json = tree!.toJSON();
    expect(containsNodeType(json, 'Image')).toBe(false);
    expect(allText(json)).toContain('plain text stays');
  });

  it('forces LTR writing direction on code', () => {
    initI18n('ar');
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(<MarkdownBody content={'```\ncode = direction\n```\n'} />);
    });
    const ltrNodes = tree!.root.findAll((n) => hasLtrStyle(n.props.style));
    expect(ltrNodes.length).toBeGreaterThan(0);
  });
});
