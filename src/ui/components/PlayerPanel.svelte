<script lang="ts">
  import type { PlayerId } from '$domain/ids';
  import { highestCommanderDamage, lethalReasons, threatLevel } from '$domain/selectors';
  import type { PlayerState } from '$domain/state';
  import { MAX_BLAME_STEP_PX, blameIndex, blameStepPx } from '$ui/interaction/blameStep';
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
    seats = [],
    tracksCommanderDamage = false,
    onLifeChange,
    onOpenCounters,
    onOpenCommander,
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
    /** Every seat in the game, in order. The panel filters itself out of the
     *  attribution row; the seating order is what gives each chip its colour. */
    seats?: readonly PlayerState[];
    tracksCommanderDamage?: boolean;
    /** `from` names the commander blamed for this loss, when one was picked. */
    onLifeChange: (delta: number, from: PlayerId | null) => void;
    onOpenCommander?: () => void;
    onRename?: () => void;
    onOpenCounters: () => void;
    onElimination: (eliminated: boolean) => void;
  } = $props();

  /** Sized against the room the finger has, once the press point is known. */
  let blameStep = $state(MAX_BLAME_STEP_PX);
  let field = $state<HTMLElement | null>(null);

  /** Far enough to be a deliberate drag rather than the wobble of a tap. */
  const SCRUB_THRESHOLD_PX = 12;

  /** Sideways travel per step along the list of who dealt it. */
  const REPEAT_DELAY_MS = 500;
  const REPEAT_MS = 250;
  const REPEAT_FAST_MS = 83;
  const REPEAT_ACCELERATES_AFTER = 4;

  /** Which commander this pending loss is being blamed on, if any. */
  let attributedTo = $state<PlayerId | null>(null);

  const controller = createDeltaController((delta) => {
    onLifeChange(delta, attributedTo);
    attributedTo = null;
  });

  // Cancelling the pending change drops the attribution with it.
  $effect(() => {
    if (controller.pending === 0 && attributedTo !== null) attributedTo = null;
  });

  const commanderTaken = $derived(highestCommanderDamage(player));

  /**
   * Who could have dealt it: nobody in particular, then every seat in order.
   * `null` first because most life loss is not commander damage, and opponents
   * only: your own chip is one more thing to aim past mid-gesture, for a case
   * that needs somebody to have stolen your commander. The domain still records
   * self-damage; the sheet is where you correct it.
   */
  const blame = $derived<readonly (PlayerId | null)[]>([
    null,
    ...seats.filter((seat) => seat.id !== player.id).map((seat) => seat.id)
  ]);

  const blamed = $derived(seats.find((seat) => seat.id === attributedTo) ?? null);

  let blameRow = $state<HTMLElement | null>(null);

  /* The strip is one scrolling row, so the chip the drag has landed on has to be
     brought into view or the selection happens off screen. */
  $effect(() => {
    void attributedTo;
    // Optional call: this is presentation polish, and it must not throw where
    // the API is missing — jsdom has no `scrollIntoView`.
    const selected = blameRow?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  });

  /* Only worth asking on a loss, in a format where it counts, with someone to blame. */
  const askingWhoDealtIt = $derived(
    tracksCommanderDamage && controller.pending < 0 && seats.length > 0
  );

  let scrubbing = $state(false);
  let origin = 0;
  let originX = 0;
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
    originX = event.clientX;

    /* Whichever side of the press point has more room is the side the row will
       run in, so the step is sized against that one. */
    const card = field?.getBoundingClientRect();
    const room = card
      ? Math.max(event.clientX - card.left, card.right - event.clientX)
      : MAX_BLAME_STEP_PX;
    blameStep = blameStepPx(room, blame.length);
    scrubBase = controller.pending;
    scrubbing = false;
    startRepeating(sign);
  }

  function drag(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    if (!target.hasPointerCapture(event.pointerId)) return;

    /*
     * Two axes, one gesture: down sets how much was lost, sideways sets whose
     * commander did it. Sideways is handled first and independently of the
     * vertical threshold, so blame can be picked during a drag that has not yet
     * become a scrub — and both are measured from the press point, so dragging
     * back always undoes exactly.
     */
    if (askingWhoDealtIt) {
      attributedTo = blame[blameIndex(event.clientX - originX, blameStep, blame.length)] ?? null;
    }

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

  <div class="field" bind:this={field} data-attributing={askingWhoDealtIt}>
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

    <div class="overlay">
      <div class="top-stack">
        {#if askingWhoDealtIt}
          <!-- One gesture writes both numbers: drag down for how much, sideways
               for whose commander. Tapping works too. The pip is the player's
               own colour, standing in for the portrait that will replace it. -->
          <div class="blame">
            <div
              bind:this={blameRow}
              class="blame__row"
              role="group"
              aria-label="Whose commander dealt this to {player.name}?"
            >
              {#each blame as candidate (candidate ?? 'nobody')}
                <button
                  class="blame__chip"
                  data-selected={attributedTo === candidate}
                  aria-pressed={attributedTo === candidate}
                  aria-label={candidate === null
                    ? 'Not commander damage'
                    : `${seats.find((s) => s.id === candidate)?.name}'s commander`}
                  data-colour={seats.find((s) => s.id === candidate)?.colour}
                  onclick={() => (attributedTo = candidate)}
                >
                  {#if candidate === null}
                    <span class="blame__none" aria-hidden="true">–</span>
                  {:else}
                    <ManaPip colour={seats.find((s) => s.id === candidate)!.colour} size={26} />
                  {/if}
                </button>
              {/each}
            </div>

            <!--
              The pending number lives on this line while the strip is open rather
              than in its own badge above it. Measured at six players: the card is
              248px, the strip needs 65 and the life total 53, which leaves no room
              for a third floating element above the number it would cover.
              Tapping the line still cancels, as the badge does.
            -->
            <button
              class="blame__caption"
              onclick={() => controller.cancel()}
              aria-label="{player.name}, cancel pending change of {controller.pending > 0
                ? `+${controller.pending}`
                : controller.pending}"
            >
              <span class="blame__delta" aria-hidden="true">{controller.pending}</span>
              <span aria-live="polite"
                >{blamed === null ? 'not commander damage' : `${blamed.name}'s commander`}</span
              >
            </button>
          </div>
        {/if}

        {#if controller.pending !== 0 && !askingWhoDealtIt}
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
      <div class="readout">
        <LifeTotal life={player.life} {threat} label={player.name} />
      </div>
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
      {#if tracksCommanderDamage}
        <button
          class="crown"
          data-lethal={commanderTaken >= 21}
          aria-label="Commander damage to {player.name}"
          onclick={() => onOpenCommander?.()}
        >
          <span aria-hidden="true">♛</span>
          {#if commanderTaken > 0}<span class="crown__total">{commanderTaken}</span>{/if}
        </button>
      {/if}
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

  /*
   * Two rows, not two overlays.
   *
   * The strip and the life total used to be separately positioned boxes floating
   * over the same space, kept apart by a margin. That margin was six pixels on
   * Chromium and negative on WebKit, and two attempts to widen it by measurement
   * both failed there — WebKit cannot be run in this sandbox, so every fix was a
   * guess. Giving them a row each makes overlap geometrically impossible, in any
   * engine, with nothing to measure.
   */
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);

    /* The zones underneath must stay tappable through it. */
    pointer-events: none;
  }

  .readout {
    display: grid;
    min-height: 0;
    place-items: center;
  }

  /*
   * Pinned to the top edge and dropped in from above it. The gesture that opens
   * this strip is a downward drag, which puts the hand over the bottom of the
   * card — so the bottom is the one place these must not be.
   *
   * The card clips its own overflow, so translating from -100% reads as the row
   * sliding in from off the top of the card.
   */
  .blame {
    display: grid;
    gap: var(--space-1);
    justify-items: center;
    width: 100%;
    animation: drop-in var(--duration-base) var(--ease-out);

    /* The stack itself is transparent to pointers so it never blocks the tap
       zones behind it; anything interactive inside has to opt back in. */
    pointer-events: auto;
  }

  .blame__row {
    display: flex;
    gap: var(--space-1);
    justify-content: safe center;
    max-width: 100%;

    /* One row, always. Wrapping put three rows of chips over the life total at
       six players; scrolling keeps the height fixed and the selected chip is
       brought into view as the drag moves through the list. */
    overflow-x: auto;
    scrollbar-width: none;

    /* Rule 10 says nothing scrolls; this is the local opt-in it allows. The row
       is the one thing in the app whose length is set by the size of the table,
       so at six players it outruns the card and has to be pannable by hand.
       The life drag is unaffected: it starts on a zone underneath and takes
       pointer capture, so it never reaches this element. */
    touch-action: pan-x;
  }

  .blame__row::-webkit-scrollbar {
    display: none;
  }

  .blame__chip {
    display: grid;
    flex: none;
    place-items: center;

    /* A proper touch target. The first version was a 20px pip at 55% opacity,
       which read as disabled rather than unselected. */
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-family: var(--font-numeric);
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .blame__chip[data-selected='true'] {
    border-color: var(--frame-rule-strong);
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .blame__none {
    /* "Not commander damage" has no colour to show, so it keeps the dash. */
    font-size: 1.2rem;
  }

  .blame__caption {
    display: flex;
    gap: var(--space-1);
    align-items: baseline;
    justify-content: center;
    max-width: 100%;
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--size-chip);
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: auto;
  }

  .blame__delta {
    color: var(--loss);
    font-family: var(--font-numeric);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .crown {
    display: inline-flex;
    flex: none;
    gap: var(--space-1);
    align-items: center;
    padding: 2px var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-size: var(--size-chip);
    line-height: 1.4;
  }

  .crown__total {
    font-family: var(--font-numeric);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .crown[data-lethal='true'] {
    border-color: var(--danger);
    color: var(--danger);
  }

  /*
   * Everything transient lives in one stack at the top of the card.
   *
   * The gesture that opens the strip is a downward drag, which puts the hand
   * over the bottom — so the bottom is the one place these must not be. Stacking
   * rather than positioning each by percentage means they cannot collide with
   * each other, and the block's height is bounded by what is in it.
   */
  .top-stack {
    display: grid;
    gap: var(--space-2);
    justify-items: center;
    padding-block-start: var(--space-3);
    padding-inline: var(--space-2);
    pointer-events: none;
  }

  /* Nothing pending: the row collapses and the total sits where it always did. */
  .top-stack:empty {
    display: none;
  }

  .badge-slot {
    pointer-events: auto;
  }

  @keyframes drop-in {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }

    to {
      transform: translateY(0);
      opacity: 1;
    }
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
    .blame,
    .first {
      animation: none;
    }

    .readout {
      transition: none;
    }

    .badge-slot {
      transition: none;
    }
  }
</style>
