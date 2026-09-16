<script lang="ts">
  /**
   * The once-per-game actions, off the toolbar.
   *
   * Undo and the life totals are reached for constantly; Rematch, a new game
   * and settings are reached for at the seams between games. Giving all of
   * them equal billing in one row was what pushed "Connect a table" out of
   * the toolbar entirely and into a link nobody found.
   */
  let {
    onrematch,
    onnewgame,
    onjoin,
    onsettings,
    onclose
  }: {
    onrematch: () => void;
    onnewgame: () => void;
    onjoin: () => void;
    onsettings: () => void;
    onclose: () => void;
  } = $props();
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') onclose();
  }}
/>

<div class="scrim">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim__hit" onclick={onclose}></div>

  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="menu-title">
    <h2 id="menu-title" class="title">Menu</h2>

    <!-- The hint sits outside its button on purpose. Inside, it would join
         the button's accessible name — "Rematch Same players, fresh totals" —
         and the name of an action should be the action. `aria-describedby`
         is how the hint still reaches a screen reader, as a description. -->
    <ul class="items">
      <li class="item">
        <button class="row" type="button" onclick={onrematch} aria-describedby="hint-rematch">
          Rematch
        </button>
        <p class="hint" id="hint-rematch">Same players, fresh totals</p>
      </li>
      <li class="item">
        <!-- No confirmation: this goes to setup, and the game it was opened
             from is still in the log the whole time it is open. -->
        <button class="row" type="button" onclick={onnewgame} aria-describedby="hint-new-game">
          New game
        </button>
        <p class="hint" id="hint-new-game">Change the format, the size, or the life</p>
      </li>
      <li class="item">
        <!-- The other side of the table from the Table pill, which invites
             people to this device's game. This one goes and sits at
             somebody else's, and leaves this device's own game untouched —
             a joined table keeps its own store. -->
        <button class="row" type="button" onclick={onjoin} aria-describedby="hint-join">
          Join a table
        </button>
        <p class="hint" id="hint-join">Take a seat on someone else's game</p>
      </li>
      <li class="item">
        <button class="row" type="button" onclick={onsettings} aria-describedby="hint-settings">
          Settings
        </button>
        <p class="hint" id="hint-settings">History, and what this device keeps</p>
      </li>
    </ul>

    <div class="actions">
      <button class="action" type="button" onclick={onclose}>Keep playing</button>
    </div>
  </div>
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
    width: min(24rem, 100%);
    max-height: 90vh;
    padding: var(--space-4);
    overflow-y: auto;
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-panel);
    box-shadow: var(--shadow-float);
    touch-action: pan-y;
  }

  .title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.1rem;
    letter-spacing: var(--tracking-display);
  }

  .items {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    gap: 2px;
  }

  .row {
    width: 100%;
    min-height: 2.75rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    text-align: left;
  }

  .hint {
    margin: 0;
    padding-inline: var(--space-3);
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .actions {
    display: flex;
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
</style>
