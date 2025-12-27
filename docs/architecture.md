# WLCB-Mixer architecture

This document explains *what* each major component does and *why* it exists.

## Components

### UI (`ui/`)
A React web application that renders broadcast-style "channel strips" (faders, ON/OFF, meters).
It does **not** talk to the DSP directly; instead it talks to the server over WebSockets.

Why:
- Keeps DSP details off operator devices
- Allows multiple operators to connect safely
- Makes it easy to change UI without reworking DSP networking

### Server (`server/`)
A Node.js service that:
- Serves the compiled UI (static files)
- Hosts a WebSocket endpoint for real-time control/metering
- Will implement the Symetrix Radius control protocol

Why:
- Browser networking limitations (raw TCP/UDP)
- Security (don’t expose DSP IP/ports)
- Reliability (one stable DSP connection shared across UIs)

### Installer (`installer/`)
Scripts that install WLCB-Mixer on Debian 12:
- bootstrap.sh: small one-liner entrypoint (curl | bash style)
- install.sh: full idempotent installer
- systemd unit: runs server as user `wlcb`

## Deployment model

Production runtime lives in `/opt/wlcb-mixer`.
Configuration lives in `/etc/wlcb-mixer/config.env`.
Runtime state lives in `/var/lib/wlcb-mixer`.

This keeps OS, app, config, and state separated in standard Linux locations.

## UI navigation

The UI starts on a landing page where an operator selects Studio A, Studio B, or Engineering. Navigation is currently implemented with a simple hash router (no extra dependencies).

## Engineering status

The Engineering page polls `GET /api/status` to display release id, uptime, WebSocket client count, and update-check/deploy timestamps.

## DSP targets (Phase 0)

Configure DSP devices in `/etc/wlcb-mixer/config.env` using `DSP_TARGETS_JSON`. The server performs lightweight reachability probes (TCP connect to `DSP_PROBE_PORT`, optional ping) and exposes results via `/api/status`.
