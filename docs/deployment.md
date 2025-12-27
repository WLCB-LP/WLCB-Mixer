# Deployment (Debian 12)

This document explains how WLCB-Mixer is installed and run on a Debian 12 server.

## Quick install (public repo)

If your repo is public, you can install with the bootstrap one-liner:

```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/WLCB-LP/WLCB-Mixer/stable/installer/bootstrap.sh)
```

If process substitution (`<(...)`) fails on your shell, use:

```bash
curl -fsSL https://raw.githubusercontent.com/WLCB-LP/WLCB-Mixer/stable/installer/bootstrap.sh | sudo bash
```

## What the installer does

The installer is split into two scripts:

- `installer/bootstrap.sh`:
  - installs minimal tools (git/curl/certs)
  - clones or updates the repo in `/opt/wlcb-mixer`
  - runs the full installer

- `installer/install.sh`:
  - installs Node.js LTS (Node 20) if missing
  - ensures standard directories exist
  - builds the UI and server
  - installs/updates the systemd service
  - enables and starts the service

## Standard filesystem layout

- `/opt/wlcb-mixer` — application code/runtime (managed by installer)
- `/etc/wlcb-mixer/config.env` — station-specific configuration (you edit this)
- `/var/lib/wlcb-mixer` — runtime state (e.g., last operator activity timestamp)

## Service management

Check status:

```bash
systemctl status wlcb-mixer
```

Restart after config changes:

```bash
sudo systemctl restart wlcb-mixer
```

View logs:

```bash
journalctl -u wlcb-mixer -f
```

## Port selection

By default we use **8080** so the service can run as non-root.
If you change `PORT=` in `/etc/wlcb-mixer/config.env`, restart the service.

Port 80 would require:
- running the service as root (not recommended), or
- granting Node the ability to bind privileged ports (cap_net_bind_service), or
- using a reverse proxy like nginx.

## Updating

In the simplest model, you update by re-running the installer (or bootstrap):

```bash
sudo bash /opt/wlcb-mixer/installer/install.sh --branch stable
```

Later, WLCB-Mixer can add a safe auto-update mechanism gated by operator inactivity.

## Engineering visibility

The auto-update script writes timestamps into `/var/lib/wlcb-mixer/update_last_check_epoch` and `/var/lib/wlcb-mixer/update_last_deploy_epoch` so the Engineering page can show update activity.

## UI build publishing

The UI build outputs to `ui/dist`. During installation, WLCB-Mixer copies (`rsync`) `ui/dist/` into `server/public/` inside the same release directory so the Node server can serve the UI.
