<script lang="ts">
  import { resolve } from '$app/paths';
  import { MANA_COLOURS, MAX_PLAYERS, PRESETS, PRESET_ORDER } from '$domain/rules';
  import type { ManaColour, PresetId } from '$domain/rules';
  import type { GameConfig, PlayerSeat } from '$domain/state';
  import ManaPip from './ManaPip.svelte';

  let {
    onstart,
    onback,
    existing = [],
    config: running
  }: {
    onstart: (config: GameConfig, seats: SeatRequest[]) => void;
    /** Absent when there is no game to go back to — a first run, or after
     *  the history has been cleared. */
    onback?: (() => void) | undefined;
    /** The seats of the game this screen was opened over, if any. */
    existing?: readonly PlayerSeat[] | undefined;
    /** And its settings, so reopening setup over a game shows that game. */
    config?: GameConfig | undefined;
  } = $props();

  type SeatRequest = { id?: PlayerSeat['id']; name: string; colour: ManaColour };

  /*
   * The three controls are what a game actually runs on. A preset is a way
   * of filling them in, not a mode they live inside — so `touched` holds
   * whatever has been changed since the last preset was tapped, and the
   * preset is only still true while that is empty.
   */
  type Touched = {
    startingLife?: number;
    players?: number;
    tracksCommanderDamage?: boolean;
  };

  let preset = $state<PresetId | null>(null);
  let touched = $state<Touched>({});

  /** What the screen opened on: the running game's settings, or Commander. */
  const opening = $derived<GameConfig>(
    running ?? {
      format: 'commander',
      startingLife: PRESETS.commander.startingLife,
      tracksCommanderDamage: PRESETS.commander.tracksCommanderDamage
    }
  );

  const openingPlayers = $derived(
    existing.length > 0 ? existing.length : PRESETS.commander.defaultPlayers
  );

  const fromPreset = $derived(preset === null ? null : PRESETS[preset]);

  const startingLife = $derived(
    touched.startingLife ?? fromPreset?.startingLife ?? opening.startingLife
  );
  const players = $derived(touched.players ?? fromPreset?.defaultPlayers ?? openingPlayers);
  const tracksCommanderDamage = $derived(
    touched.tracksCommanderDamage ??
      fromPreset?.tracksCommanderDamage ??
      opening.tracksCommanderDamage
  );

  /** Which preset these settings still are, if any. Touching anything at all
   *  makes the answer "none of them", which is what `'custom'` means. */
  const format = $derived<GameConfig['format']>(
    Object.keys(touched).length > 0 ? 'custom' : (preset ?? opening.format)
  );

  const valid = $derived(
    Number.isInteger(startingLife) &&
      startingLife > 0 &&
      Number.isInteger(players) &&
      players >= 1 &&
      players <= MAX_PLAYERS
  );

  /* Colours are assigned in order so a pod is never two blues. All seven are
     in play, not just the five true colours: six people cycling five of them
     made Player 6 another white, and the badges that attribute commander
     damage identify people by colour — two the same makes the question
     unanswerable. */
  const seats = $derived(
    Array.from({ length: Math.max(players, 0) }, (_, index): SeatRequest => {
      /* A seat that already exists arrives with its identity, which carries
         its name, its colour and — through `reduce` folding claims forward by
         id — whoever is playing it on their own phone. */
      const kept = existing[index];
      if (kept !== undefined) return { id: kept.id, name: kept.name, colour: kept.colour };
      return {
        name: `Player ${index + 1}`,
        colour: MANA_COLOURS[index % MANA_COLOURS.length] as ManaColour
      };
    })
  );

  function choosePreset(next: PresetId) {
    preset = next;
    touched = {};
  }

  const readNumber = (event: Event) => Number((event.currentTarget as HTMLInputElement).value);
</script>

