# Game recordings

A recording holds everything a game took from the page: what the player typed, chose and answered, and every value the core would otherwise read from the machine (its clock, random seeds, the game's id). The core plays it out again exactly. `src/worker/recorder.ts` writes it, wrapping the worker's `GameHost`.

## Where it's kept

- **During the game:** under `/save/replay/<game>/`, in numbered chunks (`000001`, `000002`, …) of about 64 KB, so IndexedDB rewrites only the last chunk.
- **As it's written:** each new line goes to the page as a `recorded` event, for sending on. `atPrompt` marks the core stopping to wait, when everything it did since the last wait is there.
- **When the game ends:** the whole text goes to the page as a `recording` event, and the chunks are deleted. The end screen's Replay plays it on the same page. An offline game also keeps it in localStorage (`nethack.lastGame`) when it fits.
- **Online:** the server holds the only copy, sent one batch at a time, each ending where the core waits.

## Lines

Each line is `<time> <tag> [args]`. `time` is the player's clock when the line was written, in seconds since 1970, kept as it was even if the clock jumps, and for information only. Text that could hold anything is a JSON string literal. `-` is an answer the page gave none to, such as a cancelled prompt.

| Tag | Arguments | Meaning |
|---|---|---|
| `nhrec` | format | First line of a recording; the format is 1 |
| `session` | `new <time> tz=<±hh:mm>` | A new game started; its time zone holds for the whole game |
| `session` | `restore <time>` | The game was restored from its save |
| `back` | time | The page was closed mid-game, and the game came back by replaying everything above; the session carries on with nothing lost |
| `session` | `unrecorded <time> tz=…` | A game restored without its whole recording: its start was never recorded, or the player continued it from a checkpoint; a replay stops here |
| `opt` | JSON | NETHACKOPTIONS, at the start of every session, as they can change between sessions |
| `rc` | JSON | The `.nethackrc`, likewise |
| `alone` | `0` or `1` | No other tab was playing in the same mode |
| `seed` | n | A random seed the core asked for |
| `reseed` | n | A seed the authority put in the core's main random generator as the turn moved on, after that turn's checks and before its first command; a replay puts it in at the same point |
| `now` | n | The time the core asked for, in seconds since 1970 |
| `uuid` | uuid | The new game's id |
| `bones` | name hash | What the host answered when the core looked for bones for a level: the SHA-256 of the file, or `-` for none |
| `k` | key code | A key |
| `c` | x y button | A click on the map |
| `y` | JSON key [count] | An answer to a yes/no question about the game itself |
| `l` | JSON text | A line typed at a prompt |
| `m` | JSON list | Menu items chosen, each `[text, which, count, letter]`, `which` counting the items with that text and `letter` empty for an item without one; or `[number, count]` for a choice the menu doesn't list; a count of -1 means none was given |
| `w` | | A text window dismissed |
| `x` | JSON name | An extended command chosen |
| `p` | JSON list | A character chosen: the names of its role, race, gender and alignment, or the core's negative number for one left to it |
| `asc` | `0` or `1` | The ASCII map switched from outside the game |
| `T` | turn sum | The turn has just moved on, before the next command; `sum` is four hex digits for the core's main random generator and the hero's position |
| `=` | turn `@`x,y rng JSON | A check, every 100 turns: where the hero was, a fingerprint of the core's random generator, and every field the status line showed, by name |
| `lv` | hash | While shadowed, every 20 turns: a hash of the game's files as the last checkpoint left them |
| `end` | `save` or `over` | The session ended by saving, or the game ended; written before the last persist, as the page may go straight after it |

Answers name what was chosen, as a position in the core's tables moves when something is added and a menu item's number can be a memory address. A replay finds a menu item by its text, and otherwise by a letter only one item has, and stops at that line if neither matches. The checks below catch a letter that has come to mean another item, once that changes the game. The front end's own answers for the player are names too, such as the action the toolbar's `#hereaction` asks for.

Older recordings may number their lines, hold `ckpt` lines and a time on `T`, and pick without a letter; a replay skips those parts. One holding `session recover` is refused.

The core's reads of the clock take the `now` lines in order: a read after the last line gets the last time, and a line no read takes is skipped.

An online game's `seed`, `now` and `uuid` lines hold what the server gave. When the core first wants a seed in a session, the page asks the server for the seed for the turn of the last `T` line (0 before the first), and each further seed is one more than the last, so the recording replays like any other. A validator reads each `seed` line as a logged answer for the game plus a count.

## Replaying

`src/worker/replayer.ts` plays a recording again. Each session runs on a fresh core whose host answers from the recording and checks each `T`, `=` and `end` against the core. Every line is read once before the replay starts, so a malformed line fails the recording at once. After that only where each line starts is kept, so a replay needs little more memory than the recording's text. A restore starts from the files the replay itself saved. The replay stops at the line where the game went differently.

The sum on each `T` covers the main random generator and the hero's position, so a game that goes differently stops within a turn or so. A `=` also compares the figures on the status line (HP, AC, attributes, gold, turn and so on) by name, leaving out wording, glyph numbers and any field one side lacks. A difference elsewhere, such as a stored value no roll has used yet, shows once it reaches one of these.

`tests/headless/golden/` holds long recorded games that every test run replays exactly. To add one, add it to `GAMES` in `tests/headless/golden.test.ts` and run `GOLDEN=write pnpm test golden`, which records each game that has no file yet.

## Bones

Bones belong to the host. When the core looks for bones for a level it asks the host, and when it writes some at a death it hands them over. `src/offline/bones.ts` is the browser's database, under `/save/bones/`:

- `<sha256>` holds the bones themselves, kept for good so that recordings naming them replay.
- `<name>`, such as `bonD0.5`, holds the hash of the bones waiting for the next game to reach that level. The first bones left for a level stay until a game takes them. Only normal games, not debug-mode ones, leave and take bones.

A recording holds only the hash, so a replay needs a database with those bones, and stops at that line otherwise. A replay reads bones and leaves them in place. Taking bones and recording it reach IndexedDB in the same sync, at the next command.

## Coming back after the page closed

A game left unfinished comes back by replay. When the core finds the game's lock and asks about the old game, `src/worker/resume.ts` plays the recording on new cores out of sight, the last session on a core reading the real `/save`. When the lines run out, the recorder takes over on that same core, and the page goes straight to where the last session had got to: the map, status and latest messages, leaving out any bell along the way. IndexedDB is written from then on.

If the replay goes differently, the recording is cut back to its last line known good, and the game comes back from there and says so. A failed `=` goes back to the `=` before it, as sums cover only the generator and position; anything else goes back to the last sum or `=` that passed. An ASCII map switched in the part cut off stays as the page has it until it's next switched, while the core goes back to how it was.

A replay is applied once. If no check passed, the second replay fails too, or the recording won't replay, the player chooses: destroy the game, or continue from its last checkpoint and lose what came after. A game continued that way starts its recording again as `session unrecorded`, and is offered the same choice on every later close. This is the only use of the core's checkpoints, and only the player destroys a game.

A page that closes or crashes during a replay leaves `/save/resuming`, so the next start asks first. It also asks when another tab is playing in the same mode or there are no locks to tell. There Destroy deletes the game and Recover applies its replay.

An online game comes back from the server the same way: a game that stopped mid-session as above, and a saved one by replaying to get the save and then restoring it. Lines still unsent when the page closed are lost, so the game goes back a little. A game whose recording won't replay ends, and the player is offered a new one.

The web build reads the high score list only to rank a finished game, so a replay plays the same whatever the list holds. Corpses, statues and doppelgangers that would take a past player's role and name get a random role and no name, as on a new install.

## Watching a recording

In the browser, `/offline/watch/` plays the last finished offline game, and `/online/watch/?game=…` a finished online game from the server. Each offline game over replaces the last one's recording, and the end screen offers a button for it. A recording that won't play, such as a corrupted one, is shown as no longer available. `src/worker/replay-runner.ts` plays it at a chosen number of turns a second, flashing each prompt the player answered at 1× and slower. Faster, it sends the page what happened about every 30 ms, without the bells, so the browser keeps up with the map. It seeks by playing again from the start out of sight.

## Shadowing a game

For developers. `?shadow` on a game page, such as `/offline/play/?shadow`, turns it on for this browser, and `?shadow=0` turns it off. A second worker runs its own core, replaying the recording as it's written (`src/worker/shadow.ts`) and checking every mark, so a game that wouldn't replay shows up while it's played. It only reads. A bar shows how it's getting on.

The shadow also compares the game's files through `lv`. Those files hold raw pointers, so they match only on the build that wrote them: trust `lv` on a game started on the current build. A difference on the level being played shows at the next level change.

The bar's **Download Debug Package** gives a JSON file with the recording so far, the bones it names, the build, and both sides' files of this game if it found a difference. It holds the character's name and options and all that was typed, and goes only where someone sends it by hand. To replay one on the headless core:

```
PACKAGE=/path/to/package.json pnpm test debug-package
```
