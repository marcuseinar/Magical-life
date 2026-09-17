/**
 * Small persisted choices that live under Settings — injected so `ui/` never
 * touches storage directly. One flag today; a second is a second pair of
 * methods here, not a redesign.
 */
export type Preferences = {
  /** Whether taking damage and gaining life spray a burst of glyphs. */
  loadImpactEffects(): boolean;
  saveImpactEffects(value: boolean): void;
};
