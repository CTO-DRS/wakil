// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The launcher-icon switch chain, pure both sides: the TS plan in
 * src/appearance/appIcons.ts and the manifest transform in the
 * withLauncherIcons config plugin must stay in lockstep — the alias classes
 * the plan enables/disables are exactly the aliases the manifest declares.
 */
import * as appIcons from '../src/appearance/appIcons';
import * as plugin from '../plugins/withLauncherIcons';

const ALL = ['default', 'midnight', 'gold', 'glass', 'cyber', 'neon', 'mono', 'sunset'] as const;

describe('appIcons plan (enable-first, never launcher-less)', () => {
  it('enables the target first and disables every other alias', () => {
    const plan = appIcons.planIconSwitch('gold');
    expect(plan.enable).toBe('Icon_gold');
    expect(plan.disable).toHaveLength(ALL.length - 1);
    expect(plan.disable).not.toContain('Icon_gold');
    expect([...plan.disable].sort()).toEqual(
      ALL.filter((id) => id !== 'gold').map((id) => appIcons.launcherAliasClass(id)).sort(),
    );
  });

  it('the classic icon keeps its dedicated alias class', () => {
    expect(appIcons.launcherAliasClass('default')).toBe('Icon_Classic');
    const plan = appIcons.planIconSwitch('default');
    expect(plan.enable).toBe('Icon_Classic');
    expect(plan.disable).toHaveLength(7);
  });

  it('alias class ⇄ icon id round-trips', () => {
    for (const id of ALL) {
      expect(appIcons.iconIdFromAliasClass(appIcons.launcherAliasClass(id))).toBe(id);
    }
    expect(appIcons.iconIdFromAliasClass('Icon_unknown')).toBeNull();
    expect(appIcons.iconIdFromAliasClass('MainActivity')).toBeNull();
  });

  it('declares exactly the manifest set, in declaration order', () => {
    expect(appIcons.allAliasClasses()).toEqual(['Icon_Classic', ...ALL.slice(1).map((id) => `Icon_${id}`)]);
    expect(appIcons.isLauncherIconId('midnight')).toBe(true);
    expect(appIcons.isLauncherIconId('rainbow')).toBe(false);
  });
});

describe('withLauncherIcons manifest transform', () => {
  const makeManifest = () => ({
    manifest: {
      application: [
        {
          activity: [
            {
              $: { 'android:name': 'com.drsai.rafeeq.MainActivity' },
              'intent-filter': [
                {
                  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
                },
                {
                  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
                  category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  it('strips the activity launcher filter and injects one alias per design', () => {
    const manifest = plugin.applyLauncherAliases(makeManifest() as never);
    const app = manifest.manifest.application[0];
    // the activity keeps only its non-launcher filter
    const kept = app.activity[0]['intent-filter'];
    expect(kept).toHaveLength(1);
    expect(kept[0].action[0].$['android:name']).toBe('android.intent.action.VIEW');
    // every alias exists, targets MainActivity, carries MAIN/LAUNCHER
    expect(app['activity-alias']).toHaveLength(ALL.length);
    for (const alias of app['activity-alias']) {
      expect(alias.$['android:targetActivity']).toBe('.MainActivity');
      expect(alias.$['android:exported']).toBe('true');
      expect(alias['intent-filter'][0].action[0].$['android:name']).toBe('android.intent.action.MAIN');
      expect(alias['intent-filter'][0].category[0].$['android:name']).toBe('android.intent.category.LAUNCHER');
    }
  });

  it('only the classic alias starts enabled and both icon refs point at it', () => {
    const manifest = plugin.applyLauncherAliases(makeManifest() as never);
    const aliases = manifest.manifest.application[0]['activity-alias'];
    for (const alias of aliases) {
      const isDefault = alias.$['android:name'] === '.Icon_Classic';
      expect(alias.$['android:enabled']).toBe(isDefault ? 'true' : 'false');
      if (isDefault) {
        expect(alias.$['android:icon']).toBe('@mipmap/ic_launcher');
        expect(alias.$['android:roundIcon']).toBe('@mipmap/ic_launcher_round');
      } else {
        expect(alias.$['android:icon']).toMatch(/^@mipmap\/ic_launcher_[a-z]+$/);
        expect(alias.$['android:roundIcon']).toMatch(/^@mipmap\/ic_launcher_[a-z]+$/);
      }
    }
  });

  it('is idempotent-safe: re-applying keeps exactly one alias set', () => {
    const once = plugin.applyLauncherAliases(makeManifest() as never);
    const twice = plugin.applyLauncherAliases(once as never);
    expect(twice.manifest.application[0]['activity-alias']).toHaveLength(ALL.length);
  });

  it('rejects a manifest without MainActivity instead of corrupting it', () => {
    const broken = { manifest: { application: [{ activity: [{ $: { 'android:name': 'Other' } }] }] } };
    expect(() => plugin.applyLauncherAliases(broken as never)).toThrow('MainActivity');
  });

  it('the plugin and the TS registry agree on the design ids', () => {
    expect(plugin.DESIGN_IDS).toEqual([...ALL.slice(1)]);
    expect(plugin.ALL_ICON_IDS).toEqual([...ALL]);
    for (const id of plugin.ALL_ICON_IDS) {
      expect(plugin.aliasName(id)).toBe(`.${appIcons.launcherAliasClass(id as appIcons.LauncherIconId)}`);
    }
  });
});
