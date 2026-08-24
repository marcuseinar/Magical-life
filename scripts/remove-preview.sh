#!/usr/bin/env bash
set -euo pipefail

# Removes one preview directory from the gh-pages branch, so a merged or closed
# pull request stops occupying a public URL.

TARGET="${1:?usage: remove-preview.sh pr-123}"
BRANCH="${PAGES_BRANCH:-gh-pages}"
WORKTREE="$(mktemp -d)/pages"

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
git -C "$WORKTREE" commit -q -m "remove preview $TARGET"
git -C "$WORKTREE" push origin "$BRANCH"
