/** Identity, injected so the domain stays pure and tests stay deterministic. */
export type IdSource = {
  next(): string;
};
