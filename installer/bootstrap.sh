#!/usr/bin/env bash
# =============================================================================
# WLCB-Mixer — Bootstrap Installer (atomic-release aware)
# =============================================================================

set -euo pipefail

REPO_SLUG="WLCB-LP/WLCB-Mixer"
BRANCH="stable"
BASE="/opt/wlcb-mixer"
REPO_DIR="${BASE}/repo"

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo/root."
  exit 1
fi

apt update
apt install -y git curl ca-certificates

mkdir -p "${BASE}"

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  git clone -b "${BRANCH}" "https://github.com/${REPO_SLUG}.git" "${REPO_DIR}"
else
  cd "${REPO_DIR}"
  git fetch origin "${BRANCH}" --prune
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
fi

bash "${REPO_DIR}/installer/install.sh" --branch "${BRANCH}"
