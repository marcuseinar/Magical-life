# Interaction design — changing life

## The unifying idea

Both requested input styles produce the same thing: a **pending delta** that
accumulates, is displayed prominently, and commits after a quiet period.

```
        input adapter                  shared machine
  ┌────────────────────┐
  │ tap zones          │──┐
  ├────────────────────┤  │      Idle ──input──▶ Accumulating(delta, t)
  │ drag scrubber      │──┼──▶            ▲          │
  ├────────────────────┤  │               └──input───┘   (timer resets)
  │ hardware volume    │──┘                          │
  ├────────────────────┤                        t elapses
  │ remote peer        │──▶ (bypasses, already committed)
  └────────────────────┘                             ▼
                                                 Committed
                                            (one life/changed event)
```

This matters for three reasons:

- One state machine to test exhaustively, N thin input adapters to test trivially.
- Adding an input method later (hardware buttons, a smartwatch, voice) is a new
  adapter, not a change to the core.
- The log stays readable: "Anna −7" not seven separate "−1" entries.

`Accumulating` is UI state and is never written to the event log. Only the
commit produces a `life/changed` event. Batching window: **4 s** default,
configurable 2–10 s, with a per-user setting.

## Style 1 — tap zones

The classic Lifetap model.

- The player's panel splits into a left half (decrease) and right half (increase).
- Each tap changes by 1. Hold to repeat, accelerating: 1/tap → after 500 ms,
  4/s → after 1.5 s, 12/s.
- The running delta appears as a large badge — `−7` — over the total, in the
  accent colour for gains and the danger colour for losses.
- The badge is a button. Tapping it cancels the whole pending delta. This is the
  fastest possible undo and it costs no extra chrome.
- A thin ring around the badge drains as the commit timer runs, so the window is
  visible rather than mysterious.

Split ratio is **50/50, not 40/60**. Asymmetric zones read as a bug on a device
you're holding in the dark at 11pm.

## Style 2 — drag to scrub

Three candidates were considered.

| Candidate                                                           | Verdict                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Vertical drag-scrub** — press and drag up/down, release to commit | **Chosen**                                                                      |
| iOS-style wheel picker, flick then confirm                          | More discoverable, but two-handed and slow; a good _fallback_ for accessibility |
| Radial dial                                                         | Looks great in a demo, poor one-handed ergonomics, hard to hit precisely        |

### The chosen gesture

1. **Press a zone.** The tap registers at once — one point, immediately, because
   a life counter that waits for your finger to lift feels broken.
2. **Drag up to gain, down to lose.** Past 12 px of vertical travel the press
   becomes a scrub: the delta badge follows your thumb from wherever the tap
   left it.
3. **Release to commit** — immediately, not after the 4 s window. A deliberate
   gesture deserves an immediate result. The badge stays visible for the
   normal window purely so you can still tap it to cancel.
4. **Cancel** by dragging back through zero, or by tapping the badge.

Engagement is by **movement, not by a hold timer**. An earlier draft used a
180 ms press-and-hold, which reads well on paper but collides with hold-to-repeat
— and hold-to-repeat is the one thing everyone already expects from a life
counter. Separating them by axis instead of by time lets both exist: holding
still repeats, moving scrubs, and a scrub inherits whatever the taps have
already accumulated rather than discarding it.

### Scrub sensitivity

A flat pixels-per-point ratio fails at both ends: 1 point of precision needs a
fine ratio, and a 40-point Commander swing needs a coarse one. So the ratio is
distance-dependent, not velocity-dependent:

| Distance from press origin | Points per 8 px |
| -------------------------- | --------------- |
| 0–60 px                    | 1               |
| 60–160 px                  | 2               |
| 160 px+                    | 5               |

Distance-based rather than velocity-based because it is **reversible**: dragging
back to the same pixel always gives the same number. Velocity-scaled scrubbing
famously cannot be undone by reversing the gesture, and that feels broken.

A haptic tick fires on each unit change up to 5 units, then on each multiple of
5 — otherwise a 40-point swing buzzes like a phone call.

### Discoverability

