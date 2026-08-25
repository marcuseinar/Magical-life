<script lang="ts">
  import { MAX_PLAYER_NAME } from '$domain/rules';
  import type { PlayerState } from '$domain/state';
  import ManaPip from './ManaPip.svelte';

  let {
    player,
    rotated = false,
    onrename,
    onclose
  }: {
    player: PlayerState;
    rotated?: boolean;
    onrename: (name: string) => void;
    onclose: () => void;
  } = $props();

  /* Seeded once, deliberately. The sheet is mounted fresh each time it opens, and
     re-syncing to `player` afterwards would overwrite what is being typed the
     moment anything else about that player changed. */
  // svelte-ignore state_referenced_locally
  let draft = $state(player.name);
  let field = $state<HTMLInputElement | null>(null);

  // Selected, not just focused: the name is almost always being replaced rather
  // than edited, and nobody wants to clear "Player 3" a character at a time.
  $effect(() => field?.select());

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    onrename(draft);
  };
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') onclose();
  }}
/>

<div class="scrim">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim__hit" onclick={onclose}></div>

  <form
    class="sheet"
    data-rotated={rotated}
    data-colour={player.colour}
    onsubmit={submit}
    aria-label="Rename {player.name}"
  >
    <div class="head">
      <ManaPip colour={player.colour} size={22} />
      <h2 class="title">Who is playing?</h2>
    </div>

    <label class="field">
      <span class="sr-only">Name</span>
      <input
        bind:this={field}
        bind:value={draft}
        class="input"
        type="text"
        maxlength={MAX_PLAYER_NAME}
        autocomplete="off"
        autocapitalize="words"
        spellcheck="false"
        enterkeyhint="done"
      />
    </label>

    <div class="actions">
      <button class="action" type="button" onclick={onclose}>Cancel</button>
      <button class="action action--go" type="submit" disabled={draft.trim() === ''}>Save</button>
    </div>
  </form>
</div>

<style>
  .scrim {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: var(--surface-scrim);
  }

  .scrim__hit {
    position: absolute;
    inset: 0;
  }

  .sheet {
    position: relative;
    display: grid;
    gap: var(--space-3);
    width: min(22rem, 100%);
    padding: var(--space-4);
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-lg);
    background: linear-gradient(175deg, var(--player-ink), var(--surface-panel) 85%);
    box-shadow: var(--shadow-float);
  }

  .sheet[data-rotated='true'] {
    transform: rotate(180deg);
  }

  .head {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1rem;
    letter-spacing: var(--tracking-display);
  }

  .field {
    display: grid;
  }

  .input {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: 1.15rem;
    letter-spacing: 0.03em;

    /* A text field is the one place in this app that must accept a caret; the
       app disables selection globally. */
    /* stylelint-disable-next-line property-no-vendor-prefix -- iOS Safari still needs it */
    -webkit-user-select: text;
    user-select: text;
  }

  .input:focus-visible {
    border-color: var(--frame-rule-strong);
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .action {
    min-height: 2.75rem;
    padding: 0 var(--space-4);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .action--go {
    border-color: var(--frame-rule-strong);
    color: var(--text-gold);
  }

  .action:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
