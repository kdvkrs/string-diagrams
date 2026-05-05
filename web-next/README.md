# web-next

First rewrite iteration for a JS-native interaction layer.

## What is implemented now

- Vite + TypeScript frontend (`Canvas2D`) with tablet-friendly controls
- JS lasso selection and visual rule cards (`mA`, `nA`, `mx`, `nx`)
- OCaml headless bridge (`bin/bridge.ml` -> `bridge.bc.js`) for:
  - scene state
  - rule availability
  - rule application
  - undo/redo
  - proof export
- Side-by-side rendering with a JS physics layout inspired by the original OCaml placement pass
- Success modal and optional proof-script reveal

## Development

```sh
make web-next-dev
```

## Build for static hosting

```sh
make web-next-build
```

Then serve `web-next/dist` with any static server.
