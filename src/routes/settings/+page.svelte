<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { useGameStore, usePreferences } from '$lib/context';

  const store = useGameStore();
  const preferences = usePreferences();

  let confirming = $state(false);

  async function clearHistory() {
    confirming = false;
    await store.clearHistory();
    await goto(resolve('/'));
  }
</script>

<svelte:head>
  <title>Settings — Magical Life</title>
</svelte:head>

<main class="settings">
  <header class="masthead">
    <h1 class="title">Settings</h1>
  </header>

  <section class="group">
    <h2 class="legend">Feedback</h2>
    <div class="setting">
      <span class="setting__text">
        <span class="setting__name" id="impact-effects-label">Damage &amp; life effects</span>
        <span class="setting__hint">
          A spray of blood falling for damage, energy rising for life gained.
        </span>
      </span>
      <button
        class="toggle"
        type="button"
        role="switch"
        aria-checked={preferences.impactEffects}
        aria-labelledby="impact-effects-label"
        onclick={() => preferences.setImpactEffects(!preferences.impactEffects)}
      >
        {preferences.impactEffects ? 'On' : 'Off'}
      </button>
    </div>
  </section>

  <section class="group">
    <h2 class="legend">History</h2>
    <p class="body">
      Every game played on this device stays in a log on the device itself — it is what Undo reads,
      and it never leaves the phone. Starting a new game adds to it rather than replacing it.
    </p>
    <!-- The only caller of `log.clear()` in the app (ADR 0005), and the only
         thing here that destroys anything. It used to happen as a side effect
         of tapping New game. -->
    <button class="danger" type="button" onclick={() => (confirming = true)}>Clear history</button>
  </section>

  <button class="secondary" type="button" onclick={() => goto(resolve('/'))}>
    Back to the game
  </button>
</main>

{#if confirming}
  <div class="scrim">
    <div class="confirm" role="dialog" aria-modal="true" aria-labelledby="clear-title">
      <h2 id="clear-title" class="confirm__title">Clear the history?</h2>
      <p class="confirm__body">
        Every game on this device goes, including the one in progress. This cannot be undone.
      </p>
      <div class="confirm__actions">
        <button class="action" type="button" onclick={() => (confirming = false)}>Keep it</button>
        <button class="action action--danger" type="button" onclick={clearHistory}>
          Clear history
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings {
    display: grid;
    align-content: start;
    gap: var(--space-5);
    width: min(28rem, 100%);
    height: 100%;
    margin-inline: auto;
    padding: var(--space-5) var(--space-4);
  }

  .masthead {
    text-align: center;
  }

  .title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.6rem;
    letter-spacing: var(--tracking-display);
  }

  .group {
    display: grid;
    gap: var(--space-3);
  }

  .legend {
    margin: 0;
    color: var(--text-faint);
    font-size: 0.8rem;
    font-weight: 400;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .body {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .setting {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
  }

  .setting__text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .setting__name {
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  .setting__hint {
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .toggle {
    flex: none;
    min-width: 4rem;
    min-height: 2.75rem;
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

  /* Deliberately not full width. Stacked above the way out, in the same
     geometry, the only thing telling them apart was colour — and the louder
     of the two was the one that destroys everything. */
  .danger {
    justify-self: start;
    min-height: 2.75rem;
    padding: 0 var(--space-4);
    border: 1px solid var(--danger);
    border-radius: var(--radius-pill);
    color: var(--danger);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .secondary {
    width: 100%;
    min-height: 3rem;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
  }

  .scrim {
    position: fixed;
    z-index: 30;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: var(--surface-scrim);
  }

  .confirm {
    display: grid;
    gap: var(--space-3);
    width: min(24rem, 100%);
    padding: var(--space-5);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-lg);
    background: var(--surface-panel);
    box-shadow: var(--shadow-float);
    text-align: center;
  }

  .confirm__title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.35rem;
    letter-spacing: var(--tracking-display);
  }

  .confirm__body {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .confirm__actions {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
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

  .action--danger {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
