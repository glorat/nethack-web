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
| `back` | time | The page was closed mid-game, and the game came back by replaying everything above; the session and its numbering carry on, with nothing lost |
| `session` | `unrecorded <time> tz=…` | A game restored with no recording of its start |
| `opt` | JSON | NETHACKOPTIONS, at the start of every session, as they can change between sessions |
| `rc` | JSON | The `.nethackrc`, likewise |
| `alone` | `0` or `1` | No other tab was playing |
| `seed` | n | A random seed the core asked for |
| `now` | n | The time the core asked for, in seconds since 1970 |
| `uuid` | uuid | The new game's id |
| `bones` | name hash | What the host answered when the core looked for bones for a level: the SHA-256 of the file, or `-` for none |
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

## Bones

Bones belong to the host, not the core. When the core has decided to look for bones for a level it asks the host, and when it has written some at a death it hands them over. `src/worker/bones.ts` is the browser's database, under `/save/bones/`:

- `<sha256>` holds the bones themselves, kept for good so that recordings naming them can replay.
- `<name>`, such as `bonD0.5`, holds the hash of the bones waiting for the next game to reach that level. The first bones left for a level stay until a game takes them; debug-mode games neither leave nor take any.

A recording holds only the hash, so a replay needs a database that has those bones, and stops at that line if not. A replay never takes anything, so it can't use bones up. Taking bones and recording that reach IndexedDB in the same sync, at the next command.

## Coming back after the page closed

A game left unfinished comes back by replay when it can. When the core finds the game's lock and asks about the old game, `src/worker/resume.ts` plays the recording on new cores without showing it, the last session on a core reading the real `/save`. When the lines run out, the recorder takes over on that same core and the page is shown the last session's events. Nothing reaches IndexedDB until then.

If the replay goes differently, or the recording lacks the game's start, the game comes back from its checkpoint instead, as a `session recover`. So does a game whose last replay never reached play, which `/save/resuming` marks, in case the replay itself crashes the page.

The core running the replay sees what's in `/save` now, not what was there when the game was played, and the cores for earlier sessions see none of it. A game that read the high score list may therefore go differently, and come back from its checkpoint.

## Watching a recording

In the browser, `/play/?replay` plays the last finished game, which each game over replaces, and only the end screen offers a button for it. Recordings aren't versioned: one that no longer plays, as after an upgrade that changed the game, or that's corrupted, is reported only as no longer available. `src/worker/replay-runner.ts` plays it at a chosen number of turns a second, flashing each prompt the player answered at 1× and slower, and seeks by playing again from the start without showing the way.

`tests/headless/golden/` holds long recorded games that every test run replays, so a change that alters how the game plays fails there. `GOLDEN=write pnpm test golden` records them afresh, after a change meant to alter play.
