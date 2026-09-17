import type { Preferences } from '$application/ports/preferences';

/** For tests, and for the brief window before `localStorage` is available
 *  during prerendering. Mirrors `createMemoryEventLog`. */
export function createMemoryPreferences(seed: { impactEffects?: boolean } = {}): Preferences {
  let impactEffects = seed.impactEffects ?? true;
  return {
    loadImpactEffects: () => impactEffects,
    saveImpactEffects: (value) => {
      impactEffects = value;
    }
  };
}
