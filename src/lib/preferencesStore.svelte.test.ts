import { describe, expect, it } from 'vitest';
import { createPreferencesStore } from './preferencesStore.svelte';
import { createMemoryPreferences } from '$adapters/platform/memoryPreferences';

describe('preferences store', () => {
  it('starts with whatever the adapter already has saved', () => {
    const store = createPreferencesStore({
      preferences: createMemoryPreferences({ impactEffects: false })
    });
    expect(store.impactEffects).toBe(false);
  });

  it('defaults impact effects on when nothing has been saved', () => {
    const store = createPreferencesStore({ preferences: createMemoryPreferences() });
    expect(store.impactEffects).toBe(true);
  });

  it('updates reactively and persists through the adapter', () => {
    const preferences = createMemoryPreferences();
    const store = createPreferencesStore({ preferences });

    store.setImpactEffects(false);

    expect(store.impactEffects).toBe(false);
    // A fresh store reading the same adapter sees the saved value, not a
    // value that only ever lived on this one instance.
    expect(createPreferencesStore({ preferences }).impactEffects).toBe(false);
  });
});
