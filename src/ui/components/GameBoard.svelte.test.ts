import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import GameBoard from './GameBoard.svelte';
import { playerId } from '$domain/ids';
import { MANA_COLOURS } from '$domain/rules';
import type { PlayerState } from '$domain/state';

const seat = (index: number): PlayerState => ({
  id: playerId(`p${index}`),
  name: `Player ${index + 1}`,
  colour: MANA_COLOURS[index % 5]!,
  life: 40,
  counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
  commanderDamage: {},
  eliminated: false,
  claimed: false
});

const mount = (count: number) => {
  const { container } = render(GameBoard, {
    props: {
      players: Array.from({ length: count }, (_, index) => seat(index)),
      onLifeChange: vi.fn(),
      onOpenCounters: vi.fn(),
      onOpenCommander: vi.fn(),
      onRename: vi.fn(),
      onElimination: vi.fn()
    }
  });
  return container;
};

const panels = (container: HTMLElement) => [...container.querySelectorAll('article')];

describe('game board', () => {
  it.each([1, 2, 3, 4, 5, 6])('seats %i players', (count) => {
    const container = mount(count);
    expect(screen.getAllByRole('heading')).toHaveLength(count);
    expect(panels(container)).toHaveLength(count);
  });

  it('leaves a solo player the right way up', () => {
    const container = mount(1);
    expect(panels(container)[0]?.dataset.rotated).toBe('false');
  });

  it('turns the opposing panel around for two players', () => {
    const container = mount(2);
    expect(panels(container).map((p) => p.dataset.rotated)).toEqual(['true', 'false']);
  });

  it('turns the whole top row around for a four-player pod', () => {
    const container = mount(4);
    expect(panels(container).map((p) => p.dataset.rotated)).toEqual([
      'true',
      'true',
      'false',
      'false'
    ]);
  });

  it('gives the odd player out the full width rather than leaving a hole', () => {
    const container = mount(5);
    const spans = [...container.querySelectorAll('.cell')].map(
      (cell) => (cell as HTMLElement).dataset.span
    );
    expect(spans).toEqual(['false', 'false', 'false', 'false', 'true']);
  });

  it('gives each player their own colour identity', () => {
    const container = mount(4);
    const colours = panels(container).map((p) => p.dataset.colour);
    expect(new Set(colours).size).toBe(4);
  });

  it('locks nobody while no table is connected', () => {
    const container = mount(2);
    expect(panels(container).map((p) => p.dataset.locked)).toEqual(['false', 'false']);
  });

  it('locks every seat this device is not in localSeatIds for', () => {
    const players = Array.from({ length: 3 }, (_, index) => seat(index));
    const { container } = render(GameBoard, {
      props: {
        players,
        localSeatIds: new Set([players[1]!.id]),
        onLifeChange: vi.fn(),
        onOpenCounters: vi.fn(),
        onOpenCommander: vi.fn(),
        onRename: vi.fn(),
        onElimination: vi.fn()
      }
    });
    expect(panels(container).map((p) => p.dataset.locked)).toEqual(['true', 'false', 'true']);
  });

  it('offers every seat for commander-damage attribution, even one with no panel of its own', async () => {
    const players = [seat(0)];
    const everyone = [seat(0), seat(1)];
    render(GameBoard, {
      props: {
        players,
        seats: everyone,
        tracksCommanderDamage: true,
        onLifeChange: vi.fn(),
        onOpenCounters: vi.fn(),
        onOpenCommander: vi.fn(),
        onRename: vi.fn(),
        onElimination: vi.fn()
      }
    });

    const zone = screen.getByRole('button', { name: 'Player 1, lose one life' });
    await fireEvent.pointerDown(zone, { pointerId: 1, pointerType: 'touch', button: 0 });
    await fireEvent.pointerUp(zone, { pointerId: 1, pointerType: 'touch' });

    // Player 2 has no panel on this board at all, but their commander could
    // still have dealt the damage — so they must still be an option.
    expect(screen.getByRole('button', { name: /player 2's commander/i })).toBeInTheDocument();
  });
});
