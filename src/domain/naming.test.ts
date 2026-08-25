import { describe, expect, it } from 'vitest';
import { fold } from './reducer';
import { ANNA, BJORN, commanderConfig, makeLog, seat, started } from '../../tests/support/events';
import { playerId } from './ids';

const seats = [seat(ANNA, 'Player 1'), seat(BJORN, 'Player 2')];

const newGame = (bodies: Parameters<typeof makeLog>[1] = []) =>
  makeLog('host', [started(commanderConfig, seats), ...bodies]);

const names = (bodies: Parameters<typeof makeLog>[1]) =>
  fold(newGame(bodies))!.players.map((player) => player.name);

describe('renaming a player', () => {
  it('starts with the name they were seated under', () => {
    expect(names([])).toEqual(['Player 1', 'Player 2']);
  });

  it('changes only the player named', () => {
    expect(names([{ kind: 'player/renamed', target: ANNA, name: 'Marcus' }])).toEqual([
      'Marcus',
      'Player 2'
    ]);
  });

  it('can be changed again', () => {
    expect(
      names([
        { kind: 'player/renamed', target: ANNA, name: 'Marcus' },
        { kind: 'player/renamed', target: ANNA, name: 'Anna' }
      ])
    ).toEqual(['Anna', 'Player 2']);
  });

  it('ignores a player who is not in the game', () => {
    expect(names([{ kind: 'player/renamed', target: playerId('ghost'), name: 'Nobody' }])).toEqual([
      'Player 1',
      'Player 2'
    ]);
  });

  it('survives into a rematch, because it is the same people playing again', () => {
    // A rematch reseats the same players, carrying whatever they are called now.
    const renamed = fold(newGame([{ kind: 'player/renamed', target: ANNA, name: 'Marcus' }]))!;
    const again = fold([
      ...newGame([{ kind: 'player/renamed', target: ANNA, name: 'Marcus' }]),
      ...makeLog(
        'host',
        [
          started(
            commanderConfig,
            renamed.players.map(({ id, name, colour }) => ({ id, name, colour }))
          )
        ],
        100
      )
    ])!;
    expect(again.players.map((p) => p.name)).toEqual(['Marcus', 'Player 2']);
  });

  it('is undone by retracting it, like anything else in the log', () => {
    const events = [
      ...newGame([{ kind: 'player/renamed', target: ANNA, name: 'Marcus' }]),
      ...makeLog('host', [{ kind: 'event/retracted', retracts: 'host:1' as never }], 50)
    ];
    expect(fold(events)!.players.map((p) => p.name)).toEqual(['Player 1', 'Player 2']);
  });
});
