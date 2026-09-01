# Working agreement

Instructions for Claude (and any AI agent) working in this repository. Kept in
sync with `docs/` — if you change how the system works, change the docs in the
same commit.

## What this is

Magical Life: a Magic: The Gathering life counter. Mobile first, offline first,
instant to start, no login unless the feature genuinely requires one.

Read before making non-trivial changes:

- `docs/architecture.md` — layering and the dependency rule
- `docs/adr/` — decisions already made, and why
- `docs/testing.md` — what to test and where

## Stack

TypeScript (strict) · Svelte 5 runes · SvelteKit `adapter-static` · Vite ·
plain CSS with design tokens · Vitest · `@testing-library/svelte` · `fast-check` ·
Playwright · Capacitor · Cloudflare Workers for the later backend.

## Non-negotiable rules

1. **The dependency rule.** `domain/` imports nothing. `application/` imports
   only `domain/`. `adapters/` implement ports. `ui/` never imports an adapter
   directly. Enforced by `eslint-plugin-boundaries`; do not disable the rule to
   land a change.
2. **`domain/` is pure.** No `Date.now()`, no `crypto.randomUUID()`, no `window`,
   no `fetch`, no randomness. Time, identity, and entropy arrive as arguments.
   This is what keeps it exhaustively testable — and it is also what preserves
   the option in ADR 0001 to replace it with a Rust/WASM core later.
3. **Test first.** Write the failing test, then the code. New behaviour without a
   test is not done.
4. **State is derived.** Append events; never mutate a stored state object. Undo
   is a retraction event.
5. **Only semantic tokens in components.** No raw colour, spacing, or font-size
   literals outside `ui/tokens/`.
6. **Query by role.** Component and E2E tests find elements by accessible role
   and name, never by CSS class or test id.
7. **Small units.** If a file needs a section header to navigate, split it.
8. **No login on the critical path.** Solo and table play must never touch an
   auth code path, and must never load auth code into the bundle.
9. **Respect the performance budget** in `docs/architecture.md`. "Fast to start"
   is a requirement, not a preference.
10. **Nothing scrolls and nothing zooms.** The app is a fixed surface. Anything
    that can exceed the screen opts back in locally with `touch-action: pan-y`
    and its own `overflow`; never by relaxing the rule globally.

## Commands

```
npm run dev            npm run build          npm run preview
npm test               npm run test:coverage  npm run test:e2e
npm run check          npm run lint           npm run format
```

`npm run lint` runs ESLint (including the boundaries rule), Prettier and
Stylelint. Stylelint fails on a raw colour outside `ui/tokens/`, which is how
rule 5 below is actually enforced.

Locally, Playwright may need `PLAYWRIGHT_CHROMIUM_PATH` pointed at a Chromium
binary if the sandbox ships its own.

## Where verification runs

The suite is not negotiable. **Where it runs is.** CI executes the same
commands on every push and blocks the merge, so running the whole thing
locally first proves nothing that CI is not about to prove anyway — it just
costs a second machine's worth of time and, for an agent, a large amount of
context spent on test-runner output.

**Before a push, locally — the fast ones only:**

| Command                    | Why it stays local                                 |
| -------------------------- | -------------------------------------------------- |
| `npm run check`            | Seconds. Catches the mistakes not worth a CI trip. |
| `npm run lint`             | Seconds. Same.                                     |
| The test files you touched | Fast, and the loop test-first depends on.          |

**Left to CI — do not run these locally as a pre-push ritual:**

- `npm run test:coverage` (the whole suite, and the coverage gate)
- `npm run test:e2e` and `npm run test:e2e:base-path`
- The signalling worker's own suite

Run a full suite locally only when there is a reason CI cannot serve:
reproducing a failure CI has already reported, or checking behaviour the
suite does not cover yet. "Being thorough" is not such a reason; CI is
thorough, in parallel, for free.

A red CI is not a failure of process — it is the process working. What costs
something is a red CI you could have predicted from a type error, which is
why the cheap checks stay.

## Conventions

- Naming says what it means: `applyLifeDelta`, not `handleChange`.
- No abbreviations except the established domain ones (`edh`, `cmdr`, `omw`).
- Comments explain _why_. The code already says what.
- Functions do one thing. Prefer composition to flags — a boolean parameter that
  changes behaviour is two functions wearing a trench coat.
- Errors are values in the domain (`Result`-shaped), exceptions only at the edges.
- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
- Branch from `main`; every change goes through a pull request with green CI.

## Definition of done

Everything here still has to be true. Most of it is _demonstrated_ by CI
rather than by you, which is the point of the section above — the standard
does not drop, the second machine proving it does.

Yours, before the push:

- [ ] Tests written first, and they fail without the change
- [ ] Unit, component, and (where behaviour crosses a boundary) integration covered
- [ ] Types check and lint clean
- [ ] Docs updated if behaviour or design changed

CI's, on the pull request:

- [ ] `domain/` still at 100% branch coverage
- [ ] Boundaries clean
- [ ] Accessible: keyboard operable, correct roles and names, `axe` clean
- [ ] Works at 320 px wide and on a large screen
- [ ] Works offline
- [ ] Bundle budget respected

A pull request is not done until CI is green on its head. Red CI is yours to
fix, however cheap the local checks were.

## Working economically

An agent's cost is dominated by two things: how much context it carries, and
how often it builds the wrong thing. Test runs barely register next to those.
Optimise in that order.

**Rework is the expensive failure.** A feature built three times costs far
more than any amount of tooling. The reliable predictor: a request that names
an _effect_ rather than a mechanism — "show that something is changing",
"make it feel faster" — has many implementations, most of them wrong. One
question, or one throwaway sketch, is cheaper than one rebuild. Ask when the
request describes a feeling; act when it describes a behaviour.

**Context is the meter.** It accumulates for a whole session and every turn
pays for all of it. So:

- One epic per session. Finish, merge, start fresh. Nothing is lost; it is
  all in git.
- Read narrowly. `grep` for the symbol beats reading the file; reading the
  file beats reading the directory. Never re-read what is already in context.
- Filter command output. A test runner's full transcript is worth nothing
  after it says "passed" — pipe it through `tail`, and grep for failures.
- Do not poll. Wait for the notification; a check-in every few minutes is a
  full turn each time, spent to learn nothing.

**Batch the ceremony.** Small pull requests are good for review and bad for
overhead: each one costs its own description, CI cycle, and round trip.
Split by _reviewable idea_, not by file or by step. A domain change and the
UI that uses it are two ideas; three commits to one component are one.

**Spend on the things that are actually load-bearing:** the failing test
first, the boundary rule, purity in `domain/`. They are cheap and they are
what stops the expensive kind of mistake.

## When the design is ambiguous

Prefer, in order: the simplest thing that could work; the option that keeps the
app fast to start; the option that keeps units swappable. If a decision is
structural, write an ADR in `docs/adr/` rather than deciding it silently in a
commit.

Do not add speculative abstraction for milestones that have not started. The
Rust escape hatch in ADR 0001 is preserved by _purity_, not by building a
plugin system for it now.
