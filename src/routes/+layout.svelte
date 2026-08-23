<script lang="ts">
  import '@fontsource/cinzel/latin-400.css';
  import '@fontsource/cinzel/latin-700.css';
  import '@fontsource/cinzel/latin-900.css';
  import '$ui/tokens/base.css';

  let { children } = $props();
</script>

<div class="app">
  {@render children()}
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: 1fr;
    height: 100dvh;

    /* Never let a life total hide behind a notch. */
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
      env(safe-area-inset-left);
  }
</style>
