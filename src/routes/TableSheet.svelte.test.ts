import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
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

const mount = (store: Awaited<ReturnType<typeof seatPlayers>>) =>
  render(TableSheet, { props: { store, onclose: () => {} } });

describe('table sheet', () => {
  /*
   * One code for the table, not one per person (ADR 0006). The seat list is
   * there to answer "is everyone in yet?", which previously needed the host
   * to remember who they had already invited.
   */
  it('shows every seat and whether it is taken, without offering to invite each one', async () => {
    const store = await seatPlayers();
    const bjorn = store.state!.players.find((player) => player.name === 'Björn')!;
    await store.claimSeat(bjorn.id);

    mount(store);

    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Björn')).toBeInTheDocument();
    expect(screen.getByText('Cara')).toBeInTheDocument();
    expect(screen.getAllByText('free')).toHaveLength(2);
    expect(screen.getAllByText('joined')).toHaveLength(1);

    expect(screen.queryByRole('button', { name: 'Invite Anna' })).not.toBeInTheDocument();
  });

  /*
   * The no-server path is per-seat because it has to be: a QR handshake is
   * one offer shown to one scanner. So the fallback asks whose seat first.
   */
  it('asks which seat a hand-carried code is for, and skips the ones already taken', async () => {
    const store = await seatPlayers();
    const bjorn = store.state!.players.find((player) => player.name === 'Björn')!;
    await store.claimSeat(bjorn.id);

    mount(store);
    await fireEvent.click(screen.getByRole('button', { name: /paste instead/i }));

    expect(screen.getByRole('button', { name: 'Invite Anna' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Invite Cara' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /björn.*joined/i })).toBeDisabled();
  });
});
