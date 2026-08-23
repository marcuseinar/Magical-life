# Magical Life

A Magic: The Gathering life counter for the table. Mobile first, offline first,
no login required to play.

Inspired by Lifetap, aiming further: peer-to-peer shared game state, commander
damage tracking, and league/tournament running.

## Status

Pre-implementation. The stack is chosen and the system is designed; see `docs/`.

- [Architecture](docs/architecture.md) — system design and layering
- [Roadmap](docs/roadmap.md) — milestones
- [ADR 0001](docs/adr/0001-tech-stack.md) — why Svelte/TypeScript over Rust/WASM
- [ADR 0002](docs/adr/0002-state-and-sync-model.md) — event log, ownership, merge
- [ADR 0003](docs/adr/0003-identity-and-auth.md) — passkeys and email links
- [Interaction design](docs/design/interaction.md) — the two life-change styles
- [Multiplayer](docs/design/multiplayer.md) — P2P, commander damage
- [Tournaments](docs/design/tournaments.md) — formats, pairing, Challonge
- [Testing strategy](docs/testing.md)
- [Theming](docs/theming.md)
- [CLAUDE.md](CLAUDE.md) — working agreement for AI agents in this repo

## Licence

Not yet chosen.
