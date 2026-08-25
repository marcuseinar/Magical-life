/** Ten poison counters is lethal wherever infect and toxic are legal. */
export const LETHAL_POISON = 10;

/** Twenty-one combat damage from a single commander, tracked per commander. */
export const LETHAL_COMMANDER_DAMAGE = 21;

/** Long enough for a real name, short enough that a plate stays readable at six
 *  players. Names are trimmed and clamped rather than rejected. */
export const MAX_PLAYER_NAME = 16;

export type FormatId = 'commander' | 'standard' | 'twoHeadedGiant' | 'brawl';

export type ManaColour =
  'white' | 'blue' | 'black' | 'red' | 'green' | 'colourless' | 'multicolour';

export type CounterKind = 'poison' | 'energy' | 'experience' | 'rad' | 'ticket';

export type FlagKind = 'monarch' | 'initiative' | 'citysBlessing';

export type Format = {
  readonly id: FormatId;
  readonly name: string;
  readonly startingLife: number;
  readonly defaultPlayers: number;
  readonly maxPlayers: number;
  readonly tracksCommanderDamage: boolean;
};

export const FORMATS: Readonly<Record<FormatId, Format>> = {
  commander: {
    id: 'commander',
    name: 'Commander',
    startingLife: 40,
    defaultPlayers: 4,
    maxPlayers: 6,
    tracksCommanderDamage: true
  },
  standard: {
    id: 'standard',
    name: 'Constructed',
    startingLife: 20,
    defaultPlayers: 2,
    maxPlayers: 6,
    tracksCommanderDamage: false
  },
  twoHeadedGiant: {
    id: 'twoHeadedGiant',
    name: 'Two-Headed Giant',
    startingLife: 30,
    defaultPlayers: 2,
    maxPlayers: 4,
    tracksCommanderDamage: true
  },
  brawl: {
    id: 'brawl',
    name: 'Brawl',
    startingLife: 25,
    defaultPlayers: 2,
    maxPlayers: 4,
    tracksCommanderDamage: true
  }
};

export const FORMAT_ORDER: readonly FormatId[] = [
  'commander',
  'standard',
  'twoHeadedGiant',
  'brawl'
];

export const COUNTER_KINDS: readonly CounterKind[] = [
  'poison',
  'energy',
  'experience',
  'rad',
  'ticket'
];

export const FLAG_KINDS: readonly FlagKind[] = ['monarch', 'initiative', 'citysBlessing'];

export const MANA_COLOURS: readonly ManaColour[] = [
  'white',
  'blue',
  'black',
  'red',
  'green',
  'colourless',
  'multicolour'
];
