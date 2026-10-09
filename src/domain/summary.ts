import type { GameEvent } from './events';
import type { EventId, PlayerId } from './ids';
import { appliedEvents, reduce } from './reducer';
import { lethalReasons, livingPlayers } from './selectors';
import type { LethalReason } from './selectors';
import type { GameState, PlayerState } from './state';

export type CommanderHit = { readonly from: PlayerId; readonly damage: number };

export type Placing = {
  readonly player: PlayerId;
  /** 1 is the winner, or the last one out if nobody was left standing. */
  readonly place: number;
  /** What made them lethal when they went out. Empty for whoever is still in. */
  readonly reasons: readonly LethalReason[];
  /** The commander that dealt them the most, if any dealt them anything. */
  readonly worstCommander: CommanderHit | null;
};

export type GameSummary = {
  readonly winner: PlayerId | null;
  /** Best first. */
  readonly placings: readonly Placing[];
  /** The elimination that ended the game — one summary per ending. */
  readonly endedBy: EventId;
  /** Device clock time, for showing a game length and nothing else. */
  readonly startedAt: number;
  readonly endedAt: number;
};

const isOver = (state: GameState): boolean =>
  state.players.length > 1 && livingPlayers(state).length <= 1;

const worstCommander = (player: PlayerState): CommanderHit | null =>
  Object.entries(player.commanderDamage).reduce<CommanderHit | null>(
    (worst, [from, damage]) =>
      damage > (worst?.damage ?? 0) ? { from: from as PlayerId, damage } : worst,
    null
  );

/**
 * How the game on screen ended, or `null` while it is still being played.
 *
 * Derived from the log rather than recorded as `game/ended`: being out is
 * declared and can be walked back ("Back in", or Undo), and a game whose end
 * is a fact in the log would have to have that fact retracted too. Folding
 * it instead means the game is over exactly while the eliminations say so.
 */
export function summariseGame(events: readonly GameEvent[]): GameSummary | null {
  let state: GameState | null = null;
  let startedAt = 0;
  let ending: { id: EventId; at: number } | null = null;
  /** Insertion order is elimination order; going out again moves a player to the end. */
  let outs = new Map<PlayerId, readonly LethalReason[]>();

  for (const event of appliedEvents(events)) {
    state = reduce(state, event);
    if (state === null) continue;

    if (event.kind === 'game/started') {
      startedAt = event.at;
      ending = null;
      outs = new Map();
    }

    const target = 'target' in event ? event.target : null;
    const player = state.players.find((candidate) => candidate.id === target);
    if (event.kind === 'player/eliminated' && player !== undefined) {
      outs.delete(player.id);
      outs.set(player.id, lethalReasons(player));
    }
    if (event.kind === 'player/restored') outs.delete(event.target);

    if (!isOver(state)) ending = null;
    else ending ??= { id: event.id, at: event.at };
  }

  if (state === null || ending === null) return null;
  const final = state;

  const winner = livingPlayers(final)[0]?.id ?? null;
  const order = [...(winner === null ? [] : [winner]), ...[...outs.keys()].reverse()];
  const placings = order.map((id, index) => ({
    player: id,
    place: index + 1,
    reasons: outs.get(id) ?? [],
    worstCommander: worstCommander(final.players.find((player) => player.id === id)!)
  }));

  return { winner, placings, endedBy: ending.id, startedAt, endedAt: ending.at };
}
