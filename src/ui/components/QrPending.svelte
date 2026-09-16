<script lang="ts">
  import LoadingDots from './LoadingDots.svelte';
</script>

<!--
  The square a QR is going to occupy, for the moment before there is anything
  to put in it. Takes `--qr-size` from the row it sits in exactly as `QrCode`
  does, so the box is the same size either way and nothing below it moves
  when the real one arrives.
-->
<span class="pending"><LoadingDots /></span>

<style>
  .pending {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: var(--qr-size, 11rem);
    aspect-ratio: 1;
    font-size: 1.6rem;
  }
</style>
