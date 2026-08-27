<script lang="ts">
  import { createGameStore } from '$lib/gameStore.svelte';
  import GameScreen from './GameScreen.svelte';

  const store = createGameStore();
</script>

<svelte:head>
  <title>Magical Life</title>
</svelte:head>

<GameScreen {store} />
