#!/bin/bash
# Build the NetHack core in nethack/ to WebAssembly and copy it to public/.
# Needs the Emscripten SDK: emcc on PATH, or EMSDK pointing at an emsdk checkout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NH="$ROOT/nethack"

if ! command -v emcc >/dev/null 2>&1; then
    EMSDK="${EMSDK:-$ROOT/../emsdk}"
    if [ -f "$EMSDK/emsdk_env.sh" ]; then
        # shellcheck disable=SC1091
        source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
    fi
fi
command -v emcc >/dev/null 2>&1 || { echo "emcc not found; install emsdk or set EMSDK" >&2; exit 1; }

# Emscripten defaults change between releases (e.g. setjmp/longjmp), so pin it
EMSCRIPTEN_VERSION=6.0.13
actual="$(emcc -dumpversion)"
if [ "$actual" != "$EMSCRIPTEN_VERSION" ]; then
    echo "need Emscripten $EMSCRIPTEN_VERSION, found $actual (emsdk install $EMSCRIPTEN_VERSION && emsdk activate $EMSCRIPTEN_VERSION)" >&2
    exit 1
fi

case "$(uname -s)" in
    Darwin) HINTS=hints/macOS.500 ;;
    *) HINTS=hints/linux.500 ;;
esac

JOBS="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"

cd "$NH"
# setup.sh copies the hints into the Makefiles, so rerun it to pick up hint edits
(cd sys/unix && sh setup.sh "$HINTS" >/dev/null)
if [ ! -d lib/lua ]; then
    make fetch-lua
fi
make -j"$JOBS" CROSS_TO_WASM=1 all

mkdir -p "$ROOT/public"
cp targets/wasm/nethack.js targets/wasm/nethack.wasm "$ROOT/public/"
ls -lh "$ROOT/public/nethack.js" "$ROOT/public/nethack.wasm"
