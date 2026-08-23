# Theming and design tokens

Requirement: restyle the app without large code changes. That is a constraint on
_where styling decisions live_, and it is met by keeping them all in one place
and never letting a component make one.

## Two layers of tokens

**Primitives** — the raw palette. No meaning attached.

```css
--mtg-white: #f8f4e3;  --mtg-blue: #2a6fdb;  --mtg-black: #2b2b33;
--mtg-red:   #d3402f;  --mtg-green: #2e8b4f;
--grey-0 … --grey-900;
```

**Semantic tokens** — what the app actually references. Components use only these.

```css
--surface-page, --surface-panel, --surface-raised
--text-primary, --text-muted, --text-on-accent
--accent, --accent-hover, --danger, --warning, --success
--panel-border, --panel-border-critical
--radius-sm/md/lg, --space-1 … --space-8
--font-display, --font-body, --size-total, --size-delta
--duration-fast/base/slow, --ease-out
```

A component that writes `color: #d3402f` instead of `var(--danger)` is a bug,
caught by a Stylelint rule that bans raw colour literals outside the token file.

## Switching themes

```html
<html data-theme="dark"></html>
```

Each theme redefines the semantic layer only, never the components:

```css
:root {
  /* light — the complete set */
}
:root[data-theme='dark'] {
  /* overrides */
}
:root[data-theme='mono'] {
  /* high contrast */
}
:root[data-theme='pauper'] {
  /* a community theme */
}
```

`@media (prefers-color-scheme: dark)` supplies the default when the user has
made no explicit choice, guarded with `:root:not([data-theme="light"])` so an
explicit light choice still wins.

Adding a theme is one CSS block. No TypeScript changes, no component changes,
no build changes — which is the actual test of whether this worked.

## Per-player colour

Each player picks an identity colour (the five mana colours plus neutral). It
sets `--player-accent` on that panel's scope, and everything inside inherits.
Five-colour and colourless decks get a gradient token rather than a special case
in the component.

## Responsive strategy

Mobile first: base styles target a phone in portrait. Enhancement upward via
container queries rather than viewport media queries, so a panel restyles based
on _its own_ size. That matters here because a 4-player 2×2 grid on a tablet
gives each panel roughly the size of a phone screen — the panel should look the
same in both cases, and with container queries it does, for free.

Breakpoints exist only for layout changes (panel arrangement), never for type or
spacing — those scale fluidly with `clamp()`.

## Non-negotiables

- Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI boundaries, in
  **every** theme. Enforced by the accessibility gate in CI, so a pretty theme
  that fails cannot ship.
- Tap targets ≥ 44×44 CSS px, and the life zones are enormously larger than that.
- Every animation respects `prefers-reduced-motion`.
- `env(safe-area-inset-*)` respected everywhere — a life total behind a notch is
  the kind of bug that makes people uninstall.
- Dark theme is the default. People play Magic in dim rooms, and a white screen
  at a table at midnight is hostile.
