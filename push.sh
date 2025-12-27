#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-origin}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Clean known junk
rm -f patches/ui-meters-fix.patch || true

# Pull latest main
git checkout main >/dev/null
git pull "$REMOTE" main

# Read version
VERSION="$(node -p "require('./server/package.json').version")"
TAG="v${VERSION}"

# Default commit message (override with MSG=...)
DEFAULT_DESC="Studio B: lower console slightly (1080p sightline tuning)"
COMMIT_MSG="${MSG:-Release ${VERSION}: ${DEFAULT_DESC}}"

echo "=== push.sh ==="
echo "Version: $VERSION"
echo "Commit:  $COMMIT_MSG"
echo "Tag:     $TAG"
echo

# Stage everything (lazy mode)
git add -A

# Commit only if needed
if git diff --cached --quiet; then
  echo "No changes staged; skipping commit."
else
  git commit -m "$COMMIT_MSG"
fi

# Push main
git push "$REMOTE" main

# Promote stable
git checkout stable >/dev/null
git pull "$REMOTE" stable
git merge --ff-only main
git push "$REMOTE" stable

# Tag if missing
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists."
else
  git tag -a "$TAG" -m "WLCB-Mixer $VERSION"
fi
git push "$REMOTE" "$TAG" || true

# Trigger updater
echo
echo "Starting wlcb-mixer-update.service..."
sudo systemctl start wlcb-mixer-update.service

echo
sudo systemctl status wlcb-mixer-update.service --no-pager -l || true
