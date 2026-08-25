import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import PlayerPanel from './PlayerPanel.svelte';
import { COMMIT_WINDOW_MS } from '$ui/interaction/pendingDelta';
import { playerId } from '$domain/ids';
import type { PlayerState } from '$domain/state';

const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: playerId('anna'),
  name: 'Anna',
  colour: 'green',
  life: 40,
  counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
  eliminated: false,
  ...over
});

const mount = (over: Partial<PlayerState> = {}) => {
  const onLifeChange = vi.fn();
  const onOpenCounters = vi.fn();
  const onElimination = vi.fn();
  render(PlayerPanel, {
    props: { player: player(over), onLifeChange, onOpenCounters, onElimination }
  });
  return { onLifeChange, onOpenCounters, onElimination };
};

const decrease = () => screen.getByRole('button', { name: /lose one life/i });
const increase = () => screen.getByRole('button', { name: /gain one life/i });

const touch = (element: Element, event: 'pointerDown' | 'pointerMove' | 'pointerUp', y = 0) =>
  fireEvent[event](element, { pointerId: 1, pointerType: 'touch', clientY: y, button: 0 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('player panel', () => {
  it('shows the player and their life total', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Anna' })).toBeInTheDocument();
    expect(screen.getByLabelText('Anna: 40 life')).toBeInTheDocument();
  });

  it('offers a tap zone in each direction', () => {
    mount();
    expect(decrease()).toBeInTheDocument();
    expect(increase()).toBeInTheDocument();
  });

  it('shows the pending change immediately, before committing anything', async () => {
    const { onLifeChange } = mount();
    await touch(decrease(), 'pointerDown');

    expect(
      screen.getByRole('button', { name: /cancel pending change of -1/i })
    ).toBeInTheDocument();
    expect(onLifeChange).not.toHaveBeenCalled();
  });

  it('batches several taps into one committed change', async () => {
    const { onLifeChange } = mount();
    for (let tap = 0; tap < 3; tap++) {
      await touch(decrease(), 'pointerDown');
      await touch(decrease(), 'pointerUp');
    }

    await vi.advanceTimersByTimeAsync(COMMIT_WINDOW_MS + 100);

    expect(onLifeChange).toHaveBeenCalledTimes(1);
    expect(onLifeChange).toHaveBeenCalledWith(-3);
  });

  it('counts gains and losses against each other', async () => {
    const { onLifeChange } = mount();
    await touch(decrease(), 'pointerDown');
    await touch(decrease(), 'pointerUp');
    await touch(increase(), 'pointerDown');
    await touch(increase(), 'pointerUp');

    await vi.advanceTimersByTimeAsync(COMMIT_WINDOW_MS + 100);

    // Net zero is not a change, so nothing is written to the log.
    expect(onLifeChange).not.toHaveBeenCalled();
  });

  it('cancels the whole pending change when the badge is tapped', async () => {
    const { onLifeChange } = mount();
    await touch(decrease(), 'pointerDown');
    await touch(decrease(), 'pointerUp');

    await fireEvent.click(screen.getByRole('button', { name: /cancel pending change/i }));
    await vi.advanceTimersByTimeAsync(COMMIT_WINDOW_MS + 100);

    expect(onLifeChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /cancel pending change/i })
    ).not.toBeInTheDocument();
  });

  it('pushes the commit deadline back while the player is still tapping', async () => {
    const { onLifeChange } = mount();
    await touch(decrease(), 'pointerDown');
    await touch(decrease(), 'pointerUp');

    await vi.advanceTimersByTimeAsync(COMMIT_WINDOW_MS - 200);
    await touch(decrease(), 'pointerDown');
    await touch(decrease(), 'pointerUp');
    await vi.advanceTimersByTimeAsync(COMMIT_WINDOW_MS - 200);

    expect(onLifeChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(onLifeChange).toHaveBeenCalledWith(-2);
  });

  it('repeats while a zone is held down', async () => {
    const { onLifeChange } = mount();
    await touch(decrease(), 'pointerDown');
    await vi.advanceTimersByTimeAsync(1200);
    await touch(decrease(), 'pointerUp');
    await vi.advanceTimersByTimeAsync(COMMIT_WINDOW_MS + 100);

    expect(onLifeChange).toHaveBeenCalledTimes(1);
    expect(onLifeChange.mock.calls[0]![0]).toBeLessThan(-2);
  });

  it('scrubs a large change from a vertical drag and commits it on release', async () => {
    const { onLifeChange } = mount();
    const zone = decrease();

    await touch(zone, 'pointerDown', 300);
    await touch(zone, 'pointerMove', 140); // 160px upward
    await touch(zone, 'pointerUp', 140);

    expect(onLifeChange).toHaveBeenCalledTimes(1);
    // Released deliberately, so it commits at once rather than waiting out the window.
    expect(onLifeChange.mock.calls[0]![0]).toBeGreaterThan(20);
  });

  it('ignores a wobble too small to be a drag', async () => {
    const { onLifeChange } = mount();
    const zone = decrease();

    await touch(zone, 'pointerDown', 300);
    await touch(zone, 'pointerMove', 295);
    await touch(zone, 'pointerUp', 295);
    await vi.advanceTimersByTimeAsync(COMMIT_WINDOW_MS + 100);

    expect(onLifeChange).toHaveBeenCalledWith(-1);
  });

  it('reverses the drag direction for a panel facing across the table', async () => {
    const onLifeChange = vi.fn();
    render(PlayerPanel, {
      props: {
        player: player(),
        rotated: true,
        onLifeChange,
        onOpenCounters: vi.fn(),
        onElimination: vi.fn()
      }
    });
    const zone = screen.getByRole('button', { name: /lose one life/i });

    await touch(zone, 'pointerDown', 300);
    await touch(zone, 'pointerMove', 140); // up the screen, down for them
    await touch(zone, 'pointerUp', 140);

    expect(onLifeChange.mock.calls[0]![0]).toBeLessThan(-20);
  });

  it('asks for the counter sheet rather than opening one inside the card', async () => {
    const { onOpenCounters } = mount();
    await fireEvent.click(screen.getByRole('button', { name: /counters for anna/i }));

    expect(onOpenCounters).toHaveBeenCalled();
    // The editor is a page-level sheet; a panel is far too small to hold it.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks the player chosen to go first', () => {
    const onLifeChange = vi.fn();
    render(PlayerPanel, {
      props: {
        player: player(),
        isFirstPlayer: true,
        onLifeChange,
        onOpenCounters: vi.fn(),
        onElimination: vi.fn()
      }
    });
    expect(screen.getByText('1st')).toBeInTheDocument();
  });

  it('lights up when the spotlight lands on it', () => {
    const { container } = render(PlayerPanel, {
      props: {
        player: player(),
        spotlit: true,
        onLifeChange: vi.fn(),
        onOpenCounters: vi.fn(),
        onElimination: vi.fn()
      }
    });
    expect(container.querySelector('article')?.dataset.spotlit).toBe('true');
  });

  it('is dark while the spotlight is elsewhere', () => {
    const { container } = render(PlayerPanel, {
      props: {
        player: player(),
        onLifeChange: vi.fn(),
        onOpenCounters: vi.fn(),
        onElimination: vi.fn()
      }
    });
    expect(container.querySelector('article')?.dataset.spotlit).toBe('false');
  });

  it('marks nobody by default', () => {
    mount();
    expect(screen.queryByText('1st')).not.toBeInTheDocument();
  });

  it('shows only counters that are actually on the board', async () => {
    mount({ counters: { poison: 3, energy: 0, experience: 0, rad: 0, ticket: 0 } });

    expect(screen.getByText('Poison')).toBeInTheDocument();
    expect(screen.queryByText('Energy')).not.toBeInTheDocument();
  });

  it('offers to declare a player out once they are dead on board', () => {
    mount({ life: 0 });
    expect(screen.getByRole('button', { name: 'Out' })).toBeInTheDocument();
  });

  it('does not offer it while they are healthy', () => {
    mount();
    expect(screen.queryByRole('button', { name: 'Out' })).not.toBeInTheDocument();
  });

  it('offers to bring an eliminated player back', async () => {
    const { onElimination } = mount({ life: -3, eliminated: true });
    await fireEvent.click(screen.getByRole('button', { name: 'Back in' }));

    expect(onElimination).toHaveBeenCalledWith(false);
  });

  it('treats ten poison as lethal even on full life', () => {
    mount({ counters: { poison: 10, energy: 0, experience: 0, rad: 0, ticket: 0 } });
    expect(screen.getByRole('button', { name: 'Out' })).toBeInTheDocument();
  });

  it('is fully operable from the keyboard', async () => {
    const { onLifeChange } = mount();
    // A keyboard-activated click carries no pointer detail.
    await fireEvent.click(decrease(), { detail: 0 });
    await vi.advanceTimersByTimeAsync(COMMIT_WINDOW_MS + 100);

    expect(onLifeChange).toHaveBeenCalledWith(-1);
  });
});
