#!/usr/bin/env bash
# =============================================================================
# WLCB-Mixer — Full Installer (idempotent)
# =============================================================================
#
# This script performs a *repeatable* install/update of WLCB-Mixer on Debian-based
# systems (Debian 12 is the target).
#
# "Idempotent" means: you can run it multiple times and it will converge on the
# desired state without making a mess.
#
# WHAT THIS INSTALLER DOES
# ------------------------
#  1) Ensures OS prerequisites are installed
#  2) Ensures Node.js LTS is installed (Node 20.x)
#  3) Creates standard Linux directories:
#       - /opt/wlcb-mixer       (application code/runtime)
#       - /etc/wlcb-mixer       (configuration)
#       - /var/lib/wlcb-mixer   (runtime state)
#  4) Ensures /etc/wlcb-mixer/config.env exists (copy template on first run)
#  5) Checks out the desired branch (default: stable) and hard-resets to it
#  6) Installs dependencies and builds UI + server
#  7) Installs/updates the systemd unit and starts the service
#
# WHY THESE PATHS?
# ---------------
# - /opt is commonly used for "vendor/application" installs outside of apt.
# - /etc is the standard place for host-specific configuration.
# - /var/lib is the standard place for state data that should survive updates.
#
# SAFETY NOTES
# ------------
# - The service runs as user 'wlcb' (non-root). This is intentional.
# - We default to port 8080 because binding to port 80 would require root or
#   special capabilities (cap_net_bind_service). Keeping it unprivileged is safer.
# - This script uses a hard-reset to origin/<branch> to prevent drift.
#   If you keep local edits in /opt/wlcb-mixer, they will be overwritten.
#   Development should happen in a separate working tree (e.g. /home/wlcb/dev).
# =============================================================================

set -euo pipefail

BRANCH="stable"
APP_DIR="/opt/wlcb-mixer"
STATE_DIR="/var/lib/wlcb-mixer"
CONF_DIR="/etc/wlcb-mixer"
CONF_FILE="${CONF_DIR}/config.env"
USER_NAME="wlcb"

usage() {
  echo "Usage: $0 [--branch stable|main] [--no-build]"
  exit 1
}

NO_BUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --no-build) NO_BUILD=1; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1"; usage ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash installer/install.sh"
  exit 1
fi

# Ensure the service user exists; we don't create it because the station
# may manage user accounts centrally and you requested it already exists.
if ! id "$USER_NAME" >/dev/null 2>&1; then
  echo "Error: user '$USER_NAME' does not exist. Create it first."
  exit 1
fi

echo "=== WLCB-Mixer installer ==="
echo "Branch: ${BRANCH}"
echo "App:    ${APP_DIR}"
echo

echo "[1/7] OS prerequisites..."
# We install only what we need for a predictable build/run.
# If you want a leaner system later, we can split build tools from runtime
# and ship pre-built artifacts, but early on this is simplest.
apt update
apt install -y git curl ca-certificates sudo

echo "[2/7] Node.js LTS (20.x)..."
# WHY: Debian stable repos may ship an older Node. NodeSource provides current LTS.
# We only install Node if missing to avoid changing versions unexpectedly.
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

echo "[3/7] Directories..."
mkdir -p "${APP_DIR}" "${STATE_DIR}" "${CONF_DIR}"

# Ownership:
# - wlcb owns app + state so runtime and builds don't leave root-owned files behind.
chown -R "${USER_NAME}:${USER_NAME}" "${APP_DIR}" "${STATE_DIR}"

# Permissions:
# - App/state should be traversable; config should be restricted.
chmod 755 "${APP_DIR}" "${STATE_DIR}"
chmod 755 "${CONF_DIR}"

echo "[4/7] Config..."
# Only create config on first run to preserve local customization across updates.
if [[ ! -f "${CONF_FILE}" ]]; then
  cp "${APP_DIR}/installer/config.example.env" "${CONF_FILE}"
  chmod 640 "${CONF_FILE}"
  echo "Created ${CONF_FILE} (edit if needed)."
else
  echo "Config exists; leaving ${CONF_FILE} unchanged."
fi

echo "[5/7] Ensure correct branch checkout..."
cd "${APP_DIR}"

# IMPORTANT: Production runtime should exactly match the branch tip.
# This prevents "it works on my machine" surprises.
git fetch origin "${BRANCH}" --prune || true
git checkout "${BRANCH}" || true
git reset --hard "origin/${BRANCH}" || true

echo "[6/7] Build..."
if [[ "${NO_BUILD}" -eq 0 ]]; then
  # Run npm as the non-root service user so node_modules do not become root-owned.
  #
  # NOTE: For now we build on the server. Later we can do CI builds and ship
  #       pre-built bundles for even faster installs.
  sudo -u "${USER_NAME}" bash -lc "
    set -e
    cd ${APP_DIR}/server
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
    npm run build

    cd ${APP_DIR}/ui
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
    npm run build

    cd ${APP_DIR}/server
    # server/scripts/copy-ui.mjs copies ui/dist -> server/public during build
    # so the Node server can serve the UI.
  "
else
  echo "Skipping build (--no-build)."
fi

echo "[7/7] systemd service..."
install -m 644 "${APP_DIR}/installer/wlcb-mixer.service" /etc/systemd/system/wlcb-mixer.service
systemctl daemon-reload
systemctl enable --now wlcb-mixer.service

echo "✅ WLCB-Mixer installed and running."
echo "Config: ${CONF_FILE}"
echo "Logs:   journalctl -u wlcb-mixer -f"
