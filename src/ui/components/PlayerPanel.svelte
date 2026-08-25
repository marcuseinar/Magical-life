<script lang="ts">
  import { lethalReasons, threatLevel } from '$domain/selectors';
  import type { PlayerState } from '$domain/state';
  import { scrubPoints } from '$ui/interaction/pendingDelta';
  import { createDeltaController } from '$ui/interaction/deltaController.svelte';
  import CounterTray from './CounterTray.svelte';
  import DeltaBadge from './DeltaBadge.svelte';
  import Filigree from './Filigree.svelte';
  import LifeTotal from './LifeTotal.svelte';
  import ManaPip from './ManaPip.svelte';

  let {
    player,
    /** Panels facing an opponent across the table are upside down, so their
     *  left/right and up/down are the mirror of ours. */
    rotated = false,
    isFirstPlayer = false,
    spotlit = false,
    dimmed = false,
    celebrating = false,
    onLifeChange,
    onOpenCounters,
    onRename,
    onElimination
  }: {
    player: PlayerState;
    rotated?: boolean;
    isFirstPlayer?: boolean;
    /** Under the travelling spotlight while first player is being decided. */
    spotlit?: boolean;
    /** Just won the roll — blinks to make the result unmissable. */
    celebrating?: boolean;
    /** A spin is running and the light is on somebody else. */
    dimmed?: boolean;
    onLifeChange: (delta: number) => void;
    onRename?: () => void;
    onOpenCounters: () => void;
    onElimination: (eliminated: boolean) => void;
  } = $props();

  /** Far enough to be a deliberate drag rather than the wobble of a tap. */
  const SCRUB_THRESHOLD_PX = 12;
  const REPEAT_DELAY_MS = 500;
  const REPEAT_MS = 250;
  const REPEAT_FAST_MS = 83;
  const REPEAT_ACCELERATES_AFTER = 4;

  const controller = createDeltaController((delta) => onLifeChange(delta));

  let scrubbing = $state(false);
  let origin = 0;
  let scrubBase = 0;
  let repeat: ReturnType<typeof setTimeout> | undefined;

  const threat = $derived(threatLevel(player));
  const reasons = $derived(lethalReasons(player));

  const stopRepeating = () => {
    clearTimeout(repeat);
    repeat = undefined;
  };

  function startRepeating(sign: number) {
    let fired = 0;
    const tick = () => {
      controller.nudge(sign);
      fired += 1;
      repeat = setTimeout(tick, fired >= REPEAT_ACCELERATES_AFTER ? REPEAT_FAST_MS : REPEAT_MS);
    };
    repeat = setTimeout(tick, REPEAT_DELAY_MS);
  }

  function press(event: PointerEvent, sign: number) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    // Respond on touch-down, not on release: a life counter that waits feels broken.
    controller.nudge(sign);
    origin = event.clientY;
    scrubBase = controller.pending;
    scrubbing = false;
    startRepeating(sign);
  }

  function drag(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    if (!target.hasPointerCapture(event.pointerId)) return;

    const travelled = (origin - event.clientY) * (rotated ? -1 : 1);
    if (!scrubbing && Math.abs(travelled) < SCRUB_THRESHOLD_PX) return;

    if (!scrubbing) {
      scrubbing = true;
      stopRepeating();
    }
    controller.scrub(scrubBase + scrubPoints(travelled));
  }

  function lift() {
    stopRepeating();
    // A deliberate gesture deserves an immediate result; taps wait out the window.
    if (scrubbing) controller.release();
    scrubbing = false;
  }

  function keyboardNudge(event: MouseEvent, sign: number) {
    // `detail === 0` means the click came from a key, not a pointer we already handled.
    if (event.detail === 0) controller.nudge(sign);
  }

  $effect(() => () => {
    stopRepeating();
    controller.destroy();
  });
</script>

<article
  class="panel"
  data-colour={player.colour}
  data-threat={threat}
  data-rotated={rotated}
  data-eliminated={player.eliminated}
  data-spotlit={spotlit}
  data-celebrating={celebrating}
  data-dimmed={dimmed}
