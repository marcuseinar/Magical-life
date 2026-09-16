# ADR 0005 — Navigation and the game lifecycle

- Status: Accepted
- Date: 2026-09-16

## Context

`src/routes/+page.svelte` chooses what to render from whether a game exists:
`NewGameSheet` when `store.state === null`, `GameScreen` otherwise. There is no
third branch, so "show me setup" and "there is no game" are one condition.

The consequence is the New game button. To reach setup it has to make
`store.state` null, which it does through `store.abandon()` →
`session.reset()` → `log.clear()`. Every event ever recorded on the device is
deleted so that a different screen can be shown.

That is the only place in the app that destroys history. `rematch` appends a
second `game/started` and deliberately leaves the finished game in the log;
rule 4 of the working agreement says state is derived and never mutated in
place; ADR 0002 makes the log the single source of truth and undo a retraction
rather than a rollback. One button contradicts all three, and it is labelled
with the most ordinary phrase in the app.

The same coupling blocks three things the app now needs: a lobby that can be
opened without interrupting a game, a settings screen, and the game log view
the roadmap defers. None of them can exist while "another screen" means "no
game".

## Options considered

**Keep state-derived rendering, add a `wantsSetup` flag.** Smallest possible
change — one boolean in `+page.svelte`, and New game stops clearing. Rejected
as the shape rather than the fix: each further screen adds another flag and
another combination to reason about, the back button still does nothing, and
nothing code-splits. It solves the symptom this week and is in the way by M4.

**An in-component screen stack.** One `screen` state in a shell component with
an explicit push/pop history. Honest about being a state machine, and it keeps
everything in one file. Rejected: it reimplements the router SvelteKit already
provides, `/join` is already a route so the app would have two navigation
mechanisms, and per-screen code-splitting — which is how rule 8 stays true once
M5 adds accounts — would have to be built by hand.

**Screens as routes, with the store hoisted to the layout.** Chosen.

**Separately: should ending a game clear the log at all?** Considered keeping
`log.clear()` behind New game and simply warning harder. Rejected: the warning
cannot recover the game, and M2's post-game summary and the deferred log view
both need history that survives the start of the next game. The capability is
still needed — an append-only log grows forever, and handing a phone to someone
else is a real reason to wipe it — but as its own named action, not as the
side effect of starting a game.

## Decision

**Navigation is explicit, not derived.** Screens are SvelteKit routes: `/` the
game, `/setup`, `/table`, `/join`, and settings. The one `GameStore` moves to
`+layout.svelte` and reaches screens through `$lib/context.ts` — which exists
for this and is currently unused, every route passing the store as a prop
instead. A screen change must not unmount the game; hoisting the store is what
makes that true.

Routes rather than a hand-rolled stack because the back button then works on
the web today and for Capacitor's hardware back button in M4, each screen
code-splits, and `/join` is already one.

**Starting a game appends. Nothing else destroys.** Four actions, one of which
is destructive and says so:

| Action        | Mechanism                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Rematch       | append `game/started`, same seats, same config                                                         |
| New game      | navigate to `/setup` prefilled from the current game; Begin appends `game/started` with the new config |
| Leave table   | drop transports, record `seat/released`                                                                |
| Clear history | the only caller of `log.clear()`, in settings, behind a confirm naming what goes                       |

`store.abandon()` stops calling `session.reset()`. `GameSession.reset()` and
`EventLog.clear()` both stay — they are what Clear history is built from, and
what test setup uses.

This costs nothing in the domain. `reduce` on `game/started` already rebuilds
from `claimsHeld(state)` (`src/domain/reducer.ts:57`), so a log holding several
games folds correctly and seat claims survive a restart — `rematch` has relied
on both since it shipped.

## Consequences

- "Get back to the game" becomes possible, because the game is still there
  while another screen is on top of it. The setup screen gets a Back to game
  affordance that could not previously exist.
- The New game confirm dialog can go away. It was buying a warning about an
  irreversible act that is no longer irreversible; a new game is now in the log
  beside the old one, the same as a rematch.
- The log now accumulates across games on a device rather than being truncated
  by each new one. This is what M2's post-game summary and the deferred game
  log view need. It is also unbounded growth, which Clear history answers for
  now; if it ever needs answering automatically, the log is ordered and a
  retention policy is a selector, not a schema change.
- Three navigation mechanisms collapse to one. Today the app has state-derived
  rendering, a route (`/join`), and modal sheets, and a joiner reaching the
  game goes through all three.
- A joined table currently builds its own store inside `/join`. With one store
  at the layout, joining swaps what is in that slot rather than creating a
  second one — simpler, and it removes the second `GameScreen` mount.
- Per-screen code-splitting keeps rule 8 enforceable by construction once M5
  lands: auth cannot reach a bundle that does not import it.
- Cost: more routes to prerender under `adapter-static`, and the base-path e2e
  run (`test:e2e:base-path`) now covers more of them.

## Revisit if

Screens stop being independently addressable — if the lobby ends up needing to
render over a live board rather than beside it, a route is the wrong shape for
it and a sheet is right. Or if prerendering several near-empty routes measurably
costs the start-up budget in `docs/architecture.md`, which is the one budget
this decision could plausibly spend.
