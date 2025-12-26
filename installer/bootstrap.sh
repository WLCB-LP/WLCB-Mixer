#!/usr/bin/env bash
set -euo pipefail

REPO_SLUG="WLCB-LP/wlcb-mixer"
BRANCH="stable"
APP_DIR="/opt/wlcb-mixer"

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo/root."
  exit 1
fi

echo "=== WLCB-Mixer bootstrap ==="
echo "Repo:   $REPO_SLUG"
echo "Branch: $BRANCH"
echo "Target: $APP_DIR"
echo

apt update
apt install -y git curl ca-certificates

mkdir -p /opt

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "[1/3] Cloning WLCB-Mixer..."
  git clone -b "$BRANCH" "https://github.com/${REPO_SLUG}.git" "$APP_DIR"
else
  echo "[1/3] Updating existing WLCB-Mixer checkout..."
  cd "$APP_DIR"
  git fetch origin "$BRANCH" --prune
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

echo "[2/3] Running installer..."
cd "$APP_DIR"
bash installer/install.sh --branch "$BRANCH"

echo "[3/3] Done."
echo "Open: http://<this-vm-lan-ip>/"
echo "Logs: journalctl -u wlcb-mixer -f"
