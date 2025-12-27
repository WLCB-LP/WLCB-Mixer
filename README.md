# WLCB-Mixer

Web-based mixer control surface (custom UI) intended to control Symetrix Radius DSPs via a small server gateway.

## One-line install (public repo)

Repo is hosted at `WLCB-LP/WLCB-Mixer`:

```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/WLCB-LP/WLCB-Mixer/stable/installer/bootstrap.sh)
```

## Logs
```bash
journalctl -u wlcb-mixer -f
```


## Atomic releases
WLCB-Mixer deploys into `/opt/wlcb-mixer/releases/<id>` and flips `/opt/wlcb-mixer/current` atomically.

Upgrade:
```bash
sudo bash /opt/wlcb-mixer/repo/installer/install.sh --branch stable
```

Auto-update timer (every minute):
```bash
systemctl status wlcb-mixer-update.timer
journalctl -u wlcb-mixer-update.service -n 50 --no-pager
```


### Engineering meters (Phase 1)
Set `DSP_METER_MAP_JSON` in `/etc/wlcb-mixer/config.env` with Symetrix controller numbers for meter objects, then view `/#/engineering`.
