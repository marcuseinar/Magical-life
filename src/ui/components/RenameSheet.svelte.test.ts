import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import RenameSheet from './RenameSheet.svelte';
import { MAX_PLAYER_NAME } from '$domain/rules';
import { playerId } from '$domain/ids';
import type { PlayerState } from '$domain/state';

const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: playerId('anna'),
  name: 'Player 1',
  colour: 'green',
  life: 40,
  counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
  eliminated: false,
  ...over
});

const mount = (over: Partial<PlayerState> = {}, rotated = false) => {
  const onrename = vi.fn();
  const onclose = vi.fn();
  render(RenameSheet, { props: { player: player(over), rotated, onrename, onclose } });
  return { onrename, onclose };
};

const field = () => screen.getByRole('textbox') as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Save' });

describe('rename sheet', () => {
  it('opens with the current name ready to replace', async () => {
    mount();
    expect(field()).toHaveValue('Player 1');

    // Selected, not merely focused: nobody wants to clear "Player 1" a
    // character at a time before typing their own name.
    await tick();
    expect(field().selectionStart).toBe(0);
    expect(field().selectionEnd).toBe('Player 1'.length);
  });

  it('hands back the typed name', async () => {
    const { onrename } = mount();
    await fireEvent.input(field(), { target: { value: 'Marcus' } });
    await fireEvent.click(save());

    expect(onrename).toHaveBeenCalledWith('Marcus');
  });

  it('submits on the keyboard, not only by tapping Save', async () => {
    const { onrename } = mount();
    await fireEvent.input(field(), { target: { value: 'Marcus' } });
    await fireEvent.submit(screen.getByRole('form'));

    expect(onrename).toHaveBeenCalledWith('Marcus');
  });

  it('will not save an empty name', async () => {
    mount();
    await fireEvent.input(field(), { target: { value: '' } });
    expect(save()).toBeDisabled();
  });

  it('will not save a name that is only whitespace', async () => {
    mount();
    await fireEvent.input(field(), { target: { value: '    ' } });
    expect(save()).toBeDisabled();
  });

  it('stops the name growing longer than a plate can show', () => {
    mount();
    expect(field()).toHaveAttribute('maxlength', String(MAX_PLAYER_NAME));
  });

  it('closes on Cancel without renaming anybody', async () => {
    const { onrename, onclose } = mount();
    await fireEvent.input(field(), { target: { value: 'Marcus' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onclose).toHaveBeenCalled();
    expect(onrename).not.toHaveBeenCalled();
  });

  it('closes on Escape without renaming anybody', async () => {
    const { onrename, onclose } = mount();
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onclose).toHaveBeenCalled();
    expect(onrename).not.toHaveBeenCalled();
  });

  it('names itself after the player, so it is findable among several sheets', () => {
    mount({ name: 'Björn' });
    expect(screen.getByRole('form', { name: /rename björn/i })).toBeInTheDocument();
  });

  it('turns to face a player sitting across the table', () => {
    const { container } = render(RenameSheet, {
      props: { player: player(), rotated: true, onrename: vi.fn(), onclose: vi.fn() }
    });
    expect((container.querySelector('form') as HTMLElement).dataset.rotated).toBe('true');
  });
});
