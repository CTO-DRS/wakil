// Copyright (c) 2026 DRS AI. All rights reserved.
// Renders the real route tree (src/app) with expo-router's testing library and drives
// it the way a user does: launch, onboarding, Search and its Back chevron, the glass
// tab bar, and the Android hardware back button.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { BackHandler } from 'react-native';

import { goBack } from '../src/navigation/goBack';
import { useSettingsStore } from '../src/store/settingsStore';

// expo-router's testing mocks load `react-native-reanimated/mock`, which needs the TS
// sources; point it at the prebuilt mock so animated components render.
jest.mock('react-native-reanimated/mock', () => jest.requireActual('react-native-reanimated/lib/module/mock'));
// No native SQLite under Jest: the root layout falls back to the in-memory repository.
jest.doMock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    throw new Error('no sqlite under jest');
  },
}));

const ROUTES = [
  '_layout',
  '(tabs)/_layout',
  '(tabs)/index',
  '(tabs)/models',
  '(tabs)/settings',
  'search',
  'lock',
  'pin-setup',
  'chat/[id]',
  'onboarding/_layout',
  'onboarding/index',
  'onboarding/language',
  'onboarding/path',
];

type Rendered = Awaited<ReturnType<typeof renderRouter>>;

// The first render loads the whole app (cold module load is slow on CI runners).
jest.setTimeout(60_000);

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });
  }
};

/** Names of the root stack's routes, bottom to top. */
function rootStack(r: Rendered): string[] {
  const appStack = r.getRouterState()?.routes[0]?.state;
  return (appStack?.routes ?? []).map((route) => route.name);
}

async function launch(initialUrl: string, { onboarded }: { onboarded: boolean }): Promise<Rendered> {
  // English keeps the layout LTR, so bootstrap does not ask for an RTL reload.
  useSettingsStore.setState({ onboardingCompleted: onboarded, language: 'en' });
  // Route modules load lazily so they pick up the mocks registered above.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ctx = Object.fromEntries(ROUTES.map((name) => [name, require(`../src/app/${name}`)]));
  const r = await renderRouter(ctx, { initialUrl });
  // Bootstrap is async; wait until the app's own stack navigator has mounted.
  for (let i = 0; i < 40 && r.getRouterState()?.routes[0]?.state?.type !== 'stack'; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });
  }
  await settle();
  return r;
}

const backChevron = () => screen.getByLabelText('Back');

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('goBack', () => {
  it('pops when there is history', () => {
    const r = { canGoBack: () => true, back: jest.fn(), replace: jest.fn() };
    goBack(r);
    expect(r.back).toHaveBeenCalledTimes(1);
    expect(r.replace).not.toHaveBeenCalled();
  });

  it('falls back to home (or a given href) at the bottom of the stack', () => {
    const r = { canGoBack: () => false, back: jest.fn(), replace: jest.fn() };
    goBack(r);
    goBack(r, '/settings');
    expect(r.back).not.toHaveBeenCalled();
    expect(r.replace).toHaveBeenNthCalledWith(1, '/');
    expect(r.replace).toHaveBeenNthCalledWith(2, '/settings');
  });
});

describe('root navigation', () => {
  it('first launch lands on onboarding (not a stray Search screen) and finishing it leaves only the tabs', async () => {
    const r = await launch('/', { onboarded: false });
    expect(r).toHavePathname('/onboarding');
    expect(rootStack(r)).toEqual(['onboarding']);

    await act(async () => {
      useSettingsStore.getState().completeOnboarding({ openChat: false });
    });
    await settle();
    expect(r).toHavePathname('/');
    expect(rootStack(r)).toEqual(['(tabs)']);
  });

  it('Search is unreachable before onboarding', async () => {
    const r = await launch('/search', { onboarded: false });
    expect(r).toHavePathname('/onboarding');
    expect(rootStack(r)).not.toContain('search');
  });

  it('the Search back chevron returns to home', async () => {
    const r = await launch('/', { onboarded: true });
    await act(() => router.push('/search'));
    await settle();
    expect(r).toHavePathname('/search');
    expect(rootStack(r)).toEqual(['(tabs)', 'search']);

    await fireEvent.press(backChevron());
    await settle();
    expect(r).toHavePathname('/');
    expect(rootStack(r)).toEqual(['(tabs)']);
  });

  it('the Search back chevron still leaves when Search is the only screen (deep link)', async () => {
    const r = await launch('/search', { onboarded: true });
    expect(r).toHavePathname('/search');
    expect(router.canGoBack()).toBe(false);

    await fireEvent.press(backChevron());
    await settle();
    expect(r).toHavePathname('/');
  });

  it('the Android hardware back button pops Search', async () => {
    type Handler = Parameters<typeof BackHandler.addEventListener>[1];
    const handlers: Handler[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
    });
    // Like RN: the newest subscription is asked first, until one handles the press.
    const pressBack = () => [...handlers].reverse().some((h) => h({} as Parameters<Handler>[0]) === true);
    const r = await launch('/', { onboarded: true });
    await act(() => router.push('/search'));
    await settle();
    expect(r).toHavePathname('/search');

    let handled = false;
    await act(async () => {
      handled = pressBack();
    });
    await settle();
    expect(handled).toBe(true);
    expect(r).toHavePathname('/');
  });

  it('the glass tab bar switches tabs, also after visiting Search', async () => {
    const r = await launch('/', { onboarded: true });
    await act(() => router.push('/search'));
    await settle();
    await fireEvent.press(backChevron());
    await settle();

    const tabs = () => screen.getAllByRole('tab');
    expect(tabs()).toHaveLength(3);
    await fireEvent.press(tabs()[1]);
    await settle();
    expect(r).toHavePathname('/models');
    await fireEvent.press(tabs()[2]);
    await settle();
    expect(r).toHavePathname('/settings');
    await fireEvent.press(tabs()[0]);
    await settle();
    expect(r).toHavePathname('/');
  });
});
