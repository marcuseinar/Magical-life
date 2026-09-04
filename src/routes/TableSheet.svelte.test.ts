import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TableSheet from './TableSheet.svelte';
import { createGameStore } from '$lib/gameStore.svelte';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';

const seatPlayers = async () => {
  const store = createGameStore({ log: createMemoryEventLog() });
  await store.begin('commander', [
    { name: 'Anna', colour: 'green' },
    { name: 'Björn', colour: 'blue' },
    { name: 'Cara', colour: 'red' }
  ]);
  return store;
};

describe('table sheet', () => {
  it('offers to invite every player before anyone has joined', async () => {
    const store = await seatPlayers();
    render(TableSheet, { props: { store, onclose: () => {} } });

    expect(screen.getByRole('button', { name: 'Invite Anna' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Invite Björn' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Invite Cara' })).toBeEnabled();
  });

  it('stops offering to invite a seat that has already joined', async () => {
    const store = await seatPlayers();
    const bjorn = store.state!.players.find((player) => player.name === 'Björn')!;
    await store.claimSeat(bjorn.id);

    render(TableSheet, { props: { store, onclose: () => {} } });

    expect(screen.queryByRole('button', { name: 'Invite Björn' })).not.toBeInTheDocument();
    expect(screen.getByText(/björn.*joined/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite Anna' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Invite Cara' })).toBeEnabled();
  });
});
