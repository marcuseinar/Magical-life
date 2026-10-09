import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import GameSummarySheet from './GameSummarySheet.svelte';
import { eventId, playerId } from '$domain/ids';
import type { GameSummary } from '$domain/summary';
import type { PlayerState } from '$domain/state';

const ANNA = playerId('anna');
const BJORN = playerId('bjorn');
const CARA = playerId('cara');

const player = (id: typeof ANNA, name: string): PlayerState => ({
  id,
  name,
  colour: 'green',
  life: 40,
  counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
  commanderDamage: {},
  eliminated: false,
  claimed: false
});

const players = [player(ANNA, 'Anna'), player(BJORN, 'Björn'), player(CARA, 'Cara')];

const MINUTE = 60_000;

const summary = (over: Partial<GameSummary> = {}): GameSummary => ({
  winner: ANNA,
  placings: [
    { player: ANNA, place: 1, reasons: [], worstCommander: { from: CARA, damage: 6 } },
    {
      player: CARA,
      place: 2,
      reasons: ['life', 'commander'],
      worstCommander: { from: ANNA, damage: 21 }
    },
    { player: BJORN, place: 3, reasons: ['poison'], worstCommander: { from: CARA, damage: 9 } }
  ],
  endedBy: eventId('host:9'),
  startedAt: 0,
  endedAt: 47 * MINUTE,
  ...over
});

const mount = (over: Partial<GameSummary> = {}) => {
  const callbacks = { onrematch: vi.fn(), onnewgame: vi.fn(), onclose: vi.fn() };
  render(GameSummarySheet, { props: { summary: summary(over), players, ...callbacks } });
  return callbacks;
};

describe('game summary', () => {
  it('announces the winner', () => {
    mount();
    expect(screen.getByRole('dialog', { name: 'Anna wins' })).toBeInTheDocument();
  });

  it('says so when nobody was left standing', () => {
    mount({ winner: null });
    expect(screen.getByRole('dialog', { name: 'No winner' })).toBeInTheDocument();
  });

  it('places everyone best first', () => {
    mount();
    const rows = within(screen.getByRole('list', { name: 'Placings' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringMatching(/^1st Anna/),
      expect.stringMatching(/^2nd Cara/),
      expect.stringMatching(/^3rd Björn/)
    ]);
  });

  /* Commander damage is the most telling cause — a player on zero life with
     twenty-one from one commander died to the commander, not to "life". */
  it('says what took each player out, commander damage first', () => {
    mount();
    expect(screen.getByText('21 commander damage from Anna')).toBeInTheDocument();
    expect(screen.getByText(/^Poison/)).toBeInTheDocument();
  });

  it('names the commander that hit hardest even when it was not the cause', () => {
    mount();
    expect(screen.getByText(/^Poison · 9 commander damage from Cara/)).toBeInTheDocument();
    expect(screen.getByText(/^Winner · 6 commander damage from Cara/)).toBeInTheDocument();
  });

  it('says how long the game took', () => {
    mount();
    expect(screen.getByText('47 min')).toBeInTheDocument();
  });

  it('counts a long game in hours', () => {
    mount({ endedAt: 83 * MINUTE });
    expect(screen.getByText('1 h 23 min')).toBeInTheDocument();
  });

  it('does not claim a game took no time at all', () => {
    mount({ endedAt: 20_000 });
    expect(screen.getByText('Under a minute')).toBeInTheDocument();
  });

  it('offers a rematch, a new game, or the board back', async () => {
    const { onrematch, onnewgame, onclose } = mount();

    await fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    await fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Back to the board' }));

    expect(onrematch).toHaveBeenCalledOnce();
    expect(onnewgame).toHaveBeenCalledOnce();
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', async () => {
    const { onclose } = mount();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
  });
});