>
  <Filigree />

  <div class="field">
    <button
      class="zone zone--minus"
      aria-label="{player.name}, lose one life"
      onpointerdown={(event) => press(event, -1)}
      onpointermove={drag}
      onpointerup={lift}
      onpointercancel={lift}
      onclick={(event) => keyboardNudge(event, -1)}
    >
      <span class="zone__glyph" aria-hidden="true">−</span>
    </button>

    <button
      class="zone zone--plus"
      aria-label="{player.name}, gain one life"
      onpointerdown={(event) => press(event, 1)}
      onpointermove={drag}
      onpointerup={lift}
      onpointercancel={lift}
      onclick={(event) => keyboardNudge(event, 1)}
    >
      <span class="zone__glyph" aria-hidden="true">+</span>
    </button>

    <div class="readout">
      <LifeTotal life={player.life} {threat} label={player.name} />
      {#if controller.pending !== 0}
        <div class="badge-slot">
          <DeltaBadge
            value={controller.pending}
            progress={controller.progress}
            label={player.name}
            oncancel={() => controller.cancel()}
          />
        </div>
      {/if}
    </div>
  </div>

  <footer class="plate">
    <ManaPip colour={player.colour} />
    <!-- Still a heading, so the panel keeps its place in the document outline;
         the button inside is what makes the name editable. -->
    <h2 class="name">
      <button class="name__edit" aria-label="Rename {player.name}" onclick={() => onRename?.()}>
        {player.name}
      </button>
    </h2>

    {#if isFirstPlayer}
      <!-- Purely visual: the page-level status message announces the roll once,
           rather than every panel repeating it. -->
      <span class="first" aria-hidden="true">1st</span>
    {/if}

    <div class="plate__end">
      {#if reasons.length > 0 || player.eliminated}
        <button
          class="out"
          aria-pressed={player.eliminated}
          onclick={() => onElimination(!player.eliminated)}
        >
          {player.eliminated ? 'Back in' : 'Out'}
        </button>
      {/if}
      <CounterTray playerName={player.name} counters={player.counters} onopen={onOpenCounters} />
    </div>
  </footer>
</article>

<style>
  .panel {
    container-type: size;
    position: relative;
    display: grid;
    grid-template-rows: 1fr auto;
    overflow: hidden;
    min-height: 0;
    border: 1px solid var(--frame-edge);
    border-radius: var(--radius-lg);

    /* A card: a lit field of the player's colour inside a dark bevel. */
    background:
      radial-gradient(ellipse 90% 70% at 50% 22%, var(--player-lit), transparent 72%),
      linear-gradient(175deg, var(--player-ink), var(--surface-panel) 85%);
    box-shadow:
      inset 0 1px 0 var(--frame-highlight),
      inset 0 0 0 1px var(--frame-rule),
      var(--shadow-panel);
    transform: rotate(var(--panel-turn, 0deg)) scale(var(--panel-lift, 1));
    transition:
      box-shadow var(--duration-base) var(--ease-out),
      transform var(--duration-fast) var(--ease-out),
      opacity var(--duration-fast) var(--ease-out);
  }

  /* Card stock, not a flat fill. */
  .panel::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: var(--texture-grain);
    opacity: 0.045;
    mix-blend-mode: overlay;
    pointer-events: none;
  }

  .panel[data-rotated='true'] {
    --panel-turn: 180deg;
  }

  /* Three hard blinks the moment the spotlight settles, so a table of six
     people all see which card was chosen without being told. */
  .panel[data-celebrating='true'] {
    animation: chosen 300ms linear 3;
  }

  @keyframes chosen {
    0%,
    49% {
      box-shadow:
        inset 0 0 0 2px var(--frame-rule-strong),
        inset 0 0 60px -12px var(--accent),
        var(--shadow-float);
    }

    50%,
    100% {
      box-shadow:
        inset 0 1px 0 var(--frame-highlight),
        inset 0 0 0 1px var(--frame-rule),
        var(--shadow-panel);
    }
  }

  /* The spotlight travelling round the table while first player is decided. */
  .panel::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 45%, var(--accent), transparent 68%);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
    pointer-events: none;
  }

  .panel[data-spotlit='true'] {
    --panel-lift: 1.03;

    box-shadow:
      inset 0 0 0 2px var(--frame-rule-strong),
      inset 0 0 60px -12px var(--accent),
      var(--shadow-float);
  }

  .panel[data-spotlit='true']::after {
    opacity: 0.24;
  }

  /* Everyone the light is not on falls back, which is what makes it read as a
     spotlight travelling round the table rather than a panel changing colour. */
  .panel[data-dimmed='true'] {
    opacity: 0.4;
  }

  .panel[data-threat='warning'] {
    box-shadow:
      inset 0 0 0 1px var(--accent),
      inset 0 0 40px -12px var(--accent),
      var(--shadow-panel);
  }

  .panel[data-threat='lethal'] {
    box-shadow:
      inset 0 0 0 1px var(--danger),
      inset 0 0 60px -10px var(--danger-deep),
      var(--shadow-panel);
    animation: dread 2.6s ease-in-out infinite;
  }

  .panel[data-eliminated='true'] {
    filter: grayscale(0.85);
    opacity: 0.55;
  }

  .field {
    position: relative;
    display: grid;

    /* Exactly half and half: an asymmetric split reads as a bug on a device you
       are holding in the dark. */
    grid-template-columns: 1fr 1fr;
    min-height: 0;
  }

  .zone {
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 0;
    color: var(--text-faint);
    transition: background-color var(--duration-fast) var(--ease-out);
    touch-action: none;
  }

  .zone:active {
    background-color: var(--surface-pressed);
  }

  .zone__glyph {
    align-self: end;
    padding-bottom: var(--space-4);
    font-family: var(--font-display);
    font-size: clamp(1rem, 6cqmin, 2.5rem);
    line-height: 1;
    opacity: 0.5;
  }

  .readout {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;

    /* The zones underneath must stay tappable through the readout. */
    pointer-events: none;
  }

  .badge-slot {
    position: absolute;

    /* Above the total, in the empty upper third — never over the number it
       describes, whatever size that number happens to be. */
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: auto;
  }

  .plate {
    display: flex;
    flex: none;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--frame-rule);

    /* The type line of a card. */
    background: linear-gradient(180deg, rgb(0 0 0 / 25%), rgb(0 0 0 / 45%));
  }

  .name {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--size-name);
  }

  .name__edit {
    display: block;
    width: 100%;
    overflow: hidden;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: inherit;
    font-weight: 700;
    letter-spacing: var(--tracking-display);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plate__end {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: flex-end;

    /* Never wrap: a plate that grows squeezes the field and shoves the life
       total out of the card, which is exactly what used to happen. */
    min-width: 0;
  }

  .out {
    padding: 2px var(--space-2);
    border: 1px solid var(--danger);
    border-radius: var(--radius-pill);
    color: var(--danger);
    font-size: var(--size-chip);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .first {
    flex: none;
    animation: strike var(--duration-slow) var(--ease-out);
    padding: 2px var(--space-2);
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-pill);
    color: var(--text-gold);
    font-size: var(--size-chip);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .out[aria-pressed='true'] {
    border-color: var(--frame-rule);
    color: var(--text-muted);
  }

  @keyframes strike {
    0% {
      transform: scale(0.4);
      opacity: 0;
    }

    60% {
      transform: scale(1.18);
      opacity: 1;
    }

    100% {
      transform: scale(1);
    }
  }

  @keyframes dread {
    0%,
    100% {
      box-shadow:
        inset 0 0 0 1px var(--danger),
        inset 0 0 60px -10px var(--danger-deep),
        var(--shadow-panel);
    }

    50% {
      box-shadow:
        inset 0 0 0 1px var(--danger),
        inset 0 0 90px -6px var(--danger-deep),
        var(--shadow-panel);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel[data-threat='lethal'],
    .panel[data-celebrating='true'],
    .first {
      animation: none;
    }
  }
</style>
