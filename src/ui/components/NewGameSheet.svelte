<script lang="ts">
  import { resolve } from '$app/paths';
  import { FORMATS, FORMAT_ORDER, MANA_COLOURS } from '$domain/rules';
  import type { FormatId, ManaColour } from '$domain/rules';
  import type { PlayerSeat } from '$domain/state';
  import ManaPip from './ManaPip.svelte';

  let {
    onstart,
    onback,
    existing = [],
    format: openOn
  }: {
    onstart: (formatId: FormatId, seats: SeatRequest[]) => void;
    /** Absent when there is no game to go back to — a first run, or after
     *  the history has been cleared. */
    onback?: (() => void) | undefined;
    /** The seats of the game this screen was opened over, if any. */
    existing?: readonly PlayerSeat[] | undefined;
    format?: FormatId | undefined;
  } = $props();

  type SeatRequest = { id?: PlayerSeat['id']; name: string; colour: ManaColour };

  /*
   * Both of these are "what the player has touched", not "what is showing" —
   * `null` meaning untouched, so the answer can keep following the props.
   * Seeding `$state` from a prop instead would capture it once, and this
   * screen is opened over a game whose shape it has to reflect.
   */
  let chosenFormat = $state<FormatId | null>(null);
  let chosenCount = $state<number | null>(null);

  const formatId = $derived(chosenFormat ?? openOn ?? 'commander');
  const format = $derived(FORMATS[formatId]);

  /* An existing table's size is the default when there is one; otherwise the
     format's own, which is most of why anyone taps a format at all. */
  const count = $derived(
    Math.min(
      chosenCount ?? (existing.length > 0 ? existing.length : format.defaultPlayers),
      format.maxPlayers
    )
  );

  /* Colours are assigned in order so a pod is never two blues. All seven are in
     play, not just the five true colours: six people cycling five of them made
     Player 6 another white, and the badges that attribute commander damage
     identify people by colour — two the same makes the question unanswerable. */
  const seats = $derived(
    Array.from({ length: count }, (_, index): SeatRequest => {
      /* A seat that already exists arrives with its identity, which is what
         carries its name, its colour and — through `reduce` folding claims
         forward by id — whoever is playing it on their own phone. Only the
         seats beyond the current table are genuinely new. */
      const kept = existing[index];
      if (kept !== undefined) return { id: kept.id, name: kept.name, colour: kept.colour };
      return {
        name: `Player ${index + 1}`,
        colour: MANA_COLOURS[index % MANA_COLOURS.length] as ManaColour
      };
    })
  );

  function chooseFormat(next: FormatId) {
    chosenFormat = next;
    /* With a table already seated, changing the format must not silently
       reseat it — those are real people on real phones. Without one, letting
       the count fall back to the new format's default is the point. */
    if (existing.length === 0) chosenCount = null;
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
    <div class="options options--tight" style="--seats: {format.maxPlayers}">
      {#each Array.from({ length: format.maxPlayers }, (_, i) => i + 1) as n (n)}
        <button class="pill" aria-pressed={count === n} onclick={() => (chosenCount = n)}
          >{n}</button
        >
      {/each}
    </div>
  </fieldset>

  <div class="preview" aria-hidden="true">
    {#each seats as player, index (index)}
      <span data-colour={player.colour}><ManaPip colour={player.colour} size={26} /></span>
    {/each}
  </div>

  <button class="start" onclick={() => onstart(formatId, seats)}>
    Begin at {format.startingLife}
  </button>

  {#if onback}
    <!-- The whole point of ADR 0005: the game this was opened over is still
         running, so leaving without starting anything is a real option — and
         a real option deserves a real control, not underlined small print. -->
    <button class="secondary" type="button" onclick={onback}>Back to the game</button>
  {/if}

  <!-- Still an anchor rather than a button: it goes to a route, and on a
       first run this is the only way to reach joining at all — the menu it
       also lives in belongs to a game that does not exist yet. -->
  <a class="secondary" href={resolve('/join')}>Join a table</a>
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

  /* One row, always. `auto-fit` fitted five of the six on a phone and
     dropped the last onto a line by itself, which read as though six were
     somehow a different kind of choice. The count is known — there is never
     more than a format allows — so ask for exactly that many columns and let
     them shrink. */
  .options--tight {
    grid-template-columns: repeat(var(--seats), minmax(0, 1fr));
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

  /* The same shape as Begin, carrying less weight: one hierarchy, read by
     colour and size rather than by one control being a link and the other a
     button. */
  .secondary {
    display: grid;
    place-items: center;
    width: 100%;
    min-height: 3rem;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    text-decoration: none;
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
