declare const brand: unique symbol;

/** Nominal typing, so a PlayerId can never be passed where an EventId belongs. */
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PlayerId = Brand<string, 'PlayerId'>;
export type EventId = Brand<string, 'EventId'>;

export const playerId = (value: string): PlayerId => value as PlayerId;
export const eventId = (value: string): EventId => value as EventId;
