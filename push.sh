#!/usr/bin/env bash
set -euo pipefail

VERSION_TAG="v0.3.8"
SERVICE="wlcb-mixer-update.service"

# Refuse to run if there are uncommitted changes (prevents accidental commits)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Working tree is not clean. Commit/stash your changes first."
  git status --porcelain
  exit 1
fi

echo "--- [1/7] Ensure main is up to date ---"
git checkout main
git pull origin main

echo "--- [2/7] Stage release changes ---"
git add ui/src/App.tsx ui/src/app.css ui/package.json server/package.json push.sh

echo "--- [3/7] Commit on main ---"
git commit -m "Release ${VERSION_TAG}: Studio B console (1920 no-scroll) + UI build fix" || {
  echo "Nothing to commit (working tree clean after add)."
}

echo "--- [4/7] Push main ---"
git push origin main

echo "--- [5/7] Fast-forward stable to main ---"
git checkout stable
git pull origin stable
git merge --ff-only main
git push origin stable

echo "--- [6/7] Tag release ---"
if git rev-parse "${VERSION_TAG}" >/dev/null 2>&1; then
  echo "Tag ${VERSION_TAG} already exists locally."
else
  git tag -a "${VERSION_TAG}" -m "WLCB-Mixer ${VERSION_TAG}"
fi
git push origin "${VERSION_TAG}" || echo "Tag push skipped/failed (tag may already exist on origin)."

echo "--- [7/7] Trigger updater on this host ---"
sudo systemctl start "${SERVICE}"
sudo systemctl --no-pager -l status "${SERVICE}" || true

echo "Done."
