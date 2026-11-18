// Copyright (c) 2026 DRS AI. All rights reserved.
import { I18nManager } from 'react-native';

import i18n, { applyLayoutDirection, DEFAULT_LANGUAGE, initI18n, isRtlLanguage, normalizeLanguage, resources } from '../src/i18n';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function placeholders(s: string): string[] {
  return (s.match(/{{\s*\w+\s*}}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();
}

function get(obj: object, path: string): string {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as string;
}

describe('i18n', () => {
  it('defaults to Arabic', () => {
    expect(DEFAULT_LANGUAGE).toBe('ar');
    expect(normalizeLanguage(undefined)).toBe('ar');
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('fr')).toBe('ar');
  });

  it('has identical keys and placeholders in Arabic and English', () => {
    const ar = keys(resources.ar.translation).sort();
    const en = keys(resources.en.translation).sort();
    expect(ar).toEqual(en);
    for (const k of en) {
      expect(placeholders(get(resources.ar.translation, k))).toEqual(placeholders(get(resources.en.translation, k)));
      expect(get(resources.ar.translation, k).length).toBeGreaterThan(0);
    }
  });

  it('translates and interpolates', () => {
    initI18n('ar');
    expect(i18n.t('nav.models')).toBe('النماذج');
    expect(i18n.t('chat.ready', { name: 'Qwen' })).toBe('جاهز: Qwen');
    initI18n('en');
    expect(i18n.t('nav.models')).toBe('Models');
    expect(i18n.t('models.size', { size: '1 GB' })).toBe('Size: 1 GB');
  });

  it('marks Arabic as RTL and flips native direction when needed', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    const allow = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
    const current = I18nManager.isRTL;
    expect(applyLayoutDirection(current ? 'ar' : 'en')).toBe(false);
    expect(applyLayoutDirection(current ? 'en' : 'ar')).toBe(true);
    expect(force).toHaveBeenCalledWith(!current);
    expect(allow).toHaveBeenCalledWith(!current);
  });
});
