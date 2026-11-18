// Copyright (c) 2026 DRS AI. All rights reserved.
//
// Expo config plugin: installs the alternate launcher-icon designs.
//
// Expo prebuild generates the default adaptive icon from app.json. This plugin
// adds seven more designs as *activity aliases*: every alias targets the same
// MainActivity and carries its own mipmap icon + the MAIN/LAUNCHER intent
// filter, so the launcher shows whichever alias is enabled. The classic icon
// keeps working exactly as before (its alias reuses the prebuilt @mipmap/
// ic_launcher resources and starts enabled; the others start disabled).
//
// The alias list, the enable-first/never-empty ordering and the Icon_<id>
// naming are mirrored in src/appearance/appIcons.ts (pure + tested) and
// executed natively by RafeeqToolsModule.setLauncherIcon.
//
// Pure helpers are exported for the test suite (launcherIcons.test.ts).

const fs = require('fs');
const path = require('path');

const DESIGN_IDS = ['midnight', 'gold', 'glass', 'cyber', 'neon', 'mono', 'sunset'];
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const MAIN_ACTION = 'android.intent.action.MAIN';
const LAUNCHER_CATEGORY = 'android.intent.category.LAUNCHER';

/** All selectable ids including the platform default — must match appIcons.ts. */
const ALL_ICON_IDS = ['default', ...DESIGN_IDS];

/** The manifest alias name for an icon id (relative class inside the package). */
function aliasName(iconId) {
  return iconId === 'default' ? '.Icon_Classic' : `.Icon_${iconId}`;
}

/**
 * Removes the MAIN/LAUNCHER intent-filter from an activity's node (the filter
 * must live on the aliases only, or both the activity and the alias would
 * appear). Returns true when something was removed.
 */
function stripLauncherIntentFilter(activityNode) {
  const filters = activityNode['intent-filter'];
  if (!Array.isArray(filters)) return false;
  const kept = filters.filter((f) => {
    const actions = Array.isArray(f.action) ? f.action.map((a) => a.$?.['android:name']) : [];
    const categories = Array.isArray(f.category)
      ? f.category.map((c) => c.$?.['android:name'])
      : [];
    return !(actions.includes(MAIN_ACTION) && categories.includes(LAUNCHER_CATEGORY));
  });
  if (kept.length === filters.length) return false;
  if (kept.length === 0) delete activityNode['intent-filter'];
  else activityNode['intent-filter'] = kept;
  return true;
}

/**
 * Builds the <activity-alias> XML node for one icon id. `enabled` is true for
 * the classic alias only; the rest stay disabled until the native setter
 * flips them (PackageManager.setComponentEnabledSetting).
 */
function aliasNode(iconId, enabled) {
  const isDefault = iconId === 'default';
  return {
    $: {
      'android:name': aliasName(iconId),
      'android:enabled': enabled ? 'true' : 'false',
      'android:exported': 'true',
      'android:targetActivity': '.MainActivity',
      'android:icon': isDefault ? '@mipmap/ic_launcher' : `@mipmap/ic_launcher_${iconId}`,
      'android:roundIcon': isDefault ? '@mipmap/ic_launcher_round' : `@mipmap/ic_launcher_${iconId}`,
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': MAIN_ACTION } }],
        category: [{ $: { 'android:name': LAUNCHER_CATEGORY } }],
      },
    ],
  };
}

/** Pure manifest transform: strip the activity filter, inject all aliases. */
function applyLauncherAliases(manifest) {
  const app = manifest.manifest?.application?.[0];
  if (!app) throw new Error('withLauncherIcons: no <application> in manifest');
  const activity = (app.activity ?? []).find(
    (a) => typeof a.$?.['android:name'] === 'string' && a.$['android:name'].endsWith('.MainActivity'),
  );
  if (!activity) throw new Error('withLauncherIcons: no .MainActivity in manifest');
  stripLauncherIntentFilter(activity);
  // Replace, never append: a second prebuild pass (or a hot manifest re-run)
  // must not stack a second copy of every alias.
  app['activity-alias'] = ALL_ICON_IDS.map((id) => aliasNode(id, id === 'default'));
  return manifest;
}

/** Copies one design's layer PNGs into the generated res folder. */
function copyDesignResources(projectRoot, platformProjectRoot, iconId) {
  const resDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'res');
  for (const dpi of DENSITIES) {
    const src = path.join(projectRoot, 'assets', 'launcher-icons', iconId, dpi);
    if (!fs.existsSync(src)) {
      throw new Error(`withLauncherIcons: missing assets for "${iconId}" (${dpi}) — run scripts/generate_launcher_icons.py`);
    }
    const dst = path.join(resDir, `mipmap-${dpi}`);
    fs.mkdirSync(dst, { recursive: true });
    for (const layer of ['bg', 'fg']) {
      const file = `ic_launcher_${iconId}_${layer}.png`;
      fs.copyFileSync(path.join(src, file), path.join(dst, file));
    }
  }
  // Adaptive-icon XML: only needed on API 26+, and minSdk is 26 (app.json).
  const anyDpi = path.join(resDir, 'mipmap-anydpi-v26');
  fs.mkdirSync(anyDpi, { recursive: true });
  fs.writeFileSync(
    path.join(anyDpi, `ic_launcher_${iconId}.xml`),
    `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_${iconId}_bg"/>\n    <foreground android:drawable="@mipmap/ic_launcher_${iconId}_fg"/>\n</adaptive-icon>\n`,
  );
}

function withLauncherIcons(config) {
  const { withAndroidManifest } = require('expo/config-plugins');
  return withAndroidManifest(config, (cfg) => {
    applyLauncherAliases(cfg.modResults);
    for (const id of DESIGN_IDS) {
      copyDesignResources(cfg.modRequest.projectRoot, cfg.modRequest.platformProjectRoot, id);
    }
    return cfg;
  });
}

module.exports = withLauncherIcons;
module.exports.DESIGN_IDS = DESIGN_IDS;
module.exports.DENSITIES = DENSITIES;
module.exports.ALL_ICON_IDS = ALL_ICON_IDS;
module.exports.aliasName = aliasName;
module.exports.stripLauncherIntentFilter = stripLauncherIntentFilter;
module.exports.aliasNode = aliasNode;
module.exports.applyLauncherAliases = applyLauncherAliases;
