# Deploying

The app is a static site. CI builds it and publishes it to GitHub Pages on every
green push to `main`; there is no server and no hosting bill.

## One-time GitHub setup

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
   Not "Deploy from a branch" — the workflow publishes an artifact directly, and
   the branch option will ignore it.
2. **Settings → Actions → General → Workflow permissions:** "Read and write
   permissions" must be allowed, or the deploy step cannot mint its token.
3. Push to `main`. The `deploy` job prints the live URL, and Settings → Pages
   shows it from then on.

That is the whole setup. There is nothing to configure on the repository side
for the app itself.

## The URL, and why `BASE_PATH` exists

A **project site** — the normal case — is served from a subdirectory:

```
https://<user>.github.io/<repo>/
```

Every asset the app requests therefore has to be prefixed with `/<repo>`, or the
page loads and then fetches its JavaScript from the wrong place. SvelteKit
handles this through `kit.paths.base`, which `svelte.config.js` reads from the
`BASE_PATH` environment variable, which CI sets from the repository name.

If you later move to a **user site** (a repository named `<user>.github.io`,
served from the domain root) or attach a custom domain, set `BASE_PATH` to an
empty string in `.github/workflows/ci.yml`. Nothing else changes.

Local `npm run dev` and `npm run preview` leave `BASE_PATH` unset, so the app
runs at the root and the base path never gets in the way while developing.

## Custom domain

Add a `CNAME` file containing the domain to `static/`, point the DNS at GitHub,
and set `BASE_PATH` to an empty string. `static/` is copied verbatim into the
build output, so the file lands where Pages expects it.

## What CI actually gates

The deploy job runs only after everything else is green, so a broken build
cannot reach the live site:

| Job      | Gate                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `verify` | Types, ESLint (including the dependency rule), Prettier, Stylelint, unit, property and component tests, 100% branch coverage on `domain/` |
| `e2e`    | Playwright user journeys in Chromium and WebKit, `axe` in both themes, the seeded monkey walk                                             |
| `build`  | Production build and the bundle budget (60 kB of gzipped client JavaScript)                                                               |
| `deploy` | `main` only                                                                                                                               |

A pull request runs `verify`, `e2e` and `build` but does not deploy.

## Installing it as an app

The built site is a PWA: it declares a manifest and precaches itself in a
service worker, so it is installable from the browser and works with no network
at all. Capacitor wraps this same `build/` output for the App Store and Play
Store in M4 — the web deploy and the native shells are one artifact, not two
codebases.
