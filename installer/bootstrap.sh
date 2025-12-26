#!/usr/bin/env bash
# =============================================================================
# WLCB-Mixer — Bootstrap Installer (curl | bash entrypoint)
# =============================================================================
#
# PURPOSE
# -------
# This script is designed to be run via a simple one-liner, similar to the
# Node-RED installer style:
#
#   sudo bash <(curl -fsSL https://raw.githubusercontent.com/WLCB-LP/WLCB-Mixer/stable/installer/bootstrap.sh)
#
# (If your system shell doesn't support process substitution, you can run:
#    curl -fsSL <url> | sudo bash
#  or download to /tmp and run with sudo.)
#
# WHY A BOOTSTRAP SCRIPT?
# -----------------------
# Keeping the one-liner script small and dependency-light has big benefits:
#   - Auditable: operators/engineers can quickly read it before running it.
#   - Robust: fewer assumptions about what's installed on a fresh system.
#   - Maintainable: complex install logic lives in installer/install.sh, not here.
#
# WHAT IT DOES (HIGH LEVEL)
# -------------------------
#  1) Installs minimal prerequisites (git, curl, certificates)
#  2) Clones the repo into /opt/wlcb-mixer (or updates it if already present)
#  3) Runs the full installer: installer/install.sh
#
# SAFETY NOTES
# ------------
#  - This script must be run as root (or via sudo) because it installs packages
#    and writes to /opt and /etc.
#  - The full installer runs the application as user 'wlcb' (non-root) for safety.
#  - If you customize paths, keep them consistent with the systemd unit file.
# =============================================================================

set -euo pipefail

# Repo location (GitHub org/repo). Case matters.
REPO_SLUG="WLCB-LP/WLCB-Mixer"

# Production branch. We treat 'stable' as what is safe to deploy.
BRANCH="stable"

# Where production runtime lives.
APP_DIR="/opt/wlcb-mixer"

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo/root."
  exit 1
fi

echo "=== WLCB-Mixer bootstrap ==="
echo "Repo:   ${REPO_SLUG}"
echo "Branch: ${BRANCH}"
echo "Target: ${APP_DIR}"
echo

# Minimal tools required to fetch and run the full installer.
# We keep this list small on purpose.
apt update
apt install -y git curl ca-certificates

mkdir -p /opt

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "[1/3] Cloning WLCB-Mixer into ${APP_DIR}..."
  git clone -b "${BRANCH}" "https://github.com/${REPO_SLUG}.git" "${APP_DIR}"
else
  echo "[1/3] Updating existing checkout in ${APP_DIR}..."
  cd "${APP_DIR}"

  # Fetch only the branch we care about, then hard-reset to it.
  # WHY: avoids 'git pull' merge commits and ensures production equals origin/stable.
  git fetch origin "${BRANCH}" --prune
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
fi

echo "[2/3] Running full installer..."
cd "${APP_DIR}"
bash installer/install.sh --branch "${BRANCH}"

echo "[3/3] Done."
echo "Open: http://<this-vm-lan-ip>:8080"
echo "Logs: journalctl -u wlcb-mixer -f"
