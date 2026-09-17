/**
 * How a change in life should read as a burst of glyphs: a spray of minus
 * signs falling for a loss, a scatter of plus signs rising for a gain.
 *
 * Pure and synchronous, like `pendingDelta` — everything impure (spawning,
 * timing the glyphs away again, reading the motion preference) lives in the
 * controller that wraps this.
 */

export type ImpactDirection = 'gain' | 'loss';

export type ImpactSpec = {
  readonly direction: ImpactDirection;
  /** How many glyphs to draw. */
  readonly glyphs: number;
  /** Multiplies the base size of each glyph and how far it travels. */
  readonly scale: number;
};

/** However large the change, the card only ever shows this many marks. */
export const MAX_GLYPHS = 6;

/** How long a burst plays before it is removed — the fall or the rise, plus
 *  its fade. Fixed regardless of `scale`, so a bigger burst reads as more
 *  glyphs and more travel, not a longer wait for them to clear. */
export const IMPACT_DURATION_MS = 900;

const MIN_SCALE = 1;
const MAX_SCALE = 2;
const SCALE_PER_POINT = 0.15;

/**
 * `delta` is assumed non-zero — a change of zero is not a change, and callers
 * only ever spawn a burst for a real one.
 */
export function impactSpec(delta: number): ImpactSpec {
  const magnitude = Math.abs(delta);
  return {
    direction: delta < 0 ? 'loss' : 'gain',
    glyphs: Math.min(MAX_GLYPHS, magnitude),
    scale: Math.min(MAX_SCALE, MIN_SCALE + (magnitude - 1) * SCALE_PER_POINT)
  };
}
