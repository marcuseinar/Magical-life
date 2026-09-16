<!--
  Three dots, for a box that knows how big it will be but not yet what goes
  in it. Sized in `em` and drawn in `currentColor`, so it takes the size and
  the colour of whatever it is standing in for rather than carrying its own.

  Hidden from assistive technology on purpose: dots say "wait" by looking
  like waiting, which is nothing to a screen reader. Whatever holds these
  says it in words instead — usually a live region, so the wait and its end
  are both announced.
-->
<span class="dots" aria-hidden="true">
  <span class="dot"></span>
  <span class="dot"></span>
  <span class="dot"></span>
</span>

<style>
  .dots {
    display: inline-flex;
    gap: 0.35em;
    align-items: center;
    justify-content: center;
  }

  .dot {
    width: 0.4em;
    height: 0.4em;
    border-radius: 50%;
    background: currentcolor;
    opacity: 0.3;
    animation: waiting 1.4s ease-in-out infinite;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes waiting {
    0%,
    100% {
      opacity: 0.3;
    }

    50% {
      opacity: 1;
    }
  }

  /* Still three dots, still clearly a placeholder — just not moving. */
  @media (prefers-reduced-motion: reduce) {
    .dot {
      opacity: 0.55;
      animation: none;
    }
  }
</style>
