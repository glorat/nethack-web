# nethack-web

NetHack 5.0 in the browser, playable offline. The game core is upstream
NetHack compiled to WebAssembly with Emscripten; the UI follows the layout of
the [NetHack Cocoa](https://github.com/glorat/nethack-cocoa) front end.

## Layout

- `nethack/`: upstream NetHack (git submodule) on the `web` branch, which
  carries the WebAssembly build fixes and the `nhweb_*` helpers in
  `sys/libnh/libnhmain.c`.
- `src/worker/`: runs the core in a Web Worker and implements the shim
  window port (`win/shim/winshim.c`) on top of it.
- `src/protocol.ts`: the messages between the worker and the UI.
- `src/port/`: UI-side game state, without DOM code.
- `src/ui/`: map, stats, equipment, messages, inventory, and dialogs.
- `src/sw/sw.js`: service worker; the build adds the precache list.

## Building

Requires the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)
at the version pinned in `scripts/build-wasm.sh`, either on `PATH` or checked
out next to this repository as `../emsdk`.

```sh
git submodule update --init
npm install
npm run build:wasm      # nethack/ -> public/nethack.{js,wasm}
npm run dev             # http://localhost:5173
npm run build           # dist/, a static site that works offline
```

## Testing

```sh
npm test                # unit tests, plus the worker driving the real core in Node
npm run test:e2e        # Playwright: play, save/restore, offline
npm run test:headless   # quick smoke test of public/nethack.js
```

Saved games live in the browser's IndexedDB, under the character's name.
