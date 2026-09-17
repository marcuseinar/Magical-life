import type { Preferences } from '$application/ports/preferences';

const KEY = 'magical-life:preferences';
const DEFAULT_IMPACT_EFFECTS = true;

type Stored = { impactEffects?: boolean };

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? {} : (JSON.parse(raw) as Stored);
  } catch {
    // Private browsing, storage disabled, or a corrupt value — the default
    // stands for this session either way.
    return {};
  }
}

/** Persisted in `localStorage` rather than the event log: a setting, not a
 *  fact about any game. */
export function createLocalStoragePreferences(): Preferences {
  return {
    loadImpactEffects: () => read().impactEffects ?? DEFAULT_IMPACT_EFFECTS,
    saveImpactEffects(value) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...read(), impactEffects: value }));
      } catch {
        // Best-effort: the toggle still works for the rest of this session.
      }
    }
  };
}
