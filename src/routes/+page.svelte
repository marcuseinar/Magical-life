<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { useGameStore } from '$lib/context';
  import GameScreen from './GameScreen.svelte';

  const store = useGameStore();

  /*
   * Setup is a screen of its own now, not what this route falls back to when
   * there is no game (ADR 0005) — so "there is no game yet" is a navigation.
   *
   * `replaceState` because otherwise this route sits in history directly
   * behind setup, and Back from setup would land here and bounce straight
   * forward to setup again.
   */
  $effect(() => {
    if (store.ready && store.state === null) {
      void goto(resolve('/setup'), { replaceState: true });
    }
  });
</script>

<svelte:head>
  <title>Magical Life</title>
</svelte:head>

{#if store.state === null}
  <p class="sr-only">Loading</p>
{:else}
  <GameScreen
    {store}
    onnewgame={() => goto(resolve('/setup'))}
    onjoin={() => goto(resolve('/join'))}
    onsettings={() => goto(resolve('/settings'))}
  />
{/if}
