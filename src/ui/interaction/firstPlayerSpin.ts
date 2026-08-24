/**
 * The spotlight that travels round the table before settling on whoever is
 * going first.
 *
 * The winner is decided by the use case *before* any of this runs and is already
 * in the event log; this only decides how the answer is revealed. Keeping the
 * two apart is what stops the drama from being able to change the result.
 *
 * Pure: no timers, no randomness. The controller supplies the clock.
 */

/** How long the whole reveal takes. Long enough to be a moment, short enough to
 *  sit through before every game. */
export const SPIN_MS = 2200;

/** Full passes round the table before the run-in to the winner. */
const CYCLES = 2;

/** Higher means a sharper slow-down at the end. */
const DECELERATION = 2.4;

export type SpinStep = {
  /** Seat to highlight. */
  readonly index: number;
  /** How long to hold it before moving on. */
  readonly delayMs: number;
};

export type SpinOptions = {
  readonly reducedMotion?: boolean;
};

/**
 * A schedule of highlights ending on `chosenIndex`.
 *
 * Total duration is fixed, so the length of the spin never hints at who won —
 * the delays are distributed across however many steps the seat count requires.
 */
export function firstPlayerSpin(
  count: number,
  chosenIndex: number,
  { reducedMotion = false }: SpinOptions = {}
): SpinStep[] {
  const seats = Math.max(1, Math.floor(count));
  const target = Math.min(Math.max(0, Math.floor(chosenIndex)), seats - 1);

  // Nothing to travel between, and nobody who wants motion should be made to sit
  // through it.
  if (seats === 1 || reducedMotion) return [{ index: target, delayMs: 0 }];

  // Land on the target by construction: step k highlights seat k % seats, and
  // the final step is chosen so that it comes out at the target.
  const steps = CYCLES * seats + target + 1;

  const weights = Array.from({ length: steps }, (_, k) => (k + 1) ** DECELERATION);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return weights.map((weight, k) => ({
    index: k % seats,
    delayMs: (SPIN_MS * weight) / totalWeight
  }));
}
