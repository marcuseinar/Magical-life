import { describe, expect, it } from 'vitest';
import { isLethal, lethalReasons, livingPlayers, threatLevel } from './selectors';
import { LETHAL_POISON } from './rules';
import { fold } from './reducer';
import { ANNA, BJORN, commanderConfig, makeLog, seat, started } from '../../tests/support/events';
import type { PlayerState } from './state';

const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: ANNA,
  name: 'Anna',
  colour: 'green',
  life: 40,
  counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
  eliminated: false,
  ...over
});

describe('lethalReasons', () => {
  it('is empty for a healthy player', () => {
    expect(lethalReasons(player())).toEqual([]);
  });

  it('names life at zero', () => {
    expect(lethalReasons(player({ life: 0 }))).toEqual(['life']);
  });

  it('names life below zero', () => {
    expect(lethalReasons(player({ life: -7 }))).toEqual(['life']);
  });

  it('names poison at the threshold', () => {
    const poisoned = player({ counters: { ...player().counters, poison: LETHAL_POISON } });
    expect(lethalReasons(poisoned)).toEqual(['poison']);
  });

  it('does not name poison one short of the threshold', () => {
    const poisoned = player({ counters: { ...player().counters, poison: LETHAL_POISON - 1 } });
    expect(lethalReasons(poisoned)).toEqual([]);
  });

  it('names every reason that applies at once', () => {
    const doomed = player({ life: 0, counters: { ...player().counters, poison: 12 } });
    expect(lethalReasons(doomed)).toEqual(['life', 'poison']);
  });
});

describe('isLethal', () => {
  it('is false while the player is safe', () => {
    expect(isLethal(player())).toBe(false);
  });

  it('is true once any reason applies', () => {
    expect(isLethal(player({ life: 0 }))).toBe(true);
  });
});

describe('threatLevel', () => {
  it('is safe well above the line', () => {
    expect(threatLevel(player({ life: 20 }))).toBe('safe');
  });

  it('warns at five life or below', () => {
    expect(threatLevel(player({ life: 5 }))).toBe('warning');
  });

  it('warns at eight poison', () => {
    expect(threatLevel(player({ counters: { ...player().counters, poison: 8 } }))).toBe('warning');
  });

  it('is lethal at zero life', () => {
    expect(threatLevel(player({ life: 0 }))).toBe('lethal');
  });

  it('is lethal at ten poison even on full life', () => {
    const poisoned = player({ counters: { ...player().counters, poison: LETHAL_POISON } });
    expect(threatLevel(poisoned)).toBe('lethal');
  });
});

describe('livingPlayers', () => {
  it('excludes players who have been declared out', () => {
    const events = makeLog('anna', [
      started(commanderConfig, [seat(ANNA, 'Anna'), seat(BJORN, 'Björn')]),
      { kind: 'player/eliminated', target: ANNA }
    ]);
    const state = fold(events)!;
    expect(livingPlayers(state).map((p) => p.id)).toEqual([BJORN]);
  });
});
