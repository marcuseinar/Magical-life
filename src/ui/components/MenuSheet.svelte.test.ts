import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MenuSheet from './MenuSheet.svelte';

const mount = () => {
  const props = {
    onrematch: vi.fn(),
    onnewgame: vi.fn(),
    onjoin: vi.fn(),
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

  /*
   * Joining used to be reachable only from setup's "Join a table instead",
   * which means only from a device with no game — so a player already
   * counting their own life had no way to it at all.
   */
  it("offers joining someone else's table, not just hosting one", async () => {
    const { onjoin } = mount();
    await fireEvent.click(screen.getByRole('button', { name: 'Join a table' }));
    expect(onjoin).toHaveBeenCalledOnce();
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
