import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import NewGameSheet from './NewGameSheet.svelte';
import type { GameConfig } from '$domain/state';

const mount = (props: Record<string, unknown> = {}) => {
  const onstart = vi.fn();
  render(NewGameSheet, { props: { onstart, ...props } });
  return { onstart };
};

const configOf = (onstart: ReturnType<typeof vi.fn>) => onstart.mock.calls[0]![0] as GameConfig;
const seatsOf = (onstart: ReturnType<typeof vi.fn>) =>
  onstart.mock.calls[0]![1] as { id?: string; name: string; colour: string }[];

const begin = () => screen.getByRole('button', { name: /begin at/i });
const life = () => screen.getByRole('spinbutton', { name: /starting life/i });
const players = () => screen.getByRole('spinbutton', { name: /players/i });
const commanderDamage = () => screen.getByRole('switch', { name: /commander damage/i });

describe('new game sheet', () => {
  it('opens on Commander, because that is what most tables are playing', () => {
    mount();
    expect(screen.getByRole('button', { name: /commander/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(life()).toHaveValue(40);
    expect(players()).toHaveValue(4);
    expect(commanderDamage()).toHaveAttribute('aria-checked', 'true');
  });

  it('fills the controls in from whichever preset is tapped', async () => {
    mount();
    await fireEvent.click(screen.getByRole('button', { name: /constructed/i }));

    expect(life()).toHaveValue(20);
    expect(players()).toHaveValue(2);
    expect(commanderDamage()).toHaveAttribute('aria-checked', 'false');
    expect(begin()).toHaveTextContent(/begin at 20/i);
  });

  /*
   * The point of the whole change: the controls are what a game runs on, and
   * a preset is a way of filling them in. Touching one means this is no
   * longer that preset, and the app should stop claiming it is.
   */
  it('stops claiming a preset the moment a control is touched', async () => {
    const { onstart } = mount();
    await fireEvent.click(screen.getByRole('button', { name: /raise starting life/i }));

    expect(screen.getByRole('button', { name: /commander/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await fireEvent.click(begin());
    expect(configOf(onstart)).toEqual({
      format: 'custom',
      startingLife: 41,
      tracksCommanderDamage: true
    });
  });

  it('records the preset when nothing was touched, so the game can say what it is', async () => {
    const { onstart } = mount();
    await fireEvent.click(screen.getByRole('button', { name: /brawl/i }));
    await fireEvent.click(begin());

    expect(configOf(onstart)).toEqual({
      format: 'brawl',
      startingLife: 25,
      tracksCommanderDamage: true
    });
  });

  it('starts at any life a table asks for, not only the ones with names', async () => {
    const { onstart } = mount();
    await fireEvent.input(life(), { target: { value: '13' } });
    await fireEvent.click(begin());

    expect(configOf(onstart).startingLife).toBe(13);
  });

  it('refuses a starting life that is not a life total', async () => {
    mount();
    await fireEvent.input(life(), { target: { value: '0' } });
    expect(begin()).toBeDisabled();

    await fireEvent.input(life(), { target: { value: '20' } });
    expect(begin()).toBeEnabled();
  });

  it('turns commander damage on and off whatever the preset said', async () => {
    const { onstart } = mount();
    await fireEvent.click(screen.getByRole('button', { name: /constructed/i }));
    await fireEvent.click(commanderDamage());
    await fireEvent.click(begin());

    expect(configOf(onstart).tracksCommanderDamage).toBe(true);
    expect(configOf(onstart).format).toBe('custom');
  });

  /*
   * The cap used to move with the format, so Brawl silently allowed four and
   * Constructed six — a rule nobody could read off a button. It is one
   * number for the app now.
   */
  it('offers every seat the app supports, whichever preset is showing', async () => {
    mount();
    for (const preset of [/commander/i, /brawl/i, /multiplayer/i, /constructed/i]) {
      await fireEvent.click(screen.getByRole('button', { name: preset }));
      await fireEvent.input(players(), { target: { value: '6' } });
      expect(players(), String(preset)).toHaveValue(6);
    }
  });

  it('will not seat nobody, or more people than there are panels', async () => {
    mount();
    await fireEvent.input(players(), { target: { value: '0' } });
    expect(begin()).toBeDisabled();

    await fireEvent.input(players(), { target: { value: '7' } });
    expect(begin()).toBeDisabled();
  });

  /* The row of badges that attributes commander damage identifies people by
     colour, so two seats sharing one makes it unanswerable. */
  it('gives every seat a colour of its own, at every size a table comes in', async () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const { onstart } = mount();
      await fireEvent.input(players(), { target: { value: String(count) } });
      await fireEvent.click(begin());

      const colours = seatsOf(onstart).map((seat) => seat.colour);
      expect(colours, `${count} players`).toHaveLength(count);
      expect(new Set(colours).size, `${count} players`).toBe(count);
      cleanup();
    }
  });

  describe('opened over a game that is still running', () => {
    const existing = [
      { id: 'a' as never, name: 'Anna', colour: 'green' as const },
      { id: 'b' as never, name: 'Björn', colour: 'red' as const }
    ];
    const config: GameConfig = {
      format: 'twoHeadedGiant',
      startingLife: 30,
      tracksCommanderDamage: false
    };

    it('offers a way back to the game it was opened from', async () => {
      const onback = vi.fn();
      mount({ onback });
      await fireEvent.click(screen.getByRole('button', { name: /back to the game/i }));
      expect(onback).toHaveBeenCalledOnce();
    });

    it('has no way back when there is no game behind it', () => {
      mount();
      expect(screen.queryByRole('button', { name: /back to the game/i })).not.toBeInTheDocument();
    });

    it('opens on the settings the running game is actually using', () => {
      mount({ existing, config });
      expect(life()).toHaveValue(30);
      expect(players()).toHaveValue(2);
      expect(commanderDamage()).toHaveAttribute('aria-checked', 'false');
    });

    it('carries the existing seats through, so a reconfigure is not a reintroduction', async () => {
      const { onstart } = mount({ existing, config });
      await fireEvent.click(begin());
      expect(seatsOf(onstart)).toEqual(existing);
    });

    it('mints only the seats the existing table does not already have', async () => {
      const { onstart } = mount({ existing, config });
      await fireEvent.input(players(), { target: { value: '4' } });
      await fireEvent.click(begin());

      const seats = seatsOf(onstart);
      expect(seats).toHaveLength(4);
      expect(seats.slice(0, 2)).toEqual(existing);
      expect(seats[2]?.id).toBeUndefined();
    });

    /* A game saved before presets became presets carries a preset id, and
       reopening setup over it must not silently relabel it. */
    it('keeps a saved game on its own preset until something is changed', async () => {
      const { onstart } = mount({ existing, config });
      await fireEvent.click(begin());
      expect(configOf(onstart)).toEqual(config);
    });
  });
});
