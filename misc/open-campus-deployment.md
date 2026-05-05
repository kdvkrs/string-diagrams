# Open Campus Deployment Checklist (Local LAN)

## 1) Build once

```sh
cd /Users/klaus/Scratch/string-diagrams
make web-next-build
```

This builds the OCaml bridge and Vite bundle into `web-next/dist/`.

## 2) Start local static server

```sh
python3 -m http.server 8080 --directory web-next/dist
```

## 3) Share URL with tablets

Use:

```text
http://<host-lan-ip>:8080/
```

## 4) Event-day operator checks

- Host machine on booth Wi-Fi SSID.
- iPads on same SSID.
- Main page loads and the double-fork puzzle appears.
- `Reset`, undo/redo, lasso selection, and rule cards work.
- Idle reset returns to puzzle state.
- Optional proof reveal appears only after success.

## 5) Recovery

- If a tablet gets stuck, reload Safari tab.
- If all tablets fail, restart local server command.
