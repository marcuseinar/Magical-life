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
    await fireEvent.click(screen.getByRole('button', { name: /two-headed giant/i }));
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
  });
});
