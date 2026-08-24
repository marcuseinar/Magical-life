#!/usr/bin/env bash
set -euo pipefail

# Publishes build/ to the gh-pages branch.
#
#   scripts/publish-pages.sh          → production, at the root
#   scripts/publish-pages.sh pr-123   → a preview, in its own subdirectory
#
# GitHub Pages serves one branch, so production and every open preview have to
# live side by side in a single tree. Publishing the root therefore leaves the
# pr-* directories alone, and publishing a preview leaves everything else alone.

TARGET="${1:-}"
BRANCH="${PAGES_BRANCH:-gh-pages}"
WORKTREE="$(mktemp -d)/pages"
SOURCE="${PAGES_SOURCE:-build}"

if [ ! -d "$SOURCE" ]; then
  echo "no $SOURCE directory to publish" >&2
  exit 1
fi

cleanup() {
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE"
}
trap cleanup EXIT

publish_once() {
  cleanup
  git fetch origin "$BRANCH" >/dev/null 2>&1 || true

  if git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
    git worktree add --force -B "$BRANCH" "$WORKTREE" "origin/$BRANCH" >/dev/null
  else
    # First ever publish: an orphan branch with no history to inherit.
    git worktree add --force --detach "$WORKTREE" >/dev/null
    git -C "$WORKTREE" checkout --orphan "$BRANCH" >/dev/null 2>&1
    git -C "$WORKTREE" rm -rf --quiet . >/dev/null 2>&1 || true
  fi

  if [ -z "$TARGET" ]; then
    find "$WORKTREE" -mindepth 1 -maxdepth 1 \
      -not -name '.git' -not -name 'pr-*' -exec rm -rf {} +
    cp -R "$SOURCE"/. "$WORKTREE"/
  else
    rm -rf "${WORKTREE:?}/${TARGET:?}"
    mkdir -p "$WORKTREE/$TARGET"
    cp -R "$SOURCE"/. "$WORKTREE/$TARGET"/
  fi

  # Branch-served Pages runs Jekyll, which silently drops directories whose
  # names begin with an underscore — which is every SvelteKit build asset.
  touch "$WORKTREE/.nojekyll"

  git -C "$WORKTREE" add -A
  if git -C "$WORKTREE" diff --cached --quiet; then
    echo "nothing to publish for ${TARGET:-production}"
    return 0
  fi

  git -C "$WORKTREE" commit -q -m "publish ${TARGET:-production} (${GITHUB_SHA:-local})"
  git -C "$WORKTREE" push origin "$BRANCH"
}

# Two runs can race for the same branch; losing the race is normal, not fatal.
for attempt in 1 2 3; do
  if publish_once; then exit 0; fi
  echo "publish attempt $attempt failed, retrying" >&2
  sleep $((attempt * 5))
done

echo "could not publish after 3 attempts" >&2
exit 1
