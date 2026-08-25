<script lang="ts">
  import { FORMATS, FORMAT_ORDER, MANA_COLOURS } from '$domain/rules';
  import type { FormatId, ManaColour } from '$domain/rules';
  import ManaPip from './ManaPip.svelte';

  let {
    onstart
  }: {
    onstart: (formatId: FormatId, seats: { name: string; colour: ManaColour }[]) => void;
  } = $props();

  let formatId = $state<FormatId>('commander');
  const format = $derived(FORMATS[formatId]);

  let count = $state(FORMATS.commander.defaultPlayers);

  /* Colours are assigned in order so a pod is never two blues. All seven are in
     play, not just the five true colours: six people cycling five of them made
     Player 6 another white, and the badges that attribute commander damage
     identify people by colour — two the same makes the question unanswerable. */
  const seats = $derived(
    Array.from({ length: count }, (_, index) => ({
      name: `Player ${index + 1}`,
      colour: MANA_COLOURS[index % MANA_COLOURS.length] as ManaColour
    }))
  );

  function chooseFormat(next: FormatId) {
    formatId = next;
    count = Math.min(FORMATS[next].defaultPlayers, FORMATS[next].maxPlayers);
  }
</script>

<main class="sheet">
  <header class="masthead">
    <h1 class="title">Magical Life</h1>
    <p class="tagline">Tap to change. Drag for a lot.</p>
  </header>

  <fieldset class="group">
    <legend class="legend">Format</legend>
    <div class="options">
      {#each FORMAT_ORDER as id (id)}
        <button class="option" aria-pressed={formatId === id} onclick={() => chooseFormat(id)}>
          <span class="option__name">{FORMATS[id].name}</span>
          <span class="option__life">{FORMATS[id].startingLife}</span>
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend class="legend">Players</legend>
    <div class="options options--tight">
      {#each Array.from({ length: format.maxPlayers }, (_, i) => i + 1) as n (n)}
        <button class="pill" aria-pressed={count === n} onclick={() => (count = n)}>{n}</button>
      {/each}
    </div>
  </fieldset>

  <div class="preview" aria-hidden="true">
    {#each seats as player (player.name)}
      <span data-colour={player.colour}><ManaPip colour={player.colour} size={26} /></span>
    {/each}
  </div>

  <button class="start" onclick={() => onstart(formatId, seats)}>
    Begin at {format.startingLife}
  </button>
</main>

<style>
  .sheet {
    display: grid;
    gap: var(--space-5);
    align-content: center;
    justify-items: center;
    max-width: 32rem;
    min-height: 100%;
    margin-inline: auto;
    overflow-y: auto;

    /* Opts back in to vertical scrolling, which the app disables globally. */
    touch-action: pan-y;
    padding: var(--space-6) var(--space-4);
    text-align: center;
  }

  .masthead {
    display: grid;
    gap: var(--space-1);
  }

  .title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: clamp(2rem, 9vw, 3.25rem);
    font-weight: 900;
    letter-spacing: var(--tracking-display);
    text-shadow: 0 2px 18px var(--frame-shadow);
  }

  .tagline {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
  }

  .group {
    display: grid;
    gap: var(--space-3);
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .legend {
    padding: 0;
    color: var(--text-faint);
    font-size: 0.8rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
    gap: var(--space-2);
    width: 100%;
  }

  .options--tight {
    grid-template-columns: repeat(auto-fit, minmax(3rem, 1fr));
  }

  .option {
    display: grid;
    gap: 2px;
    min-height: 3.25rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: linear-gradient(180deg, var(--surface-raised), var(--surface-sunken));
  }

  .option__name {
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
  }

  .option__life {
    color: var(--text-muted);
    font-family: var(--font-numeric);
    font-size: 0.85rem;
  }

  .pill {
    min-height: 2.75rem;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    font-family: var(--font-numeric);
    font-size: 1.05rem;
  }

  .option[aria-pressed='true'],
  .pill[aria-pressed='true'] {
    border-color: var(--frame-rule-strong);
    color: var(--text-gold);
    box-shadow: inset 0 0 22px -8px var(--accent);
  }

  .preview {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    min-height: 26px;
  }

  .start {
    width: 100%;
    min-height: 3.5rem;
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-md);
    background: linear-gradient(180deg, var(--surface-raised), var(--surface-sunken));
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: var(--tracking-display);
  }
</style>
