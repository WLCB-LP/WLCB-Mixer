#!/usr/bin/env bash
set -euo pipefail

BRANCH="stable"
APP_DIR="/opt/wlcb-mixer"
STATE_DIR="/var/lib/wlcb-mixer"
CONF_DIR="/etc/wlcb-mixer"
CONF_FILE="$CONF_DIR/config.env"
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

if ! id "$USER_NAME" >/dev/null 2>&1; then
  echo "Error: user '$USER_NAME' does not exist. Create it first."
  exit 1
fi

echo "=== WLCB-Mixer installer ==="
echo "Branch: $BRANCH"
echo "App:    $APP_DIR"
echo

echo "[1/7] OS prerequisites..."
apt update
apt install -y git curl ca-certificates sudo

echo "[2/7] Node.js LTS (20.x)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

echo "[3/7] Directories..."
mkdir -p "$APP_DIR" "$STATE_DIR" "$CONF_DIR"
chown -R "$USER_NAME:$USER_NAME" "$APP_DIR" "$STATE_DIR"
chmod 755 "$APP_DIR" "$STATE_DIR"
chmod 755 "$CONF_DIR"

echo "[4/7] Config..."
if [[ ! -f "$CONF_FILE" ]]; then
  cp "$APP_DIR/installer/config.example.env" "$CONF_FILE"
  chmod 640 "$CONF_FILE"
  echo "Created $CONF_FILE (edit if needed)."
fi

echo "[5/7] Ensure correct branch checkout..."
cd "$APP_DIR"
git fetch origin "$BRANCH" --prune || true
git checkout "$BRANCH" || true
git reset --hard "origin/$BRANCH" || true

npm_install_cmd() {
  # Use npm ci if a lockfile exists; otherwise fall back to npm install.
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
}

echo "[6/7] Build..."
if [[ "$NO_BUILD" -eq 0 ]]; then
  sudo -u "$USER_NAME" bash -lc "
    set -e
    cd $APP_DIR/server
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
    npm run build
    cd $APP_DIR/ui
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
    npm run build
  "
fi

echo "[7/7] systemd service..."
install -m 644 "$APP_DIR/installer/wlcb-mixer.service" /etc/systemd/system/wlcb-mixer.service
systemctl daemon-reload
systemctl enable --now wlcb-mixer.service

echo "✅ WLCB-Mixer installed and running."
echo "Config: $CONF_FILE"
echo "Logs:   journalctl -u wlcb-mixer -f"
