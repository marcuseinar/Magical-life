# Signalling worker

A Cloudflare Worker plus one Durable Object per table, exactly as described in
`docs/design/multiplayer.md`'s short-code signalling path. It carries a single
WebRTC offer/answer exchange between two browsers — a handful of kilobytes,
once, per table — and nothing else. It never sees a game event; the actual
game runs peer-to-peer over `RTCDataChannel` once the exchange completes. See
`docs/design/multiplayer.md`'s trust model for why that split matters.

## What it is

- `POST /rooms` — a host offers a table (SDP + which seat it's for), gets
  back a short room code.
- `GET /rooms/:code` — a joiner reads the offer for a code.
- `POST /rooms/:code/answer` — the joiner posts their answer.
- `GET /rooms/:code/answer` — the host polls for it.

A room holds exactly one offer and, once it exists, exactly one answer. It
expires ten minutes after creation whether or not anyone joined — see
`src/roomLogic.ts` for the (pure, unit-tested) rule, and `src/room.ts` for the
Durable Object that wires it to storage and an alarm.

Codes are four characters from an alphabet that drops `0`/`O` and `1`/`I`/`L` —
the code gets read aloud across a table as often as it gets typed.

## Deploying it yourself

You need a Cloudflare account — the free plan is enough; Durable Objects with
SQLite storage (what this uses) are available on it.

1. **Install dependencies**, from this directory:

   ```sh
   cd workers/signalling
   npm install
   ```

2. **Log in once**, interactively, from a real terminal (this opens a
   browser):

   ```sh
   npx wrangler login
   ```

3. **Check `wrangler.jsonc`'s `ALLOWED_ORIGINS`.** It's a comma-separated
   allowlist for the worker's CORS headers — the only origins whose browser
   can call it. It ships with the app's GitHub Pages origin and
   `localhost:5173` for local dev. A GitHub Pages PR preview
   (`…/pr-<number>/`) shares the production origin, so it does not need its
   own entry. Add your own if you fork the site elsewhere.

4. **Deploy:**

   ```sh
   npm run deploy
   ```

   Wrangler prints the worker's URL, something like
   `https://magical-life-signalling.<your-subdomain>.workers.dev`. That is
   the address the client needs — see "Wiring it into the app" below.

That's the whole deploy. There is no database to provision and no dashboard
configuration needed beyond the account itself — the Durable Object namespace
and its SQLite storage are created by `wrangler deploy` from `wrangler.jsonc`.

### Redeploying after a change

Same command: `npm run deploy`. If you change `wrangler.jsonc` (a new
binding, a new var), run `npm run types` first so `tsc` sees the update
before you commit.

### Redeploying automatically instead

`.github/workflows/deploy-signalling-worker.yml` redeploys on every push to
`main` that touches this directory — set a `CLOUDFLARE_API_TOKEN` repository
secret (Workers Edit scope) once, and merged changes here go live without
anyone running `wrangler deploy` by hand again. Manual deploy above still
works fine alongside it; the workflow is just the no-token-in-anyone's-hands
version of the same command.

### Cost

Durable Objects on the free plan include a real daily allowance of requests
and duration; a life-counter table's one-time handshake is a few requests
totalling a few kilobytes. Casual use by one group is nowhere near the limit.
Verify current limits before relying on this at real scale — they change.

## Local development

```sh
npm run dev
```

Runs the worker locally (`wrangler dev`, real Durable Objects, real SQLite
storage, all on your machine — nothing is deployed). Point the client's
signalling URL at `http://localhost:8787` to develop against it.

## Testing

```sh
npm run test
```

Runs against the real Workers runtime (`workerd`) via
`@cloudflare/vitest-plugin` — not a mock, not a browser DOM stand-in. This
covers the HTTP routing, CORS, and the Durable Object's storage and alarm
behaviour. The room's actual rules (what a "live" room is, what an offer or
an answer does to one) live in `src/roomLogic.ts`, which takes time as an
argument rather than calling `Date.now()` itself — the same discipline
`src/domain/` uses in the main app, and for the same reason: it's exhaustively
unit-testable without any runtime at all, Workers included.

```sh
npm run check
```

Type-checks. Both `test` and `check` first run `npm run types`
(`wrangler types`), which regenerates `worker-configuration.d.ts` — a large,
generated file, gitignored rather than committed, the same way
`.svelte-kit/` is in the main app.

## Wiring it into the app

Not done yet. This worker is complete and independently deployable on its
own, but nothing in `src/` calls it — the join flow built so far
(`docs/design/multiplayer.md`'s "manual-code join") still works by pasting a
code by hand, with no server involved. Giving it a short code, a shareable
link, and a QR code that go through this worker instead is the next piece of
work, tracked in `docs/roadmap.md`'s M3 entry.
