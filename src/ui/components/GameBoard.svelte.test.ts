import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
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
  eliminated: false
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
});
