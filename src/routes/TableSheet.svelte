<script lang="ts">
  import type { GameStore } from '$lib/gameStore.svelte';
  import { inviteToTable, inviteToTableByCode } from '$lib/tableConnection.svelte';
  import type { TableInvite, TableInviteByCode } from '$lib/tableConnection.svelte';
  import type { PlayerId } from '$domain/ids';
  import { defaultSignalling } from '$lib/signalling';
  import { resolve } from '$app/paths';
  import QrCode from '$ui/components/QrCode.svelte';

  let { store, onclose }: { store: GameStore; onclose: () => void } = $props();

  const signalling = defaultSignalling();

  type Active =
    | { readonly mode: 'code'; readonly playerId: PlayerId; readonly invite: TableInviteByCode }
    | { readonly mode: 'manual'; readonly playerId: PlayerId; readonly invite: TableInvite };

  let active = $state<Active | null>(null);
  let replyDraft = $state('');
  let replyError = $state(false);
  let copied = $state(false);

  function invite(playerId: PlayerId) {
    active = { mode: 'code', playerId, invite: inviteToTableByCode(store, playerId, signalling) };
    replyDraft = '';
    replyError = false;
    copied = false;
  }

  function useManualCode() {
    if (active === null) return;
    const { playerId } = active;
    if (active.mode === 'code') active.invite.stop();
    active = { mode: 'manual', playerId, invite: inviteToTable(store, playerId) };
    replyDraft = '';
    replyError = false;
    copied = false;
  }

  // The worker being unreachable at all (offline, not deployed, blocked
  // network) is not a state worth showing — it is the state the manual
  // fallback exists for, so drop into it the moment it's clear the
  // short-code path cannot work rather than making a player read an error.
  $effect(() => {
    if (active?.mode === 'code' && active.invite.error) useManualCode();
  });

  const joinLink = $derived(
    active?.mode === 'code' && active.invite.code !== null
      ? `${window.location.origin}${resolve('/join')}?code=${active.invite.code}`
      : null
  );

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // Clipboard access can be refused; the text is still selectable by
      // hand on screen, so there is nothing more to do here.
    }
  }

  async function submitReply(event: SubmitEvent) {
    event.preventDefault();
    if (active === null || active.mode !== 'manual') return;
    try {
      await active.invite.accept(replyDraft);
      replyError = false;
    } catch {
      replyError = true;
    }
  }

  function close() {
    if (active?.mode === 'code') active.invite.stop();
    onclose();
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') close();
  }}
/>

<div class="scrim">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim__hit" onclick={close}></div>

  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="table-title">
    <h2 id="table-title" class="title">Connect a table</h2>

    {#if active === null}
      <p class="body">Give another player's seat to their own phone.</p>
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
        <button class="action action--go" type="button" onclick={close}>Done</button>
      </div>
    {:else if active.mode === 'code'}
      {#if active.invite.expired}
        <p class="body" role="status">Nobody joined in time. That code has expired.</p>
        <div class="actions">
          <button class="action" type="button" onclick={close}>Cancel</button>
          <button class="action action--go" type="button" onclick={() => invite(active!.playerId)}>
            Try again
          </button>
        </div>
      {:else}
        {#if active.invite.code === null}
          <p class="body" role="status">Preparing a code…</p>
        {:else}
          <p class="body">
            Send this to whoever is joining, or let them scan it — either way, their phone connects
            on its own once they do.
          </p>

          <p class="short-code">{active.invite.code}</p>

          {#if joinLink !== null}
            <div class="qr-row">
              <QrCode value={joinLink} />
            </div>
            <div class="code-row">
              <textarea class="code" readonly value={joinLink} rows="2"></textarea>
              <button class="action" type="button" onclick={() => copyText(joinLink!)}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          {/if}
        {/if}

        <div class="actions">
          <button class="action" type="button" onclick={close}>Cancel</button>
        </div>
        <!-- Reachable even while a code is still being prepared — a slow
             worker is exactly one of the "troubles" this exists for, not
             only an already-failed one. -->
        <button class="fallback" type="button" onclick={useManualCode}>
          Trouble connecting? Use a code you paste instead.
        </button>
      {/if}
    {:else}
      <p class="body">
        Send this code to whoever is joining — a text message, read aloud, however is easiest.
      </p>

      {#if active.invite.code === null}
        <p class="body" role="status">Preparing a code…</p>
      {:else}
        <div class="code-row">
          <textarea class="code" readonly value={active.invite.code} rows="3"></textarea>
          <button class="action" type="button" onclick={() => copyText(active!.invite.code!)}>
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
            <button class="action" type="button" onclick={close}>Cancel</button>
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

  .short-code {
    margin: 0;
    padding: var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.6rem;
    letter-spacing: 0.3em;
    text-align: center;
  }

  .qr-row {
    display: flex;
    justify-content: center;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: white;
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

  .fallback {
    padding: var(--space-2) 0 0;
    color: var(--text-muted);
    font-size: 0.75rem;
    text-align: center;
    text-decoration: underline;
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
