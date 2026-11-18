// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * True when a vertical list is scrolled within `threshold` px of its bottom.
 * Content shorter than the viewport (or empty) always counts as near the bottom.
 *
 * Used by the chat screen to keep `onContentSizeChange` auto-scroll from yanking
 * the list down while the user is reading older messages during streaming.
 */
export function isNearBottom(offsetY: number, contentHeight: number, viewportHeight: number, threshold = 80): boolean {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return true;
  return contentHeight - viewportHeight - offsetY <= threshold;
}
