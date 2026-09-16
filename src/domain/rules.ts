/** Ten poison counters is lethal wherever infect and toxic are legal. */
export const LETHAL_POISON = 10;

/** Twenty-one combat damage from a single commander, tracked per commander. */
export const LETHAL_COMMANDER_DAMAGE = 21;

/** Long enough for a real name, short enough that a plate stays readable at six
 *  players. Names are trimmed and clamped rather than rejected. */
export const MAX_PLAYER_NAME = 16;

/** The named starting points a setup screen offers. */
export type PresetId = 'commander' | 'standard' | 'twoHeadedGiant' | 'brawl';

/**
 * What a game's settings are called. `'custom'` is not a preset — it is what
 * a game becomes the moment somebody changes one of the controls a preset
 * filled in. It is a label for the config, not the source of it: starting
 * life and commander damage are their own fields on `GameConfig` and always
 * were, which is why widening this changes nothing about how an
 * already-saved game folds.
 */
export type FormatId = PresetId | 'custom';

/** One cap for the app, not one per preset. Six is what the panel layouts
 *  support; a preset limiting the table further was a rule nobody could
 *  predict from a button labelled with a format's name. */
export const MAX_PLAYERS = 6;

export type ManaColour =
  'white' | 'blue' | 'black' | 'red' | 'green' | 'colourless' | 'multicolour';

export type CounterKind = 'poison' | 'energy' | 'experience' | 'rad' | 'ticket';

export type FlagKind = 'monarch' | 'initiative' | 'citysBlessing';

export type Preset = {
  readonly id: PresetId;
  readonly name: string;
  readonly startingLife: number;
  readonly defaultPlayers: number;
  readonly tracksCommanderDamage: boolean;
};

export const PRESETS: Readonly<Record<PresetId, Preset>> = {
  commander: {
    id: 'commander',
    name: 'Commander',
    startingLife: 40,
    defaultPlayers: 4,
    tracksCommanderDamage: true
  },
  standard: {
    id: 'standard',
    name: 'Constructed',
    startingLife: 20,
    defaultPlayers: 2,
    tracksCommanderDamage: false
  },
  // The `id` stays `twoHeadedGiant` for storage stability (it's a value in
  // already-saved games' state), even though the name no longer claims the
  // format: sanctioned Two-Headed Giant's defining rule is that each team of
  // two shares one life total, which this app has no mechanism for — every
  // player still gets their own panel. Calling it that promised a mechanic
  // that isn't here, and commander damage doubly so: vanilla 2HG has no
  // commanders at all, so tracking it (as this used to) invited attributing
  // damage to a source that format doesn't have.
  twoHeadedGiant: {
    id: 'twoHeadedGiant',
    name: 'Multiplayer',
    startingLife: 30,
    defaultPlayers: 2,
    tracksCommanderDamage: false
  },
  brawl: {
    id: 'brawl',
    name: 'Brawl',
    startingLife: 25,
    defaultPlayers: 2,
    tracksCommanderDamage: true
  }
};

export const PRESET_ORDER: readonly PresetId[] = [
  'commander',
  'standard',
  'twoHeadedGiant',
  'brawl'
];

/** The settings a preset fills in. Structurally a `GameConfig` without
 *  importing one, since `state.ts` already imports from here. */
export const presetConfig = (id: PresetId) => ({
  format: id,
  startingLife: PRESETS[id].startingLife,
  tracksCommanderDamage: PRESETS[id].tracksCommanderDamage
});

const isPreset = (id: FormatId): id is PresetId => id !== 'custom';

/** What to call a game's settings. A screen reader announces this in the
 *  heading, so every id a stored game could carry needs an answer. */
export const formatName = (id: FormatId): string => (isPreset(id) ? PRESETS[id].name : 'Custom');

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
