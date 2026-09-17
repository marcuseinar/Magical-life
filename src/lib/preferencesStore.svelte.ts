import { browser } from '$app/environment';
import type { Preferences } from '$application/ports/preferences';
import { createLocalStoragePreferences } from '$adapters/platform/localStoragePreferences';
import { createMemoryPreferences } from '$adapters/platform/memoryPreferences';

/**
 * The composition root for Settings toggles, same shape as `gameStore`:
 * reactivity lives here, above the adapter, so the adapter stays a plain
 * synchronous port.
 */
export type PreferencesStore = ReturnType<typeof createPreferencesStore>;

export function createPreferencesStore(
  overrides: {
    preferences?: Preferences;
  } = {}
) {
  const preferences =
    overrides.preferences ??
    (browser ? createLocalStoragePreferences() : createMemoryPreferences());

  let impactEffects = $state(preferences.loadImpactEffects());

  return {
    get impactEffects() {
      return impactEffects;
    },
    setImpactEffects(value: boolean) {
      impactEffects = value;
      preferences.saveImpactEffects(value);
    }
  };
}
