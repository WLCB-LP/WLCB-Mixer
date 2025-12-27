#!/usr/bin/env bash
set -euo pipefail

SERVICE="wlcb-mixer-update.service"

# Ultra-lazy release helper:
# - cleans known junk
# - stages everything (tracked + untracked)
# - bumps versions (server/ui) if VERSION env is set
# - commits if there is anything to commit
# - pushes main, fast-forwards stable, tags vX.Y.Z (derived from package.json)
# - triggers the updater service

cd "$(git rev-parse --show-toplevel)"

# Known junk that should never block releases
rm -f patches/ui-meters-fix.patch 2>/dev/null || true

# Optional: set VERSION explicitly, e.g. VERSION=0.3.9 ./push.sh
if [[ "${VERSION:-}" != "" ]]; then
  node - <<'NODE'
const fs = require("fs");
const v = process.env.VERSION;
for (const p of ["server/package.json","ui/package.json"]) {
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.version = v;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}
NODE
fi

# Derive version/tag from server/package.json (source of truth)
VERSION_FROM_PKG="$(node -p "require('./server/package.json').version")"
TAG="v${VERSION_FROM_PKG}"

echo "--- [0] Version: ${VERSION_FROM_PKG} (tag ${TAG}) ---"

echo "--- [1] Checkout + update main ---"
git checkout main
git pull origin main

echo "--- [2] Stage everything (lazy mode) ---"
git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  MSG="${MSG:-Release ${VERSION_FROM_PKG}}"
  echo "--- [3] Commit: ${MSG} ---"
  git commit -m "${MSG}"
fi

echo "--- [4] Push main ---"
git push origin main

echo "--- [5] Fast-forward stable to main ---"
git checkout stable
git pull origin stable
git merge --ff-only main
git push origin stable

echo "--- [6] Tag (if missing) ---"
if git rev-parse "${TAG}" >/dev/null 2>&1; then
  echo "Tag ${TAG} already exists."
else
  git tag -a "${TAG}" -m "WLCB-Mixer ${VERSION_FROM_PKG}"
fi
git push origin "${TAG}" || true

echo "--- [7] Trigger updater ---"
sudo systemctl start "${SERVICE}"
sudo systemctl status "${SERVICE}" --no-pager -l || true

echo "Done."
