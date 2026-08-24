import type { GameEvent } from './events';
import type { EventId, PlayerId } from './ids';
import { COUNTER_KINDS, FLAG_KINDS } from './rules';
import type { CounterKind, FlagKind } from './rules';
import type { GameState, PlayerSeat, PlayerState } from './state';

const zeroCounters = (): Record<CounterKind, number> =>
  Object.fromEntries(COUNTER_KINDS.map((kind) => [kind, 0])) as Record<CounterKind, number>;

const noFlagHolders = (): Record<FlagKind, PlayerId | null> =>
  Object.fromEntries(FLAG_KINDS.map((flag) => [flag, null])) as Record<FlagKind, PlayerId | null>;

const seatPlayer = (seat: PlayerSeat, life: number): PlayerState => ({
  ...seat,
  life,
  counters: zeroCounters(),
  eliminated: false
});

/** Apply `change` to the named player and leave everyone else exactly as they were. */
const mapPlayer = (
  state: GameState,
  target: PlayerId,
  change: (player: PlayerState) => PlayerState
): GameState => {
  const index = state.players.findIndex((player) => player.id === target);
  if (index === -1) return state;

  const players = [...state.players];
  players[index] = change(players[index]!);
  return { ...state, players };
};

/**
 * The single place a game's state is allowed to change.
 *
 * Pure and total: an event it cannot apply leaves the state untouched rather
 * than throwing, because a peer may legitimately send an event about a player
 * we have not seated yet.
 */
export function reduce(state: GameState | null, event: GameEvent): GameState | null {
  if (event.kind === 'game/started') {
    return {
      config: event.config,
      players: event.players.map((seat) => seatPlayer(seat, event.config.startingLife)),
      flags: noFlagHolders(),
      firstPlayer: null,
      ended: false,
      winner: null
    };
  }

  if (state === null) return null;

  switch (event.kind) {
    case 'life/changed':
      return mapPlayer(state, event.target, (player) => ({
        ...player,
        life: player.life + event.delta
      }));

    case 'counter/changed':
      return mapPlayer(state, event.target, (player) => ({
        ...player,
        counters: {
          ...player.counters,
          // You cannot have minus one poison.
          [event.counter]: Math.max(0, player.counters[event.counter] + event.delta)
        }
      }));

    case 'flag/moved':
      return { ...state, flags: { ...state.flags, [event.flag]: event.to } };

    case 'turn/firstPlayer':
      return state.players.some((player) => player.id === event.target)
        ? { ...state, firstPlayer: event.target }
        : state;

    case 'player/eliminated':
      return mapPlayer(state, event.target, (player) => ({ ...player, eliminated: true }));

    case 'player/restored':
      return mapPlayer(state, event.target, (player) => ({ ...player, eliminated: false }));

    case 'game/ended':
      return { ...state, ended: true, winner: event.winner };

    case 'event/retracted':
      // Retraction is resolved by `fold` before any event is applied.
      return state;
  }
}

/**
 * Total order across every device: Lamport clock first, then author to break
 * ties, then sequence. Two peers holding the same events always agree.
 */
const compare = (a: GameEvent, b: GameEvent): number =>
  a.lamport - b.lamport ||
  (a.authorId < b.authorId ? -1 : a.authorId > b.authorId ? 1 : 0) ||
  a.seq - b.seq;

export function orderEvents(events: readonly GameEvent[]): GameEvent[] {
  const unique = new Map<EventId, GameEvent>();
  for (const event of events) unique.set(event.id, event);
  return [...unique.values()].sort(compare);
}

/**
 * The state is the fold of the log. Nothing else is durable.
 *
 * A retraction removes its target from the history entirely, so the result is
 * identical to that event never having been appended. Retractions themselves
 * cannot be retracted — redo is a new forward event, which keeps this total
 * and avoids a fixpoint nobody needs.
 */
export function fold(events: readonly GameEvent[]): GameState | null {
  const ordered = orderEvents(events);

  const retracted = new Set<EventId>();
  for (const event of ordered) {
    if (event.kind === 'event/retracted') retracted.add(event.retracts);
  }

  let state: GameState | null = null;
  for (const event of ordered) {
    if (retracted.has(event.id)) continue;
    state = reduce(state, event);
  }
  return state;
}
