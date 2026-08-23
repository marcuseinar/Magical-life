# Magical Life

A Magic: The Gathering life counter for the table. Mobile first, offline first,
no login required to play.

Inspired by Lifetap, aiming further: peer-to-peer shared game state, commander
damage tracking, and league/tournament running.

## Status

Milestone 1 is built: solo play for one to six players, both input styles,
counters, undo, offline, installable. See `docs/roadmap.md` for what is next.

```
npm install
npm run dev            # http://localhost:5173
npm test               # unit, property and component tests
npm run test:e2e       # user journeys, accessibility and the monkey walk
npm run lint           # eslint, prettier, stylelint and the dependency rule
```

- [Architecture](docs/architecture.md) — system design and layering
- [Roadmap](docs/roadmap.md) — milestones
- [ADR 0001](docs/adr/0001-tech-stack.md) — why Svelte/TypeScript over Rust/WASM
- [ADR 0002](docs/adr/0002-state-and-sync-model.md) — event log, ownership, merge
- [ADR 0003](docs/adr/0003-identity-and-auth.md) — passkeys and email links
- [Interaction design](docs/design/interaction.md) — the two life-change styles
- [Multiplayer](docs/design/multiplayer.md) — P2P, commander damage
- [Tournaments](docs/design/tournaments.md) — formats, pairing, Challonge
- [Testing strategy](docs/testing.md)
- [Deploying](docs/deploying.md) — GitHub Pages setup
- [Theming](docs/theming.md)
- [CLAUDE.md](CLAUDE.md) — working agreement for AI agents in this repo

## Licence

Not yet chosen.
