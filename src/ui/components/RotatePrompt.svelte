<!--
  This app locks to portrait, for now — a real landscape layout for six
  players (three seats upside down, three regular) is future work, and a
  cramped, unplanned landscape grid is worse than asking for portrait back.

  The manifest declares `orientation: portrait-primary`, which an installed
  app honours. A page open in an ordinary browser tab cannot be rotated by any
  API without first entering fullscreen, so this is the fallback for that
  case: cover the board and ask, rather than show a layout nobody designed.
-->
<div
  class="prompt"
  role="alertdialog"
  aria-modal="true"
  aria-label="Turn your phone back to portrait"
>
  <p>This game is played in portrait. Turn your phone back to keep playing.</p>
</div>

<style>
  .prompt {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 100;
    place-items: center;
    padding: var(--space-6);
    background: var(--surface-page);
    color: var(--text-primary);
    font-size: var(--size-body);
    text-align: center;
    text-wrap: balance;
  }

  /*
   * Only a phone turned sideways, not a tablet or a desktop window that
   * happens to be wide and short — those already have their own grid at
   * `width >= 60rem` in GameBoard. `display: none` also removes this from
   * the accessibility tree until the query matches, so it is never
   * discoverable by Tab when hidden.
   */
  @media (orientation: landscape) and (width < 60rem) {
    .prompt {
      display: grid;
    }
  }
</style>
