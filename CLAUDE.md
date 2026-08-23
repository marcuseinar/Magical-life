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

- [ ] Tests written first, and they fail without the change
- [ ] Unit, component, and (where behaviour crosses a boundary) integration covered
- [ ] `domain/` still at 100% branch coverage
- [ ] Types check, lint clean, boundaries clean
- [ ] Accessible: keyboard operable, correct roles and names, `axe` clean
- [ ] Works at 320 px wide and on a large screen
- [ ] Works offline
- [ ] Bundle budget respected
- [ ] Docs updated if behaviour or design changed

## When the design is ambiguous

Prefer, in order: the simplest thing that could work; the option that keeps the
app fast to start; the option that keeps units swappable. If a decision is
structural, write an ADR in `docs/adr/` rather than deciding it silently in a
commit.

Do not add speculative abstraction for milestones that have not started. The
Rust escape hatch in ADR 0001 is preserved by _purity_, not by building a
plugin system for it now.
