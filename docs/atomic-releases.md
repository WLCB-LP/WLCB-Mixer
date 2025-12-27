# Atomic releases

## Layout
- `/opt/wlcb-mixer/repo` — git checkout used to build and check for updates
- `/opt/wlcb-mixer/releases/<release-id>` — built releases
- `/opt/wlcb-mixer/current` — symlink to the active release

## Retention
The installer keeps the newest 10 releases and deletes older ones.

## Rollback
```bash
ls -1 /opt/wlcb-mixer/releases
sudo ln -sfn /opt/wlcb-mixer/releases/<previous-id> /opt/wlcb-mixer/current
sudo systemctl restart wlcb-mixer
```


## UI assets

Each release includes a built UI at `server/public` (copied from `ui/dist`) so the UI and server are always version-matched.
