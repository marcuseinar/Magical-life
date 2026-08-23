/** Wall time, injected so the domain stays pure and tests stay deterministic. */
export type Clock = {
  now(): number;
};
