import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStoragePreferences } from './localStoragePreferences';

function fakeLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    }
  };
}

describe('local storage preferences', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults impact effects on, with nothing saved yet', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
    expect(createLocalStoragePreferences().loadImpactEffects()).toBe(true);
  });

  it('remembers a value once saved', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
    const preferences = createLocalStoragePreferences();

    preferences.saveImpactEffects(false);

    expect(preferences.loadImpactEffects()).toBe(false);
  });

  it('is read by a second instance over the same storage', () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal('localStorage', storage);
    createLocalStoragePreferences().saveImpactEffects(false);

    vi.stubGlobal('localStorage', storage);
    expect(createLocalStoragePreferences().loadImpactEffects()).toBe(false);
  });

  it('does not throw when storage refuses to be read, such as private browsing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      }
    });

    const preferences = createLocalStoragePreferences();
    expect(preferences.loadImpactEffects()).toBe(true);
    expect(() => preferences.saveImpactEffects(false)).not.toThrow();
  });
});
