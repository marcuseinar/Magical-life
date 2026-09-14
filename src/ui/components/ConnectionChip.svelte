<script lang="ts">
  let { state }: { state: 'direct' | 'lost' } = $props();
</script>

<!--
  "Lost" is an alert rather than a status: a stale opponent panel is a
  correctness problem, not a fact worth a passing mention, so a screen
  reader user should be interrupted the same way a sighted player is
  interrupted by the colour change.
-->
{#if state === 'lost'}
  <p class="chip chip--lost" role="alert" aria-label="Connection lost">Connection lost</p>
{:else}
  <p class="chip chip--direct" role="status" aria-label="Direct connection">Direct connection</p>
{/if}

<style>
  .chip {
    align-self: center;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-size: var(--size-chip);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .chip--lost {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
