# nethack-web

NetHack 5.0 in the browser, playable offline. The game core is upstream
NetHack compiled to WebAssembly with Emscripten; the UI follows the layout of
the [NetHack Cocoa](https://github.com/glorat/nethack-cocoa) front end.

## Licence

NetHack and this web port are under the NetHack General Public License ([LICENSE](LICENSE)). The site also includes the software listed in `public/third-party-licenses.txt`.

## Layout

- `nethack/`: upstream NetHack (git submodule) on the `web` branch, which
  carries the WebAssembly build fixes and the `nhweb_*` helpers in
  `sys/libnh/libnhmain.c`.
- `src/worker/`: runs the core in a Web Worker and implements the shim
  window port (`win/shim/winshim.c`) on top of it.
- `src/protocol.ts`: the messages between the worker and the UI.
- `src/port/`: UI-side game state, without DOM code.
- `index.html`, `src/landing.tsx`: the landing page at `/`, which loads none of the game.
- `play/index.html`, `src/main.tsx`: the game at `/play/`.
- `src/ui/`: map, stats, equipment, messages, inventory, and dialogs.
- `src/sw/sw.js`: service worker; the build adds the precache list.

## Building

Requires the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)
at the version pinned in `scripts/build-wasm.sh`, either on `PATH` or checked
out next to this repository as `../emsdk`.

```sh
git submodule update --init
pnpm install
pnpm run build:wasm      # nethack/ -> public/nethack.{js,wasm}
pnpm run dev             # http://localhost:5173
pnpm run build           # dist/, a static site that works offline
```

## Testing

```sh
pnpm test                # unit tests, plus scenarios played on the real core in Node
pnpm run test:e2e        # Playwright: play, save/restore, offline
pnpm run test:e2e:update # Playwright, on demand: a new version taking over
```

Scenario tests in `tests/headless` drive the core through `Session` in `tests/headless/harness.ts`. Each step resolves once the core is waiting again, with what it asks for in `session.prompt` and the map, messages, status and inventory in `session.state`.

```ts
const g = await (await Session.start({ wizard: true })).skipText();
await g.send("\x17");            // ^W: wish
await g.getlin("long sword");
expect(g.state.inventory.some((i) => /long sword/.test(i.text))).toBe(true);
```

Games are repeatable: the seed (`NETHACK_SEED`) and the date are fixed, so the same keys give the same dungeon, monsters and luck. Debug mode (`wizard: true`) sets up situations directly: `^W` to wish, `^F` to map the level, `session.teleport(x, y)` to move the hero.

Saved games live in the browser's IndexedDB, under the character's name.
