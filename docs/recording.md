# Game recordings

A recording holds everything a game took from the page: what the player typed, chose and answered, and every value the core would otherwise have read from the machine (its clock, random seeds, the game's id). Run the same core on it and the game plays out again exactly.

`src/worker/recorder.ts` writes it, wrapping the worker's `GameHost`.

## Where it's kept

- **While the game lasts:** under `/save/replay/<game>/`, in numbered chunks (`000001`, `000002`, …) of about 64 KB. IndexedDB rewrites a whole file when it changes, so only the last chunk gets rewritten.
- **As it's written:** each new line is also posted to the page as a `recorded` event, for sending on.
- **When the game ends:** the whole text goes to the page as a `recording` event, which keeps it in localStorage (`nethack.lastGame`), and the chunks are deleted.

## Lines

Each line is `<seq> <tag> [args]`. `seq` counts from 1 within each session. Text that could hold anything is a JSON string literal. `-` stands for an answer the page gave none to, such as a cancelled prompt.

| Tag | Arguments | Meaning |
|---|---|---|
| `nhrec` | format | First line of a recording; the format is 1 |
| `session` | `new <time> tz=<±hh:mm>` | A new game started; its time zone holds for the whole game |
| `session` | `restore <time>` | The game was restored from its save |
| `session` | `recover <ckpt> <turn> <time>` | The page was closed mid-game, and the game came back from checkpoint `ckpt` of the session before, at that turn; lines after that checkpoint's mark were lost to the game |
| `session` | `unrecorded <time> tz=…` | A game restored with no recording of its start |
| `opt` | JSON | NETHACKOPTIONS, at the start of every session, as they can change between sessions |
| `rc` | JSON | The `.nethackrc`, likewise |
| `alone` | `0` or `1` | No other tab was playing |
| `seed` | n | A random seed the core asked for |
| `now` | n | The time the core asked for, in seconds since 1970 |
| `uuid` | uuid | The new game's id |
| `k` | key code | A key |
| `c` | x y button | A click on the map |
| `y` | JSON key [count] | An answer to a yes/no question, including the one about an old game left unfinished, whether the player or the page answered it; a new game started by destroying the old one leaves that answer out |
| `l` | JSON text | A line typed at a prompt |
| `m` | identifier:count … | Menu items chosen |
| `w` | | A text window dismissed |
| `x` | index | An extended command chosen |
| `p` | role race gender align | A character chosen |
| `asc` | `0` or `1` | The ASCII map switched from outside the game |
| `ckpt` | n | The core has written its `n`th checkpoint of this session, before a command or at a level change |
| `T` | turn time | The turn has just moved on, before its first command; `time` is the player's clock, ISO 8601 UTC |
| `=` | turn `@`x,y JSON | A check, every 20 turns: where the hero was, and every field the status line showed, by name |
| `end` | `save` or `over` | The session ended by saving, or the game ended; written before the last persist, as the page may go straight after it |

All times are the player's clock and are recorded as they were, even if that clock jumps.

## Replaying

`src/worker/replayer.ts` plays a recording again. Each session runs on a fresh core whose host answers from the recording, checking each `ckpt`, `T`, `=` and `end` against the core. A restore starts from the files the replay itself saved; a recovery from the files as the replay had them at the checkpoint named. The replay stops with the line where the game went differently.

The checks see the turn, the checkpoint count, the hero's position and the status line, so a game that differs only in something none of those show (what an unidentified item is, say) replays without complaint until it does.
