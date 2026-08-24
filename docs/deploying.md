# Deploying

The app is a static site. CI builds it and publishes it to GitHub Pages on every
green push to the default branch, and gives every pull request its own testable
URL. There is no server and no hosting bill.

## One-time GitHub setup

Do these in order — the third depends on the first two having happened.

1. **Default branch.** Settings → Branches → set the default to `main`.
   The workflow publishes from whatever GitHub reports as the default branch,
   so this is what decides where production comes from.

2. **Land something on `main`.** The first run on the default branch creates the
   `gh-pages` branch. Until it exists there is nothing for Pages to serve.

3. **Pages source.** Settings → Pages → Build and deployment → **Deploy from a
   branch** → `gh-pages` → `/ (root)`.
   _Not_ "GitHub Actions". Pages serves exactly one source, and previews need to
   live in the same tree as production (see below), so the branch is the source.

4. **Protect `main`.** Settings → Branches → Add branch ruleset (or protection
   rule) for `main`:
   - Require a pull request before merging
   - Require status checks to pass, and select all three:
     `Types, lint, tests`, `User journeys`, `Build and publish`
   - Require branches to be up to date before merging

   The check names are the job names in `.github/workflows/ci.yml`. They only
   appear in that list once each job has run at least once. Do **not** require
   the cleanup workflow's job — it runs on close, not on the pull request.

## Previews: every pull request gets a testable URL

Opening a pull request builds the app and publishes it to its own directory,
then comments the link:

```
https://<user>.github.io/<repo>/pr-<number>/
```

It rebuilds on every push to the branch, and is deleted when the pull request
closes. Open it on a phone — that is the point of it.

### How it works, and why it is a branch rather than an Action

GitHub Pages serves a single source. There is no per-deployment preview URL the
way Netlify or Vercel provide one. So production and every open preview have to
live side by side in one tree on `gh-pages`:

```
gh-pages/
  index.html          production
  _app/…
  pr-12/              preview for pull request 12
  pr-15/              preview for pull request 15
```

`scripts/publish-pages.sh` maintains that shape. Publishing production replaces
everything _except_ the `pr-*` directories; publishing a preview replaces only
its own. Two runs can race for the branch, so it fetches, rebuilds its commit
and retries up to three times.

Each preview is built with its own `BASE_PATH` (`/<repo>/pr-<n>`), so its assets
resolve from its own directory.

**Forks cannot publish.** A pull request from a fork gets a read-only token, so
the publish job is skipped for it. The checks still run.

### The service worker and preview isolation

A service worker's scope is a path prefix, so production at `/<repo>/` also
covers `/<repo>/pr-12/`. If it answered navigations for anything in scope with
its own cached shell, every preview would silently render production. The worker
therefore serves the shell **only for its own app root** and passes anything
deeper through to the network. `tests/base-path/` asserts this.

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
