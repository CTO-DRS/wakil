// Copyright (c) 2026 DRS AI. All rights reserved.
import type { Href } from 'expo-router';

/** The slice of the expo-router `router` this helper needs (keeps it testable). */
export type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
};

/**
 * Leaves the current screen. Pops when there is history; when the screen is the
 * bottom of its stack (cold start, deep link, a guard redirect) a bare `back()`
 * is a silent no-op, so fall back to the home tab instead of doing nothing.
 */
export function goBack(router: BackRouter, fallback: Href = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
