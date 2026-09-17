import { getContext, setContext } from 'svelte';
import type { GameStore } from './gameStore.svelte';
import type { PreferencesStore } from './preferencesStore.svelte';
import type { TableSession } from './tableSession.svelte';

const KEY = Symbol('magical-life:game');
const TABLE_KEY = Symbol('magical-life:table');
const PREFERENCES_KEY = Symbol('magical-life:preferences');

/**
 * Components receive the store through context rather than importing it, so a
 * component test can mount one with a fake and never touch storage.
 */
export const provideGameStore = (store: GameStore) => setContext(KEY, store);
export const useGameStore = (): GameStore => getContext(KEY);

/**
 * The table this device is hosting, if it has opened one. Provided beside
 * the store and for the same reason: it has to outlive every screen, or the
 * code changes underneath whoever was given it.
 */
export const provideTableSession = (session: TableSession) => setContext(TABLE_KEY, session);
export const useTableSession = (): TableSession => getContext(TABLE_KEY);

/**
 * Settings toggles, provided once above every screen for the same reason as
 * the game store: a route change unmounts the page that reads it, not the
 * preference itself.
 */
export const providePreferences = (store: PreferencesStore) => setContext(PREFERENCES_KEY, store);
export const usePreferences = (): PreferencesStore => getContext(PREFERENCES_KEY);
