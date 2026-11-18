// Copyright (c) 2026 DRS AI. All rights reserved.
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="language" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="recommend" />
      <Stack.Screen name="path" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="personalize" />
      <Stack.Screen name="summary" />
    </Stack>
  );
}
