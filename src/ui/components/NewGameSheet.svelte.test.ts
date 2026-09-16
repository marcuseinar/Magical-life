import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import NewGameSheet from './NewGameSheet.svelte';

const mount = () => {
  const onstart = vi.fn();
  render(NewGameSheet, { props: { onstart } });
  return { onstart };
};

describe('new game sheet', () => {
  it('opens on Commander, because that is what most tables are playing', () => {
    mount();
    expect(screen.getByRole('button', { name: /commander/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /begin at 40/i })).toBeInTheDocument();
  });

  it('changes the starting life with the format', async () => {
    mount();
    await fireEvent.click(screen.getByRole('button', { name: /constructed/i }));
    expect(screen.getByRole('button', { name: /begin at 20/i })).toBeInTheDocument();
  });

  it('falls back to the format default player count when the format changes', async () => {
    const { onstart } = mount();
    // Commander opens on four; Constructed should not inherit that.
    await fireEvent.click(screen.getByRole('button', { name: /constructed/i }));
    await fireEvent.click(screen.getByRole('button', { name: /begin at 20/i }));

    expect(onstart.mock.calls[0]![1]).toHaveLength(2);
  });

  it('starts a game with the chosen format and seats', async () => {
    const { onstart } = mount();
    await fireEvent.click(screen.getByRole('button', { name: '3' }));
    await fireEvent.click(screen.getByRole('button', { name: /begin at 40/i }));

    expect(onstart).toHaveBeenCalledWith('commander', [
      { name: 'Player 1', colour: 'white' },
      { name: 'Player 2', colour: 'blue' },
      { name: 'Player 3', colour: 'black' }
    ]);
  });

  /* The row of badges that attributes commander damage identifies people by
     colour, so two seats sharing one makes it unanswerable. Cycling five
     colours meant Player 6 was another white; there are seven to draw on. */
  it('gives every seat a colour of its own, at every size a table comes in', async () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const { onstart } = mount();
      await fireEvent.click(screen.getByRole('button', { name: String(count) }));
      await fireEvent.click(screen.getByRole('button', { name: /begin at 40/i }));

      const colours = (onstart.mock.calls[0]![1] as { colour: string }[]).map(
        (seat) => seat.colour
      );
      expect(colours, `${count} players`).toHaveLength(count);
      expect(new Set(colours).size, `${count} players`).toBe(count);
      cleanup();
    }
  });

  it('never offers more seats than the format allows', async () => {
    mount();
    await fireEvent.click(screen.getByRole('button', { name: /multiplayer/i }));
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
  });

  /*
   * The sheet is a screen now, not the thing that appears when there is no
   * game (ADR 0005). So it has to be leaveable, and it has to know that the
   * people on the other side of it already exist.
   */
  describe('opened over a game that is still running', () => {
    const existing = [
      { id: 'a' as never, name: 'Anna', colour: 'green' as const },
      { id: 'b' as never, name: 'Björn', colour: 'red' as const }
    ];

    it('offers a way back to the game it was opened from', async () => {
      const onback = vi.fn();
      render(NewGameSheet, { props: { onstart: vi.fn(), onback } });
      await fireEvent.click(screen.getByRole('button', { name: /back to the game/i }));
      expect(onback).toHaveBeenCalledOnce();
    });

    it('has no way back when there is no game behind it', () => {
      render(NewGameSheet, { props: { onstart: vi.fn() } });
      expect(screen.queryByRole('button', { name: /back to the game/i })).not.toBeInTheDocument();
    });

    it('carries the existing seats through, so a reconfigure is not a reintroduction', async () => {
      const onstart = vi.fn();
      render(NewGameSheet, { props: { onstart, existing } });

      await fireEvent.click(screen.getByRole('button', { name: '2' }));
      await fireEvent.click(screen.getByRole('button', { name: /begin at/i }));

      expect(onstart.mock.calls[0]![1]).toEqual(existing);
    });

    it('mints only the seats the existing table does not already have', async () => {
      const onstart = vi.fn();
      render(NewGameSheet, { props: { onstart, existing } });

      await fireEvent.click(screen.getByRole('button', { name: '4' }));
      await fireEvent.click(screen.getByRole('button', { name: /begin at/i }));

      const seats = onstart.mock.calls[0]![1] as { id?: string; name: string }[];
      expect(seats).toHaveLength(4);
      expect(seats.slice(0, 2)).toEqual(existing);
      expect(seats[2]?.id).toBeUndefined();
      expect(seats[3]?.id).toBeUndefined();
    });

    it('opens on the size of the table it was opened from', () => {
      render(NewGameSheet, { props: { onstart: vi.fn(), existing } });
      expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
