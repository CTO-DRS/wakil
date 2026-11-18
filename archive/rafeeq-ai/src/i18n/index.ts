// Copyright (c) 2026 DRS AI. All rights reserved.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import type { Language } from '../types';
import ar from './ar';
import en from './en';

export const DEFAULT_LANGUAGE: Language = 'ar';
/** KV key remembering which language we already reloaded for (prevents reload loops). */
export const RTL_RELOAD_KEY = 'rafeeq.rtlReloadFor';
export const SUPPORTED_LANGUAGES: Language[] = ['ar', 'en'];

export const resources = {
  ar: { translation: ar },
  en: { translation: en },
} as const;

export function isRtlLanguage(lang: Language): boolean {
  return lang === 'ar';
}

export function normalizeLanguage(value: unknown): Language {
  return value === 'en' || value === 'ar' ? value : DEFAULT_LANGUAGE;
}

let initialized = false;

/** Initializes i18next synchronously (resources are bundled). Safe to call repeatedly. */
export function initI18n(lang: Language = DEFAULT_LANGUAGE) {
  if (!initialized) {
    initialized = true;
    // The default i18next instance is intentional here (shared with react-i18next).
    // eslint-disable-next-line import/no-named-as-default-member
    void i18n.use(initReactI18next).init({
      resources,
      lng: lang,
      fallbackLng: DEFAULT_LANGUAGE,
      interpolation: { escapeValue: false },
      returnNull: false,
      initAsync: false,
    });
  } else if (i18n.language !== lang) {
    // eslint-disable-next-line import/no-named-as-default-member
    void i18n.changeLanguage(lang);
  }
  return i18n;
}

/**
 * Aligns the native layout direction with the language.
 * Returns true when the direction changed and the app must reload to apply it.
 */
export function applyLayoutDirection(lang: Language): boolean {
  const rtl = isRtlLanguage(lang);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return true;
}

export default i18n;