<main class="sheet">
  <header class="masthead">
    <h1 class="title">Magical Life</h1>
    <p class="tagline">Set the table, then begin.</p>
  </header>

  <fieldset class="group">
    <legend class="legend">Quick start</legend>
    <div class="options">
      {#each PRESET_ORDER as id (id)}
        <button class="option" aria-pressed={format === id} onclick={() => choosePreset(id)}>
          <span class="option__name">{PRESETS[id].name}</span>
          <span class="option__life">{PRESETS[id].startingLife}</span>
        </button>
      {/each}
    </div>
  </fieldset>

  <div class="group settings">
    <!-- A div with `aria-labelledby` rather than a wrapping label: the
         label would have taken in the stepper's own buttons too, so the
         field's name came out as "Starting life − 40 +". -->
    <div class="setting">
      <span class="setting__name" id="starting-life-label">Starting life</span>
      <span class="stepper">
        <button
          class="step"
          type="button"
          aria-label="Lower starting life"
          onclick={() => (touched = { ...touched, startingLife: startingLife - 1 })}>−</button
        >
        <input
          class="number"
          type="number"
          inputmode="numeric"
          min="1"
          value={startingLife}
          aria-labelledby="starting-life-label"
          oninput={(event) => (touched = { ...touched, startingLife: readNumber(event) })}
        />
        <button
          class="step"
          type="button"
          aria-label="Raise starting life"
          onclick={() => (touched = { ...touched, startingLife: startingLife + 1 })}>+</button
        >
      </span>
    </div>

    <div class="setting">
      <span class="setting__name" id="players-label">Players</span>
      <span class="stepper">
        <button
          class="step"
          type="button"
          aria-label="Fewer players"
          onclick={() => (touched = { ...touched, players: players - 1 })}>−</button
        >
        <input
          class="number"
          type="number"
          inputmode="numeric"
          min="1"
          max={MAX_PLAYERS}
          value={players}
          aria-labelledby="players-label"
          oninput={(event) => (touched = { ...touched, players: readNumber(event) })}
        />
        <button
          class="step"
          type="button"
          aria-label="More players"
          onclick={() => (touched = { ...touched, players: players + 1 })}>+</button
        >
      </span>
    </div>

    <div class="setting">
      <span class="setting__name" id="commander-damage-label">Commander damage</span>
      <button
        class="toggle"
        type="button"
        role="switch"
        aria-checked={tracksCommanderDamage}
        aria-labelledby="commander-damage-label"
        onclick={() => (touched = { ...touched, tracksCommanderDamage: !tracksCommanderDamage })}
      >
        {tracksCommanderDamage ? 'On' : 'Off'}
      </button>
    </div>
  </div>

  <div class="preview" aria-hidden="true">
    {#each seats as player, index (index)}
      <span data-colour={player.colour}><ManaPip colour={player.colour} size={26} /></span>
    {/each}
  </div>

  <button
    class="start"
    disabled={!valid}
    onclick={() => onstart({ format, startingLife, tracksCommanderDamage }, seats)}
  >
    Begin at {startingLife}
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

    /*
     * Explicit, because the implicit column a bare `display: grid` creates is
     * `auto` — sized to max-content, which here was the title. "Magical Life"
     * at `clamp(2rem, 9vw, 3.25rem)` measures about 275px on a 390px phone,
     * so the whole screen laid out 275px wide inside a 390px viewport, and
     * the preset grid — which needs 280px for two columns — dropped to one.
     * The heading's width was deciding the layout of everything under it.
     */
    grid-template-columns: minmax(0, 1fr);

    /*
     * Generous on a tall phone, tighter on a short one, with no breakpoint
     * to pick wrong: at 844px tall these land on the tokens they used to be
     * fixed at, and on a 568px screen they give back the ~70px that was the
     * difference between fitting and not.
     */
    gap: clamp(var(--space-2), 2.5vh, var(--space-5));
    align-content: center;

    /*
     * An explicit width rather than `max-width`, because an `auto` inline
     * margin defeats a grid item's stretch: the sheet fell back to its
     * content width and centred there, which is how the title ended up
     * deciding how wide the screen was.
     */
    width: min(32rem, 100%);
    min-height: 100%;
    margin-inline: auto;
    overflow-y: auto;

    /* Opts back in to vertical scrolling, which the app disables globally. */
    touch-action: pan-y;
    padding: clamp(var(--space-4), 4vh, var(--space-6)) var(--space-4);
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

  .option[aria-pressed='true'] {
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

  .settings {
    gap: var(--space-2);
  }

  .setting {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
    min-height: 3rem;
    padding: 0 var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
  }

  .setting__name {
    color: var(--text-muted);
    font-size: 0.9rem;
    text-align: left;
  }

  .stepper {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .step {
    width: 2.25rem;
    min-height: 2.25rem;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--text-gold);
    font-size: 1.1rem;
    line-height: 1;
  }

  .number {
    width: 3.25rem;
    padding: var(--space-1);
    border: 0;
    background: none;
    color: var(--text-primary);
    font-family: var(--font-numeric);
    font-size: 1.15rem;
    text-align: center;

    /* stylelint-disable-next-line property-no-vendor-prefix -- iOS Safari still needs it */
    -webkit-appearance: textfield;
    appearance: textfield;
  }

  .toggle {
    min-width: 4rem;
    min-height: 2.25rem;
    padding: 0 var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .toggle[aria-checked='true'] {
    border-color: var(--frame-rule-strong);
    color: var(--text-gold);
  }

  .start:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
