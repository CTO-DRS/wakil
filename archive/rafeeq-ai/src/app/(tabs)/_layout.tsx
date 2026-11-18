// Copyright (c) 2026 DRS AI. All rights reserved.
import { Tabs } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';

import { GlassTabBar } from '../../components/GlassTabBar';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' }, animation: 'fade' }}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.home') }} />
      <Tabs.Screen name="models" options={{ title: t('nav.models') }} />
      <Tabs.Screen name="settings" options={{ title: t('nav.settings') }} />
    </Tabs>
  );
}
