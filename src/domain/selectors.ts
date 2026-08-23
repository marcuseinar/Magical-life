import { LETHAL_POISON } from './rules';
import type { GameState, PlayerState } from './state';

export type LethalReason = 'life' | 'poison';

/** How close a player is to losing, for the UI to render. Near-lethal is near-lethal
 *  whatever the mechanism, so poison and life share one scale. */
export type ThreatLevel = 'safe' | 'warning' | 'lethal';

const WARNING_LIFE = 5;
const WARNING_POISON = LETHAL_POISON - 2;

/**
 * Every reason this player has currently lost, in a stable order.
 *
 * This is a statement about the board, not a decision: players sit at zero life
 * for a moment while a replacement effect resolves, so declaring them out is an
 * explicit act (`player/eliminated`), never something derived state does for them.
 */
export function lethalReasons(player: PlayerState): LethalReason[] {
  const reasons: LethalReason[] = [];
  if (player.life <= 0) reasons.push('life');
  if (player.counters.poison >= LETHAL_POISON) reasons.push('poison');
  return reasons;
}

export const isLethal = (player: PlayerState): boolean => lethalReasons(player).length > 0;

export function threatLevel(player: PlayerState): ThreatLevel {
  if (isLethal(player)) return 'lethal';
  if (player.life <= WARNING_LIFE || player.counters.poison >= WARNING_POISON) return 'warning';
  return 'safe';
}

export const livingPlayers = (state: GameState): readonly PlayerState[] =>
  state.players.filter((player) => !player.eliminated);
