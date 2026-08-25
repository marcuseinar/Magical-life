#!/usr/bin/env bash
set -euo pipefail

# Removes one preview directory from the gh-pages branch, so a merged or closed
# pull request stops occupying a public URL.

TARGET="${1:?usage: remove-preview.sh pr-123}"
BRANCH="${PAGES_BRANCH:-gh-pages}"
WORKTREE="$(mktemp -d)/pages"

# The runner has no git identity of its own, and a commit needs one. Passed
# per-command rather than written into config, so the script behaves the same
# wherever it runs.
AUTHOR_NAME="${PAGES_AUTHOR_NAME:-github-actions[bot]}"
AUTHOR_EMAIL="${PAGES_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"

cleanup() {
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE"
}
trap cleanup EXIT

git fetch origin "$BRANCH" >/dev/null 2>&1 || true
if ! git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
  echo "no $BRANCH branch; nothing to remove"
  exit 0
fi

git worktree add --force -B "$BRANCH" "$WORKTREE" "origin/$BRANCH" >/dev/null

if [ ! -d "$WORKTREE/$TARGET" ]; then
  echo "no preview at $TARGET"
  exit 0
fi

rm -rf "${WORKTREE:?}/${TARGET:?}"
git -C "$WORKTREE" add -A
git -C "$WORKTREE" \
  -c "user.name=$AUTHOR_NAME" -c "user.email=$AUTHOR_EMAIL" \
  commit -q -m "remove preview $TARGET"
git -C "$WORKTREE" push origin "$BRANCH"
