# Playing with an NLE bot

A bot written for the [NetHack Learning Environment](https://github.com/facebookresearch/nle) (NLE) plays this game's
NetHack 5.0 core through the headless runner here, with `BOT_INTERFACE=nle`:

```sh
tools/bot/nhdata/build.sh        # once, and after each core change: writes tools/bot/nhdata.json
BOT_INTERFACE=nle BOT_COMMAND="<your bot>" BOT_SEED=3 pnpm exec vitest run --config tools/bot/vitest.config.ts play
```

The bot runs as its own process. Each time it is to act, the runner writes one observation to its stdin as a line of
JSON, and the bot writes back one line, `{"key": <code>}`: one keystroke, as NLE's `step()` takes. The last
observation has `"done": true`, once the hero has died or the game has ended otherwise; the runner then answers the
questions after the end itself and closes the bot's stdin.

## The observation

Each key holds a flat array, row by row; reshape it to NLE's shape.

| Key | Shape | |
|---|---|---|
| `glyphs` | 21×79 | the map from column 1, in NLE's layout (below) |
| `chars`, `colors` | 21×79 | |
| `specials` | 21×79 | NetHack 3.6's `MG_*` flags |
| `blstats` | 27 | NLE's order; `condition` holds NetHack 3.6's `BL_MASK_*` bits; `alignment` is -1, 0 or 1 |
| `message` | 256 | UTF-8, zero-padded |
| `inv_glyphs`, `inv_letters`, `inv_oclasses` | 55 | |
| `inv_strs` | 55×80 | UTF-8, zero-padded |
| `tty_chars`, `tty_colors` | 24×80 | the terminal: menus and text windows drawn over the map, as tty draws them |
| `tty_cursor` | 2 | row, column |
| `misc` | 3 | waiting for a yes/no answer, a typed line, a key past `--More--` |

The terminal takes keys as tty does: any key goes on past `--More--` and Escape past them all; a menu takes letters,
a count typed first, `,` `.` `-` to pick or clear all, `>` `<` and Space to turn pages, and Return to accept; typed
lines build up until Return.

There is no reward, `program_state`, `internal` or `screen_descriptions`.

## Glyphs and the game's data

Glyph numbers keep NetHack 3.6's layout (monsters, pets, invisible, detected, bodies, ridden, objects, map symbols,
explosions, zaps, swallowing, warnings, statues), with each range sized by this core, which has more monsters and
objects than 3.6. The core's finer glyphs fold into it: male and female monsters, walls by branch, altars by alignment,
piles. Take the monster and object tables, map symbols and sizes from `tools/bot/nhdata.json`, made from the core the
game runs, not from NLE's own: a monster's glyph is its index in `monsters`, an object's its index in `objects`, a map
symbol's its value in `cmap`, each offset by its range. The ranges follow one another, from 0, with these sizes from
`consts`:

| Range | Size |
|---|---|
| monsters, pets | `NUMMONS` each |
| invisible | 1 |
| detected, bodies, ridden | `NUMMONS` each |
| objects | `NUM_OBJECTS` |
| map symbols | `MAXPCHARS` |
| explosions | `MAXEXPCHARS × EXPL_MAX` |
| zaps | `NUM_ZAP × 4` |
| swallowing | `NUMMONS × 8` |
| warnings | `WARNCOUNT` |
| statues | `NUMMONS`, ending at the layout's `MAX_GLYPH` |

An object's glyph, on the map and in the inventory, is the object its tile shows: its appearance before the game
shuffles appearances, as a player would see it.
