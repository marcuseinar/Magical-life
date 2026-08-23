# ADR 0001 — Tech stack

- Status: Accepted
- Date: 2026-08-23

## Context

Magical Life must satisfy a set of constraints that, together, narrow the field
much more than any one of them does alone:

1. Free static hosting on GitHub Pages.
2. Shippable to the Apple App Store and Google Play "eventually".
3. Instant start — open the app, tap, play. No login, no spinner.
4. Mobile first, scaling up to large screens.
5. Restyleable without touching component logic.
6. Peer-to-peer play with no dedicated server (WebRTC).
7. Later: a small backend for leagues/tournaments, passkey auth.
8. Later: audio/video game-state detection, natural-language rules Q&A, LLM agents.
9. Aggressive testing: units, components, integrations, user journeys, fuzzing, UI.
10. Small swappable units, readable code, Clean Architecture discipline.

Two candidate directions were considered seriously.

## Option A — Rust compiled to WebAssembly (Leptos / Dioxus / Yew)

What it genuinely wins:

- **Property-based testing and fuzzing are best in class.** `proptest` and
  `cargo-fuzz` (libFuzzer) with coverage-guided input generation are stronger
  than anything in the JS ecosystem. Requirement 9 likes this a lot.
- **The type system prevents whole categories of state bugs**, which matters for
  an event-sourced, mergeable game log.
- **One language for client and server**, if the tournament backend were Rust.

Where it fights the requirements:

- **Requirement 3 (instant start).** A WASM app pays download + compile +
  instantiate before first paint. A trivial Leptos CSR app lands in the
  hundreds of kilobytes gzipped before any app code; a Svelte equivalent is a
  few tens. For a widget whose entire job is "show a number, react to a tap",
  that is the wrong trade. This is the single strongest argument against.
- **Requirement 2 (app stores).** Capacitor is the realistic packaging route and
  it works fine with a WASM build — but every native capability (haptics,
  keep-awake, microphone, camera, background audio, in-app purchase) is a
  JavaScript plugin. From Rust you reach them through `wasm-bindgen` interop,
  writing and maintaining a hand-rolled FFI shim per plugin. That cost recurs
  forever.
- **Requirement 6 (WebRTC).** `web-sys` bindings to `RTCPeerConnection` are
  complete but verbose and callback-shaped; the JS libraries and the accumulated
  community knowledge for NAT traversal edge cases are on the JS side.
- **Requirement 8 (audio/video/LLM).** `MediaRecorder`, the Web Speech API,
  on-device model runtimes, and every vendor LLM SDK are JavaScript first. This
  is the requirement most likely to be reached last and hurt most.
- **Requirement 9 (component and UI testing).** Playwright works against any DOM,
  so end-to-end is fine either way. But *component* testing — mount one unit,
  drive it, assert on the accessibility tree — is mature and ergonomic with
  Vitest + Testing Library, and thin-to-absent for Rust web frameworks.

## Option B — TypeScript + Svelte 5 + SvelteKit (`adapter-static`)

- Compiles away: no virtual DOM, no framework runtime to speak of. Best-in-class
  on requirement 3.
- `adapter-static` emits a plain static site → GitHub Pages, zero config, £0.
- The same static build is what Capacitor wraps for iOS and Android. One build
  artifact, three targets.
- Svelte 5 runes give explicit, testable reactive primitives that work *outside*
  components, so the domain layer stays framework-free.
- Scoped styles plus CSS custom properties make requirement 5 a one-file change.
- Vitest, `@testing-library/svelte`, Playwright, and `fast-check` cover
  requirement 9 — including property-based fuzzing of the reducer and randomised
  user journeys.
- Every future capability in requirement 8 is a first-class citizen.

## Decision

**TypeScript + Svelte 5 + SvelteKit with `adapter-static`.**

Rust/WASM is rejected as the application framework — not because it is bad, but
because the one thing this app must be above all else is *instantly ready*, and
WASM taxes exactly that. The requirement that decided it is "it should be fast
to just start the app and go".

### The Rust escape hatch is kept open, deliberately

The architecture (see `docs/architecture.md`) isolates a pure, dependency-free
**domain core**: game entities, the event reducer, rules invariants, and later
the tournament pairing algorithms. That core touches no DOM, no network, no
storage. It is reachable only through ports.

That is precisely the shape that can be replaced by a Rust crate compiled to
WASM later, *if and only if* a real need appears. Two plausible triggers:

- **Swiss/pod pairing** is weighted maximum matching over a graph. If it becomes
  slow or we want the identical implementation on the client and the server, a
  Rust core compiled to both WASM and a native binary is the clean answer.
- **Fuzzing depth.** If `fast-check` stops finding bugs the reducer still has,
  porting the reducer to Rust to run `cargo-fuzz` against it is a defensible move.

Neither is true today. Building for them now would be speculative generality —
which is also the thing Clean Architecture is supposed to stop us doing.

## The full stack

| Concern | Choice | Note |
|---|---|---|
| Language | TypeScript, `strict` | `noUncheckedIndexedAccess` on |
| UI framework | Svelte 5 (runes) | |
| App framework | SvelteKit + `adapter-static` | SPA fallback, `paths.base` set for Pages |
| Build | Vite | |
| Styling | Plain CSS + custom-property design tokens | No utility framework — see `docs/theming.md` |
| State | Svelte stores over a pure reducer | Domain state is framework-free |
| Persistence | IndexedDB via `idb`, `localStorage` for prefs | Offline first |
| P2P | WebRTC `RTCDataChannel` | See `docs/design/multiplayer.md` |
| Signalling | Cloudflare Worker + Durable Object | Plus a QR-code offline path |
| Native shell | Capacitor | Wraps the same static build |
| Unit/component tests | Vitest + `@testing-library/svelte` | |
| Property/fuzz tests | `fast-check` | Against the reducer and pairing |
| E2E / UI tests | Playwright | Mobile viewports, Chromium + WebKit |
| Backend (later) | Cloudflare Workers + D1 + Durable Objects | Free tier; see ADR 0003 |
| CI/CD | GitHub Actions → GitHub Pages | |

### Why not React Native / Flutter / Expo?

They solve requirement 2 more directly but lose requirement 1 (there is no free
static web host for a React Native app without also maintaining a react-native-web
build). A web-first app wrapped in Capacitor gives one codebase, one deployment,
and a shareable URL — which for a life counter is a real distribution advantage:
people can use it before they install anything.

### Why not a utility-first CSS framework?

Requirement 5 asks for restyling without large code changes. Utility classes
spread styling decisions across every template, which is the opposite. Semantic
CSS custom properties concentrate them in one file.

## Consequences

- We accept that the domain core must stay genuinely pure; any DOM or network
  import that leaks into it silently closes the Rust escape hatch. This is
  enforced by lint rule, not by good intentions (see `CLAUDE.md`).
- We accept a JS-sized security surface (npm supply chain). Mitigated by a lockfile,
  Dependabot, and keeping the dependency count deliberately small.
- Bundle size becomes a tracked budget in CI, since "fast to start" is a
  requirement and not a preference.
