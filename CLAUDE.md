# CLAUDE.md

## Repos and commits

- `nethack/` is a submodule on the `glorat/NetHack` fork, branch `web`. Commit and push core changes there first, then commit the submodule pointer here, so the pointer never names a commit GitHub lacks.
- Keep each fork commit small and self-contained, so it could be offered upstream on its own.
- Here, a commit that moves the `nethack/` pointer ("Update the core to …") contains nothing else; the front end's changes go in their own commit after it. `.githooks/pre-commit` refuses a mix; `pnpm install` turns it on.
- Core changes go straight to the fork's `web` branch and are pushed; changes here go on a branch for a pull request.
- Commit messages follow `CONTRIBUTING.md` in both repos: subject only, no body. Check `git log` before writing one; don't invent a style.
- Before changing a core file or adding software that ships to players, follow the Licences section of `CONTRIBUTING.md`.

## Building

- pnpm only (version pinned in `package.json`); never npm or npx.
- After any change under `nethack/`, run `pnpm run build:wasm`. Otherwise the front end and tests keep running the old `public/nethack.wasm`, which is gitignored and goes stale silently.
- `build:wasm` needs Emscripten exactly 6.0.13, from `PATH` or `../emsdk`.

## The core and the shim window port

- The core talks to JS through `win/shim/winshim.c`: each window call reaches `Game.callback` in `src/worker/game.ts`, which must return a Promise the core waits on under ASYNCIFY.
- A callback that throws or rejects hangs the core for good; `callback()` catches and answers with `fallback()`. Keep it that way.
- In the shim's argument formats, `i` passes an int's value and `p` a raw pointer; a value read from the wrong one looks plausible and is wrong.
- Before inventing UI behaviour, check what tty does in the core and what [nethack-cocoa](https://github.com/glorat/nethack-cocoa) does (if checked out, it's at `../nethack-cocoa`); this front end follows Cocoa.

## Tests

- `pnpm test`: unit tests and headless scenarios on the real core in Node (about 1s). `pnpm run test:e2e`: Playwright (about 30s). Run both before committing; CI runs both too.
- `pnpm run test:e2e:update`: how a new version of the service worker takes over (about 45s). Not part of `test:e2e` or CI, so run it after changing the service worker or the update flow.
- Prefer a headless scenario (`tests/headless`, via `Session` in `harness.ts`) to an e2e test unless the behaviour lives in the UI.
- Scenarios are deterministic: `seed` sets `NETHACK_SEED`, `date` fakes `Date`, `wizard: true` allows debug-mode commands, and `failPost` makes a window callback throw once.
- Playwright games on the dev server are deterministic too: `playwright.config.ts` sets `nethack.fixedInputs`, which fixes the seeds, clock, game id and the picker's choice.
- When fixing a bug, check its test fails without the fix.