Style 2 is invisible until you find it. A first-run hint on the panel ("drag to
change by a lot") is the planned answer. No mode switch is needed: because the
two styles are separated by axis rather than by time, both are always live and
neither can steal the other's input.

## Reading the numbers

- The total is the largest thing on screen and stays legible at arm's length
  across a table: `clamp(4rem, 22vmin, 12rem)`, tabular figures, so digits do
  not jitter as the number changes.
- Life ≤ 5 pulses the panel border in the danger colour. Life ≤ 0 desaturates
  the panel and offers "eliminated".
- Poison ≥ 8 and commander damage ≥ 17 from any one source raise the same
  warning treatment. Near-lethal is near-lethal regardless of the mechanism.

## Panel layout by player count

Every player must be able to read their own total right-way-up, so panels rotate.

| Players | Layout                                                             |
| ------- | ------------------------------------------------------------------ |
| 1       | Full screen                                                        |
| 2       | Stacked halves, top panel rotated 180°                             |
| 3       | Two rotated on the left, one on the right (or 3-up rows on tablet) |
| 4       | 2×2, top row rotated 180°                                          |
| 5–6     | 2×3, top row rotated 180°                                          |

Rotation is a CSS transform on the panel, not a separate component. The
component does not know it is upside down.

## Counters and secondary state

The number that matters is life; everything else must not compete with it.

Each panel has a **counter tray** — a collapsed strip along its inner edge
showing only counters that are non-zero, plus a `+` to add one. Tapping a chip
expands it to a stepper. Poison is pinned first when the format uses it.

Counters shipped: poison, energy, experience, rad, ticket, and free-form named
counters. Flags (monarch, initiative, city's blessing, day/night) are a single
shared chip that shows who holds it; tapping moves it, which writes a
`flag/moved` event. Exactly one holder is enforced by the reducer, so the UI
cannot get it wrong.

## Choosing who goes first

Somebody has to go first and nobody wants to argue about it, so the app decides —
but a result that simply appears is a missed moment. Instead a spotlight travels
round the table, slowing as it goes, and settles on the winner.

**The result is decided before the animation starts.** The use case picks a
player, records `turn/firstPlayer`, and only then does the spin run — landing on
the seat that was already chosen. Keeping the two apart means the theatre cannot
influence the outcome, the log is honest, and the choice stays testable without
a clock.

The schedule (`ui/interaction/firstPlayerSpin.ts`) is pure and fixed at 2.2
seconds regardless of the winner or the number of players, so the _length_ of
the spin never hints at who won. It makes two full passes of the table before
running in to the winner, so nobody appears to have been skipped, and the delays
grow so the last few steps land like a coin settling.

While it runs, every panel except the lit one falls back. That is what makes it
read as a light travelling round a table rather than a card changing colour —
which matters when the person watching is sitting opposite.

Under `prefers-reduced-motion` the schedule collapses to a single step: the
answer, immediately.

## Choosing who goes first

The winner is decided by the use case and written to the log _before_ anything
moves. The animation is presentation only: it reveals an answer that already
exists, so the drama can never change the result, and the schedule stays a pure
function with no randomness of its own.

The reveal is two phases, because that is what the eye reads as a spin:

1. **A flurry** — ten flat 60 ms flicks round the table, about 600 ms of even,
   readable alternation.
2. **A ramp** — steeply decelerating into a pause of half a second or more on
   the winner.

Then the winner's panel **blinks three times**, so a table of six all see the
result without anyone having to announce it.

A single smooth deceleration curve was tried first and was wrong. Spread across
twenty-odd steps it flattens into a uniform drift; spread across few enough
steps to have a real tail, it makes the opening frames 1–40 ms — shorter than a
frame, so the fast phase is not fast, it is invisible. Separating the phases
lets both halves be right, and a floor of `MIN_STEP_MS` guarantees no step is
ever too short to see.

Total duration is fixed regardless of seat count or winner, so the length of the
spin never hints at the answer. Under `prefers-reduced-motion` there is no spin
and no blink: the result appears at once.

### It names the first player, not the player who chooses

The rules do not work the way this feature does, and that is deliberate.

Under the Comprehensive Rules the random method decides _who chooses_; that
player then decides whether to play or draw. In a match, after the first game it
is the loser of the previous game who chooses, with no roll at all. This applies
in multiplayer too, not only in one-on-one.

The app skips that step and names a first player outright. Weighed and rejected:
a prompt after the spin — "Play" or "Draw" in a duel, tap a panel in a pod —
would be rules-accurate at the cost of one extra tap before every single game.
For a counter whose defining requirement is being instant to start, the tap
costs more than the accuracy buys. Players who care about play-or-draw already
know they are choosing, and can roll again or simply agree.

Revisit if: tournament support arrives (M5), where the distinction is real and
a judge may need the log to show who won the roll separately from who started —
or if the previous-game-loser rule becomes worth automating between rematches.

## The app is a surface, not a document

Nothing scrolls and nothing zooms. A life counter lives face-up on a table
getting knocked and leaned on, and a stray drag that scrolls the page out from
under a tap is worse than useless.

- `html`/`body` are fixed and `overflow: hidden`; `overscroll-behavior: none`
  kills the rubber band.
- `touch-action: none` on the body stops pinch-zoom and double-tap-zoom. The
  counter sheet and the setup screen opt back in with `touch-action: pan-y`,
  because they are the only things that can be taller than the screen.
- Safari runs its own pinch gesture above `touch-action`, so `gesturestart` and
  friends are cancelled directly.

Deliberately **not** used: `user-scalable=no` / `maximum-scale=1` in the viewport
meta. Safari on iOS has ignored both since iOS 10 — they would not have worked
on the device this was reported from — and they fail the accessibility gate.

## Counters live in a sheet, not in the card

The counter editor is rendered at page level and opened over the board, not
inside the panel. A panel is small and clips its own overflow: an editor drawn
inside one spills off the card at four players and off the screen at six, taking
the life total with it as the plate grows.

The sheet rotates to match its player's panel, so it reads the right way up from
that seat.

## Accessibility

Not an afterthought, because it is also what makes UI testing possible.

- Every control is a real focusable element with an accessible name. Playwright
  and Testing Library both query by role, so an inaccessible app is also an
  untestable one.
- The tap zones are `<button>`s with `aria-label="Anna, decrease life"`.
- The total is an `aria-live="polite"` region announcing the committed result,
  not every intermediate scrub value.
- Full keyboard path: arrows to change, tab between players, Enter to commit,
  Escape to cancel — which doubles as the fastest possible E2E test harness.
- `prefers-reduced-motion` removes the badge animation and the pulse; the
  commit ring becomes a static countdown.
- Colour is never the only signal: gains carry a `+`, losses a `−`.
