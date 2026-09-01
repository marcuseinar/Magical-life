import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import OpponentBar from './OpponentBar.svelte';
import { playerId } from '$domain/ids';
import type { PlayerState } from '$domain/state';

const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: playerId('bjorn'),
  name: 'Björn',
  colour: 'blue',
  life: 40,
  counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
  commanderDamage: {},
  eliminated: false,
  claimed: true,
  ...over
});

describe('opponent bar', () => {
  it('shows each opponent by name and life', () => {
    render(OpponentBar, {
      props: {
        players: [player({ id: playerId('bjorn'), name: 'Björn', life: 40 })]
      }
    });
    expect(screen.getByLabelText('Björn: 40 life')).toBeInTheDocument();
  });

  it('shows every opponent passed in, in order', () => {
    render(OpponentBar, {
      props: {
        players: [
          player({ id: playerId('bjorn'), name: 'Björn', life: 40 }),
          player({ id: playerId('cara'), name: 'Cara', life: 35 })
        ]
      }
    });
    expect(screen.getByLabelText('Björn: 40 life')).toBeInTheDocument();
    expect(screen.getByLabelText('Cara: 35 life')).toBeInTheDocument();
  });

  it('is grouped under one accessible label rather than read as loose text', () => {
    render(OpponentBar, { props: { players: [player()] } });
    expect(screen.getByRole('group', { name: /opponents/i })).toBeInTheDocument();
  });

  it('marks an eliminated opponent', () => {
    const { container } = render(OpponentBar, {
      props: { players: [player({ eliminated: true })] }
    });
    expect(container.querySelector('[data-eliminated="true"]')).toBeInTheDocument();
  });

  it('offers no controls at all — an opponent is never editable from here', () => {
    render(OpponentBar, { props: { players: [player(), player({ id: playerId('cara') })] } });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
