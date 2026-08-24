/**
 * Randomness, injected so `domain/` stays pure and tests stay deterministic.
 * Returns a number in [0, 1), the same contract as `Math.random`.
 */
export type Rng = {
  next(): number;
};
