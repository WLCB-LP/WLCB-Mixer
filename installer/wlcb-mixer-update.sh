#!/usr/bin/env bash
# =============================================================================
# WLCB-Mixer — Auto-update script (Phase 1: update immediately)
# =============================================================================
#
# v0.2.1:
# - Write /var/lib/wlcb-mixer/update_last_check_epoch on every run
# - Write /var/lib/wlcb-mixer/update_last_deploy_epoch after a successful deploy
# =============================================================================

set -euo pipefail

BASE="/opt/wlcb-mixer"
REPO_DIR="${BASE}/repo"
BRANCH="stable"

STATE_DIR="/var/lib/wlcb-mixer"
LAST_CHECK_FILE="${STATE_DIR}/update_last_check_epoch"
LAST_DEPLOY_FILE="${STATE_DIR}/update_last_deploy_epoch"

mkdir -p "${STATE_DIR}"
date +%s > "${LAST_CHECK_FILE}"

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

date +%s > "${LAST_DEPLOY_FILE}"
