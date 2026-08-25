import { LETHAL_COMMANDER_DAMAGE, LETHAL_POISON } from './rules';
import type { PlayerId } from './ids';
import type { GameState, PlayerState } from './state';

export type LethalReason = 'life' | 'poison' | 'commander';

/** How close a player is to losing, for the UI to render. Near-lethal is near-lethal
 *  whatever the mechanism, so poison and life share one scale. */
export type ThreatLevel = 'safe' | 'warning' | 'lethal';

const WARNING_LIFE = 5;
const WARNING_POISON = LETHAL_POISON - 2;
const WARNING_COMMANDER = LETHAL_COMMANDER_DAMAGE - 4;

/** Damage taken from one commander. */
export const commanderDamageFrom = (player: PlayerState, from: PlayerId): number =>
  player.commanderDamage[from] ?? 0;

/** The worst single commander, which is what the twenty-one is measured against —
 *  never the total across attackers. */
export const highestCommanderDamage = (player: PlayerState): number =>
  Object.values(player.commanderDamage).reduce((worst, total) => Math.max(worst, total), 0);

export function lethalReasons(player: PlayerState): LethalReason[] {
  const reasons: LethalReason[] = [];
  if (player.life <= 0) reasons.push('life');
  if (player.counters.poison >= LETHAL_POISON) reasons.push('poison');
  if (highestCommanderDamage(player) >= LETHAL_COMMANDER_DAMAGE) reasons.push('commander');
  return reasons;
}

export const isLethal = (player: PlayerState): boolean => lethalReasons(player).length > 0;

export function threatLevel(player: PlayerState): ThreatLevel {
  if (isLethal(player)) return 'lethal';
  if (
    player.life <= WARNING_LIFE ||
    player.counters.poison >= WARNING_POISON ||
    highestCommanderDamage(player) >= WARNING_COMMANDER
  ) {
    return 'warning';
  }
  return 'safe';
}

export const livingPlayers = (state: GameState): readonly PlayerState[] =>
  state.players.filter((player) => !player.eliminated);
