<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { GameConfig } from '$domain/state';
  import type { SeatRequest } from '$application/usecases/startGame';
  import { useGameStore } from '$lib/context';
  import NewGameSheet from '$ui/components/NewGameSheet.svelte';

  const store = useGameStore();

  /* The game this screen was opened over, if there is one. Its seats come
     along so that changing the starting life does not also rename everyone
     back to Player N and drop whoever had joined on their own phone. */
  const running = $derived(store.state);

  async function start(config: GameConfig, seats: SeatRequest[]) {
    await store.begin(config, seats);
    await goto(resolve('/'));
  }
</script>

<svelte:head>
  <title>New game — Magical Life</title>
</svelte:head>

<NewGameSheet
  onstart={start}
  onback={running === null ? undefined : () => goto(resolve('/'))}
  existing={running?.players ?? []}
  config={running?.config}
/>
