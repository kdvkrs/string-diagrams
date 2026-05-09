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

For a local preview:

```sh
make web-next-serve
```

Do not open `web-next/index.html` directly with a `file://` URL. It is the Vite
source entrypoint, not the built app.

## Optional performance instrumentation

Normal production builds do not include active profiling. For browser profiling:

```sh
make web-next-serve-perf
```

Open `http://localhost:8080/?perf=1`, exercise a level, then run this in the
in-app performance panel, or run this in the browser console:

```js
PuzzlePerf.report()
```

Useful checks:

- Draw a long lasso in Level 4 and inspect `render.total`, `render.canvas`, and
  `render.request.lasso`.
- Apply a rewrite in Level 4 and inspect `physics.replay.tick`,
  `physics.replay.materialize`, `render.total`, and `ocaml.applyRule`.
- Use `PuzzlePerf.reset()` between runs.

The same build also supports `PuzzlePerf.setEnabled(true)` or
`localStorage.sdPerf = "1"` if adding `?perf=1` is inconvenient.

On tablets, the performance panel is usually easier than remote debugging. Use
its `Copy` button to copy the same JSON returned by `PuzzlePerf.report()`.
