/**
 * How a change in life should read as a burst: a cloud of minus signs
 * falling for a loss, a cloud of plus signs rising for a gain — spanning the
 * screen, not one glyph per point.
 *
 * Pure and synchronous, like `pendingDelta` — everything impure (spawning,
 * timing the cloud away again, reading the motion preference, where on
 * screen it starts) lives in the controller that wraps this.
 */

export type ImpactDirection = 'gain' | 'loss';

export type ImpactSpec = {
  readonly direction: ImpactDirection;
  /** How many glyphs make up the cloud. */
  readonly glyphs: number;
  /** Multiplies the base size of each glyph. */
  readonly scale: number;
};

/** Even a single point of damage is a real cloud, not a lone glyph. */
export const MIN_GLYPHS = 16;
/** However large the change, a cloud only ever gets this dense. */
export const MAX_GLYPHS = 40;
const GLYPHS_PER_POINT = 5;

/** How long a burst plays before it is removed — the fall or the rise, all
 *  the way across the screen, plus its fade. Fixed regardless of `scale`,
 *  so a bigger burst reads as a denser cloud, not a longer wait to clear. */
export const IMPACT_DURATION_MS = 1500;

const MIN_SCALE = 1;
const MAX_SCALE = 1.5;
const SCALE_PER_POINT = 0.08;

/**
 * `delta` is assumed non-zero — a change of zero is not a change, and callers
 * only ever spawn a burst for a real one.
 */
export function impactSpec(delta: number): ImpactSpec {
  const magnitude = Math.abs(delta);
  return {
    direction: delta < 0 ? 'loss' : 'gain',
    glyphs: Math.min(MAX_GLYPHS, MIN_GLYPHS + (magnitude - 1) * GLYPHS_PER_POINT),
    scale: Math.min(MAX_SCALE, MIN_SCALE + (magnitude - 1) * SCALE_PER_POINT)
  };
}
