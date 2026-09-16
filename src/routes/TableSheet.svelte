<script lang="ts">
  import type { GameStore } from '$lib/gameStore.svelte';
  import { hostTable, inviteToTable } from '$lib/tableConnection.svelte';
  import type { TableHost, TableInvite } from '$lib/tableConnection.svelte';
  import type { PlayerId } from '$domain/ids';
  import { defaultSignalling } from '$lib/signalling';
  import { loadQrScanSheet } from '$lib/scanner';
  import { resolve } from '$app/paths';
  import QrCode from '$ui/components/QrCode.svelte';

  let { store, onclose }: { store: GameStore; onclose: () => void } = $props();

  const signalling = defaultSignalling();

  /*
   * One code for the table, not one per person (ADR 0006). The manual path
   * below it stays per-seat because it has to: a QR handshake with no server
   * is one offer shown to one scanner, which is inherent to holding a phone
   * up to somebody.
   */
  type Mode =
    | { readonly kind: 'table' }
    | { readonly kind: 'pick-a-seat' }
    | { readonly kind: 'manual'; readonly playerId: PlayerId; readonly invite: TableInvite };

  let mode = $state<Mode>({ kind: 'table' });
  let replyDraft = $state('');
  let replyError = $state(false);
  let copied = $state(false);
  let scanning = $state(false);
  let loadedScanner = $state<Awaited<ReturnType<typeof loadQrScanSheet>> | null>(null);

  /*
   * Started in an effect rather than at setup: reading a prop in a top-level
   * expression captures it once, and this way the table also stops offering
   * places when the sheet goes away — including when it is closed by
   * something other than the Done button.
   */
  let table = $state<TableHost | null>(null);

  $effect(() => {
    const host = hostTable(store, signalling);
    table = host;
    return () => host.stop();
  });

  const seats = $derived(store.state?.players ?? []);
  /** Narrowing `mode` does not survive into an event handler's closure, and
   *  the manual branch needs it in several. */
  const manual = $derived(mode.kind === 'manual' ? mode.invite : null);
  const joinLink = $derived(
    table?.code == null ? null : `${window.location.origin}${resolve('/join')}?code=${table.code}`
  );

  // The worker being unreachable at all is not a state worth showing — it is
  // the state the manual fallback exists for, so drop into it rather than
  // making a player read an error.
  $effect(() => {
    if (table?.error && mode.kind === 'table') mode = { kind: 'pick-a-seat' };
  });

  async function openScanner() {
    loadedScanner = await loadQrScanSheet();
    scanning = true;
  }

  function inviteByHand(playerId: PlayerId) {
    mode = { kind: 'manual', playerId, invite: inviteToTable(store, playerId) };
    replyDraft = '';
    replyError = false;
    copied = false;
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // Clipboard access can be refused; the text is still selectable by
      // hand on screen, so there is nothing more to do here.
    }
  }

  async function acceptReply(reply: string) {
    if (manual === null) return;
    try {
      await manual.accept(reply);
      replyError = false;
    } catch {
      replyError = true;
    }
  }

  function submitReply(event: SubmitEvent) {
    event.preventDefault();
    void acceptReply(replyDraft);
  }

  function scanReply(text: string) {
    scanning = false;
    replyDraft = text;
    void acceptReply(text);
  }

  function close() {
    // The effect's teardown stops the table; this only closes the sheet.
    onclose();
  }
</script>

<svelte:window
  onkeydown={(event) => {
    // While the scan sheet is open, its own Escape handler closes just
    // that — closing the table sheet underneath it too would take the
    // player back further than one Escape should.
    if (event.key === 'Escape' && !scanning) close();
  }}
/>

