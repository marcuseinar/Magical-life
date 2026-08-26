<script lang="ts">
  import type { GameStore } from '$lib/gameStore.svelte';
  import { inviteToTable } from '$lib/tableConnection.svelte';
  import type { TableInvite } from '$lib/tableConnection.svelte';
  import type { PlayerId } from '$domain/ids';

  let { store, onclose }: { store: GameStore; onclose: () => void } = $props();

  let active = $state<{ playerId: PlayerId; invite: TableInvite } | null>(null);
  let replyDraft = $state('');
  let replyError = $state(false);
  let copied = $state(false);

  function invite(playerId: PlayerId) {
    active = { playerId, invite: inviteToTable(store, playerId) };
    replyDraft = '';
    replyError = false;
  }

  async function copyCode() {
    const code = active?.invite.code;
    if (code === null || code === undefined) return;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      // Clipboard access can be refused; the code is still selectable by hand
      // in the field beneath the button, so there is nothing more to do here.
    }
  }

  async function submitReply(event: SubmitEvent) {
    event.preventDefault();
    if (active === null) return;
    try {
      await active.invite.accept(replyDraft);
      replyError = false;
    } catch {
      replyError = true;
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') onclose();
  }}
/>

<div class="scrim">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim__hit" onclick={onclose}></div>

  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="table-title">
    <h2 id="table-title" class="title">Connect a table</h2>

    {#if active === null}
      <p class="body">
        Give another player's seat to their own phone. This is a very early, no-frills version — no
        QR code yet, just a code to send them.
      </p>
      <ul class="players">
        {#each store.state?.players ?? [] as player (player.id)}
          <li>
            <button class="row" onclick={() => invite(player.id)}>
              Invite {player.name}
            </button>
          </li>
        {/each}
      </ul>
    {:else if active.invite.connected}
      <p class="body" role="status">Connected. Their phone now has this game too.</p>
      <div class="actions">
        <button class="action action--go" type="button" onclick={onclose}>Done</button>
      </div>
    {:else}
      <p class="body">
        Send this code to whoever is joining — a text message, read aloud, however is easiest.
      </p>

      {#if active.invite.code === null}
        <p class="body" role="status">Preparing a code…</p>
      {:else}
        <div class="code-row">
          <textarea class="code" readonly value={active.invite.code} rows="3"></textarea>
          <button class="action" type="button" onclick={copyCode}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <form class="reply" onsubmit={submitReply}>
          <label class="field">
            <span class="label">Paste their reply</span>
            <textarea
              bind:value={replyDraft}
              class="code"
              rows="3"
              autocomplete="off"
              spellcheck="false"></textarea>
          </label>
          {#if replyError}
            <p class="error" role="alert">
              That did not look like a reply code. Check it was copied in full.
            </p>
          {/if}
          <div class="actions">
            <button class="action" type="button" onclick={onclose}>Cancel</button>
            <button class="action action--go" type="submit" disabled={replyDraft.trim() === ''}>
              Connect
            </button>
          </div>
        </form>
      {/if}
    {/if}
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

  .body {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .players {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    width: 100%;
    min-height: 2.75rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-primary);
    text-align: left;
  }

  .code-row {
    display: grid;
    gap: var(--space-2);
  }

  .field {
    display: grid;
    gap: var(--space-1);
  }

  .label {
    color: var(--text-muted);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .code {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-primary);
    font-family: monospace;
    font-size: 0.7rem;
    line-height: 1.4;
    overflow-wrap: break-word;
    resize: none;

    /* This is the one thing on the sheet a player must be able to select and
       copy by hand; the app disables selection globally. */
    /* stylelint-disable-next-line property-no-vendor-prefix -- iOS Safari still needs it */
    -webkit-user-select: text;
    user-select: text;
  }

  .reply {
    display: grid;
    gap: var(--space-2);
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.8rem;
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
