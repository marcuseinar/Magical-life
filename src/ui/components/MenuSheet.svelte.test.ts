import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MenuSheet from './MenuSheet.svelte';

const mount = () => {
  const props = {
    onrematch: vi.fn(),
    onnewgame: vi.fn(),
    onsettings: vi.fn(),
    onclose: vi.fn()
  };
  render(MenuSheet, { props });
  return props;
};

describe('menu sheet', () => {
  it('offers the once-per-game actions that no longer need toolbar space', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('is a dialog, so a screen reader knows the game behind it is not the subject', () => {
    mount();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  /*
   * New game is navigation now, not demolition (ADR 0005) — the game is still
   * in the log while setup is open. A confirm would be asking permission for
   * something that has not happened and can be walked back from.
   */
  it('asks nothing before going to setup, because nothing is destroyed by going there', async () => {
    const { onnewgame } = mount();
    await fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(onnewgame).toHaveBeenCalledOnce();
  });

  it('closes on Escape rather than trapping a player in a menu', async () => {
    const { onclose } = mount();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
  });
});
