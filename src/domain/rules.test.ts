import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, PRESETS, PRESET_ORDER, formatName } from './rules';

describe('presets', () => {
  it('offers every preset in the order the setup screen shows them', () => {
    expect(PRESET_ORDER).toEqual(['commander', 'standard', 'twoHeadedGiant', 'brawl']);
    for (const id of PRESET_ORDER) expect(PRESETS[id].id).toBe(id);
  });

  /*
   * The cap used to be per format, so picking Brawl silently limited the
   * table to four while Constructed allowed six — a rule nobody could
   * predict from the button. It is one number now: what the panel layouts
   * actually support.
   */
  it('caps the table once, for the whole app, rather than per preset', () => {
    expect(MAX_PLAYERS).toBe(6);
    for (const id of PRESET_ORDER) {
      expect(PRESETS[id].defaultPlayers, id).toBeLessThanOrEqual(MAX_PLAYERS);
    }
  });

  it('starts every preset somewhere a real game starts', () => {
    expect(PRESETS.commander.startingLife).toBe(40);
    expect(PRESETS.standard.startingLife).toBe(20);
    expect(PRESETS.twoHeadedGiant.startingLife).toBe(30);
    expect(PRESETS.brawl.startingLife).toBe(25);
  });

  it('tracks commander damage only where commanders exist', () => {
    expect(PRESETS.commander.tracksCommanderDamage).toBe(true);
    expect(PRESETS.brawl.tracksCommanderDamage).toBe(true);
    expect(PRESETS.standard.tracksCommanderDamage).toBe(false);
    expect(PRESETS.twoHeadedGiant.tracksCommanderDamage).toBe(false);
  });
});

describe('naming a config', () => {
  it('names a preset by its own name', () => {
    expect(formatName('commander')).toBe('Commander');
    expect(formatName('twoHeadedGiant')).toBe('Multiplayer');
  });

  /*
   * A game whose settings were touched is not any of the presets, and
   * pretending otherwise is the thing this whole change is about. It still
   * needs a name: the heading a screen reader reads announces it.
   */
  it('names a game that is none of them', () => {
    expect(formatName('custom')).toBe('Custom');
  });

  /* Games stored before this change carry a preset id and must keep reading
     the way they always did. */
  it('still names every id an already-saved game could be carrying', () => {
    for (const id of PRESET_ORDER) expect(formatName(id)).toBe(PRESETS[id].name);
  });
});