<div class="scrim">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim__hit" onclick={close}></div>

  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="table-title">
    <h2 id="table-title" class="title">Connect a table</h2>

    {#if mode.kind === 'table'}
      {#if table?.code == null}
        <p class="body" role="status">Opening a table…</p>
      {:else}
        <p class="body">One code for everyone — each person picks their own seat.</p>

        <p class="short-code">{table.code}</p>

        {#if joinLink !== null}
          <div class="qr-row">
            <QrCode value={joinLink} />
          </div>
          <!-- The link is a thing to send, not to read. A readonly textarea
               showing it cost a third of the sheet's height and, at 0.7rem,
               made iOS zoom the whole page in on focus — with pinch blocked,
               there was no way back out. A button and a long-press-selectable
               line do the same job. -->
          <button class="action" type="button" onclick={() => copyText(joinLink!)}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        {/if}
      {/if}

      <!-- Who is in. `claimed` is the shared truth, folded from the log, so
           every device agrees on it without anyone being asked. -->
      <h3 class="legend">Seats</h3>
      <!-- Two to a row and compact: six full-width rows were most of why
           this sheet could not fit a phone, and a seat needs to say only
           who it is and whether anyone is in it. -->
      <ul class="players players--compact">
        {#each seats as player (player.id)}
          <li class="seat" data-claimed={player.claimed}>
            <span class="seat__name">{player.name}</span>
            <span class="seat__state">{player.claimed ? 'joined' : 'free'}</span>
          </li>
        {/each}
      </ul>

      <div class="actions">
        <button class="action action--go" type="button" onclick={close}>Done</button>
      </div>
      <button class="fallback" type="button" onclick={() => (mode = { kind: 'pick-a-seat' })}>
        Trouble connecting? Paste a code instead.
      </button>
    {:else if mode.kind === 'pick-a-seat'}
      <!-- The no-server path needs to know whose seat it is offering, because
           the code itself carries that rather than a table to pick from. -->
      <p class="body">Which seat is this code for?</p>
      <ul class="players">
        {#each seats as player (player.id)}
          <li>
            <button class="row" disabled={player.claimed} onclick={() => inviteByHand(player.id)}>
              {player.claimed ? `${player.name} — joined` : `Invite ${player.name}`}
            </button>
          </li>
        {/each}
      </ul>
      <div class="actions">
        <button class="action" type="button" onclick={() => (mode = { kind: 'table' })}>
          Back
        </button>
      </div>
    {:else if manual?.connected}
      <p class="body" role="status">Connected. Their phone now has this game too.</p>
      <div class="actions">
        <button class="action action--go" type="button" onclick={close}>Done</button>
      </div>
    {:else}
      <p class="body">
        Send this code to whoever is joining — a text message, read aloud, however is easiest.
      </p>

      {#if manual === null || manual.code === null}
        <p class="body" role="status">Preparing a code…</p>
      {:else}
        <!-- No server touches this, either direction — the QR carries the
             offer itself, not a link, so this works with no network at
             all (ADR 0004's path 1). -->
        <div class="qr-row">
          <QrCode value={manual.code} />
        </div>
        <div class="code-row">
          <!-- Selectable by long press, but not focusable, so iOS has no
               reason to zoom. A code this long is pasted, never typed. -->
          <p class="code">{manual.code}</p>
          <button class="action" type="button" onclick={() => copyText(manual!.code!)}>
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
          <button class="fallback" type="button" onclick={openScanner}>
            Scan their reply instead
          </button>
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

{#if scanning && loadedScanner}
  {@const QrScanSheet = loadedScanner.QrScanSheet}
  <QrScanSheet
    scanner={loadedScanner.scanner}
    title="Scan their reply"
    body="Point the camera at their code."
    onscan={scanReply}
    onclose={() => (scanning = false)}
  />
{/if}

<style>
  .scrim {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: grid;
    place-items: center;
    padding: clamp(var(--space-2), 2vh, var(--space-4));
    background: var(--surface-scrim);
  }

  .scrim__hit {
    position: absolute;
    inset: 0;
  }

  .sheet {
    position: relative;
    display: grid;
    gap: clamp(var(--space-1), 1.2vh, var(--space-3));
    width: min(24rem, 100%);
    max-height: 100%;
    padding: clamp(var(--space-2), 2vh, var(--space-4));
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-panel);
    box-shadow: var(--shadow-float);
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

  .players--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);
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

  .row:disabled {
    color: var(--text-muted);
    opacity: 0.6;
  }

  .short-code {
    margin: 0;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.6rem;
    letter-spacing: 0.3em;
    text-align: center;
  }

  /* The QR gives up height first when there is not enough: it only has to
     be big enough for a camera across a table, not as big as it can be. */
  .qr-row {
    display: flex;
    justify-content: center;

    /* Bounded by the height available, not only by taste: on a short phone
       this is the one element with enough size to give back. */
    --qr-size: min(11rem, 20vh);

    padding: var(--space-1);
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

  /*
   * Never below 1rem on anything focusable: iOS Safari zooms the page in
   * when a field under 16px takes focus, and this app blocks pinch, so the
   * zoom is a one-way door. The readonly codes are paragraphs now; only a
   * field somebody actually types or pastes into is still a textarea.
   */
  .code {
    width: 100%;

    /* The blob is pasted, not read: it needs to be reachable, not roomy. */
    max-height: clamp(2.75rem, 8vh, 4.5rem);
    padding: var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-primary);
    font-family: monospace;
    font-size: 1rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
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

  .legend {
    margin: 0;
    color: var(--text-faint);
    font-size: 0.75rem;
    font-weight: 400;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .seat {
    display: flex;
    gap: var(--space-1);
    align-items: baseline;
    justify-content: space-between;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
  }

  .seat__name {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.85rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seat[data-claimed='true'] .seat__name {
    color: var(--text-primary);
  }

  .seat__state {
    color: var(--text-faint);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .seat[data-claimed='true'] .seat__state {
    color: var(--text-gold);
  }
</style>
