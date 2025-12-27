#!/usr/bin/env bash
# =============================================================================
# WLCB-Mixer — Full Installer (Atomic Releases + Auto-Update Timer)
# =============================================================================

set -euo pipefail

BRANCH="stable"
NO_BUILD=0

BASE="/opt/wlcb-mixer"
REPO_DIR="${BASE}/repo"
RELEASES_DIR="${BASE}/releases"
CURRENT_LINK="${BASE}/current"
BIN_DIR="${BASE}/bin"

STATE_DIR="/var/lib/wlcb-mixer"
CONF_DIR="/etc/wlcb-mixer"
CONF_FILE="${CONF_DIR}/config.env"

USER_NAME="wlcb"
KEEP_RELEASES=10

usage() {
  echo "Usage: $0 [--branch stable|main] [--no-build]"
  exit 1
}

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

if ! id "$USER_NAME" >/dev/null 2>&1; then
  echo "Error: user '$USER_NAME' does not exist. Create it first."
  exit 1
fi

echo "=== WLCB-Mixer installer (atomic) ==="
echo "Branch: ${BRANCH}"
echo

echo "[1/9] OS prerequisites..."
apt update
apt install -y git curl ca-certificates sudo rsync

echo "[2/9] Node.js LTS (20.x)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

echo "[3/9] Directories..."
mkdir -p "${BASE}" "${REPO_DIR}" "${RELEASES_DIR}" "${BIN_DIR}" "${STATE_DIR}" "${CONF_DIR}"
chown -R "${USER_NAME}:${USER_NAME}" "${STATE_DIR}"
chmod 755 "${BASE}" "${RELEASES_DIR}" "${BIN_DIR}" "${CONF_DIR}"

echo "[4/9] Config..."
if [[ ! -f "${CONF_FILE}" ]]; then
  if [[ -f "${REPO_DIR}/installer/config.example.env" ]]; then
    cp "${REPO_DIR}/installer/config.example.env" "${CONF_FILE}"
  else
    cp "$(dirname "$0")/config.example.env" "${CONF_FILE}"
  fi
  chmod 640 "${CONF_FILE}"
  echo "Created ${CONF_FILE} (edit if needed)."
else
  echo "Config exists; leaving unchanged."
fi

echo "[5/9] Sync repo checkout..."
if [[ ! -d "${REPO_DIR}/.git" ]]; then
  echo "Cloning repo into ${REPO_DIR}..."
  git clone -b "${BRANCH}" "https://github.com/WLCB-LP/WLCB-Mixer.git" "${REPO_DIR}"
fi

cd "${REPO_DIR}"
git fetch origin "${BRANCH}" --prune
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

RELEASE_ID="$(git rev-parse --short HEAD)"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"

echo "[6/9] Prepare release ${RELEASE_ID}..."
if [[ ! -d "${RELEASE_DIR}" ]]; then
  mkdir -p "${RELEASE_DIR}"
  rsync -a --delete     --exclude ".git"     --exclude "node_modules"     --exclude "ui/node_modules"     --exclude "server/node_modules"     --exclude "ui/dist"     --exclude "server/dist"     --exclude "server/public"     "${REPO_DIR}/" "${RELEASE_DIR}/"
  chown -R "${USER_NAME}:${USER_NAME}" "${RELEASE_DIR}"
fi

echo "${RELEASE_ID}" > "${RELEASE_DIR}/.release_id"
chown "${USER_NAME}:${USER_NAME}" "${RELEASE_DIR}/.release_id"

echo "[7/9] Build (if enabled)..."
if [[ "${NO_BUILD}" -eq 0 ]]; then
  # ---------------------------------------------------------------------------
  # BUILD STEP (server + UI) — and make the UI available to the server.
  #
  # Why the extra copy step?
  # - The Node server serves the UI from: server/public
  # - The React build outputs to:        ui/dist
  # - Therefore every release must copy ui/dist -> server/public
  #
  # We do this inside the release directory so each release is self-contained.
  # ---------------------------------------------------------------------------
  sudo -u "${USER_NAME}" bash -lc "
    set -e

    echo '--- [build] server (TypeScript -> dist) ---'
    cd ${RELEASE_DIR}/server
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
    npm run build

    echo '--- [build] ui (Vite -> dist) ---'
    cd ${RELEASE_DIR}/ui
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
    npm run build

    echo '--- [build] publish ui -> server/public ---'
    if [ ! -d ${RELEASE_DIR}/ui/dist ]; then
      echo 'ERROR: UI build did not create ui/dist (cannot publish UI).'
      exit 2
    fi

    mkdir -p ${RELEASE_DIR}/server/public
    rsync -a --delete ${RELEASE_DIR}/ui/dist/ ${RELEASE_DIR}/server/public/

    # Safety check: confirm we have an index.html to serve.
    if [ ! -f ${RELEASE_DIR}/server/public/index.html ]; then
      echo 'ERROR: server/public/index.html missing after publish step.'
      exit 3
    fi
  "
else
  echo "Skipping build (--no-build)."
fi

echo "[8/9] Activate release (atomic symlink flip)..."
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
chown -h "${USER_NAME}:${USER_NAME}" "${CURRENT_LINK}" || true

echo "[9/9] Install systemd units + enable auto-update timer..."
install -m 644 "${REPO_DIR}/installer/wlcb-mixer.service" /etc/systemd/system/wlcb-mixer.service
install -m 644 "${REPO_DIR}/installer/wlcb-mixer-update.service" /etc/systemd/system/wlcb-mixer-update.service
install -m 644 "${REPO_DIR}/installer/wlcb-mixer-update.timer" /etc/systemd/system/wlcb-mixer-update.timer
install -m 755 "${REPO_DIR}/installer/wlcb-mixer-update.sh" "${BIN_DIR}/wlcb-mixer-update.sh"

systemctl daemon-reload
systemctl enable --now wlcb-mixer.service
systemctl restart wlcb-mixer.service
systemctl enable --now wlcb-mixer-update.timer

echo "Pruning old releases (keep last ${KEEP_RELEASES})..."
if [[ -d "${RELEASES_DIR}" ]]; then
  mapfile -t all < <(ls -1t "${RELEASES_DIR}" 2>/dev/null || true)
  if [[ "${#all[@]}" -gt "${KEEP_RELEASES}" ]]; then
    for ((i=KEEP_RELEASES; i<${#all[@]}; i++)); do
      old="${RELEASES_DIR}/${all[$i]}"
      if [[ "$(readlink -f "${CURRENT_LINK}")" == "$(readlink -f "${old}")" ]]; then
        continue
      fi
      rm -rf "${old}"
    done
  fi
fi

echo "✅ Installed. Active release: ${RELEASE_ID}"
echo "URL:    http://<this-vm-lan-ip>:8080/#/"
echo "Logs:   journalctl -u wlcb-mixer -f"
echo "Update: systemctl status wlcb-mixer-update.timer"

# (v0.2.2) UI publish is now enforced every build: ui/dist -> server/public
