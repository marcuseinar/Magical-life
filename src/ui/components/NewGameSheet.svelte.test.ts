import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
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

  it('never offers more seats than the format allows', async () => {
    mount();
    await fireEvent.click(screen.getByRole('button', { name: /two-headed giant/i }));
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
  });
});
