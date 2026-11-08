#!/bin/bash
# Usage: tools/bot/nhdata/build.sh
# Writes tools/bot/nhdata.json from the core in nethack/: its glyph layout, map symbols, monsters and objects, for
# the NLE interface and for bots. Run pnpm run build:wasm first, which generates nethack/src/tile.c.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
NH=$(cd "$HERE/../../../nethack" && pwd)
OUT_FILE="$HERE/../nhdata.json"
TMP=$(mktemp -d)
trap 'rm -r "$TMP"' EXIT
clang -w -DTILES_IN_GLYPHMAP -I"$NH/include" -o "$TMP/dump" \
  "$HERE/dump.c" "$NH/src/objects.c" "$NH/src/monst.c" "$NH/src/drawing.c" "$NH/src/tile.c"
"$TMP/dump" > "$OUT_FILE"
node "$HERE/monflag.mjs" "$NH/include/monflag.h" "$OUT_FILE"
echo "wrote tools/bot/nhdata.json from the core at $(git -C "$NH" rev-parse --short HEAD)"
