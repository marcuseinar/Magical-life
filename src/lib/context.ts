import { getContext, setContext } from 'svelte';
import type { GameStore } from './gameStore.svelte';

const KEY = Symbol('magical-life:game');

/**
 * Components receive the store through context rather than importing it, so a
 * component test can mount one with a fake and never touch storage.
 */
export const provideGameStore = (store: GameStore) => setContext(KEY, store);
export const useGameStore = (): GameStore => getContext(KEY);
