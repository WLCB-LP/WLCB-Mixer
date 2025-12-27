#!/usr/bin/env bash
# =============================================================================
# WLCB-Mixer — Auto-update script (Phase 1: update immediately)
# =============================================================================
#
# Called by systemd timer once per minute.
# =============================================================================

set -euo pipefail

BASE="/opt/wlcb-mixer"
REPO_DIR="${BASE}/repo"
BRANCH="stable"

current_commit=""
if [[ -L "${BASE}/current" ]] && [[ -f "${BASE}/current/.release_id" ]]; then
  current_commit="$(cat "${BASE}/current/.release_id" 2>/dev/null || true)"
fi

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  mkdir -p "${BASE}"
  git clone -b "${BRANCH}" "https://github.com/WLCB-LP/WLCB-Mixer.git" "${REPO_DIR}"
fi

cd "${REPO_DIR}"
git fetch origin "${BRANCH}" --prune
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

remote_commit="$(git rev-parse --short HEAD)"

if [[ -n "${remote_commit}" ]] && [[ "${remote_commit}" == "${current_commit}" ]]; then
  exit 0
fi

logger -t wlcb-mixer-update "Update available: current='${current_commit}' remote='${remote_commit}'. Deploying..."
bash "${REPO_DIR}/installer/install.sh" --branch "${BRANCH}"
