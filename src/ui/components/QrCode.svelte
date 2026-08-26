<script lang="ts">
  import { encodeQr } from '$ui/interaction/qrCode';

  let { value, size = 176 }: { value: string; size?: number } = $props();

  const matrix = $derived(encodeQr(value));
  const cell = $derived(size / matrix.size);
  const modules = $derived(
    Array.from({ length: matrix.size }, (_, row) =>
      Array.from({ length: matrix.size }, (_, col) => ({ row, col, dark: matrix.isDark(row, col) }))
    ).flat()
  );
</script>

<!--
  A QR code's own pixels are not a themeable colour choice — they are a
  contrast requirement a camera has to resolve, in whatever light the table
  is in. White and black, unconditionally, regardless of the app's theme.
-->
<svg
  role="img"
  aria-label="QR code to join the table"
  viewBox="0 0 {size} {size}"
  width={size}
  height={size}
  class="qr"
>
  <rect width={size} height={size} fill="white" />
  {#each modules as module (module.row * matrix.size + module.col)}
    {#if module.dark}
      <rect x={module.col * cell} y={module.row * cell} width={cell} height={cell} fill="black" />
    {/if}
  {/each}
</svg>

<style>
  .qr {
    display: block;
    border-radius: var(--radius-md);
  }
</style>
