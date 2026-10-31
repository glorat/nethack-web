# Game recordings

A recording holds everything a game took from the page: what the player typed, chose and answered, and every value the core would otherwise have read from the machine (its clock, random seeds, the game's id). Run the same core on it and the game plays out again exactly.

`src/worker/recorder.ts` writes it, wrapping the worker's `GameHost`.

## Where it's kept

- **While the game lasts:** under `/save/replay/<game>/`, in numbered chunks (`000001`, `000002`, …) of about 64 KB. IndexedDB rewrites a whole file when it changes, so only the last chunk gets rewritten.
- **As it's written:** each new line is also posted to the page as a `recorded` event, for sending on. `atPrompt` marks when the core has stopped to wait, so that everything it did since the last wait is there.
- **When the game ends:** the whole text goes to the page as a `recording` event, which keeps it in localStorage (`nethack.lastGame`), and the chunks are deleted.

## Lines

Each line is `<time> <tag> [args]`. `time` is the player's clock when it was written, in seconds since 1970; a replay doesn't use it. Text that could hold anything is a JSON string literal. `-` stands for an answer the page gave none to, such as a cancelled prompt.

| Tag | Arguments | Meaning |
|---|---|---|
| `nhrec` | format | First line of a recording; the format is 1 |
| `session` | `new <time> tz=<±hh:mm>` | A new game started; its time zone holds for the whole game |
| `session` | `restore <time>` | The game was restored from its save |
| `back` | time | The page was closed mid-game, and the game came back by replaying everything above; the session carries on, with nothing lost |
| `session` | `unrecorded <time> tz=…` | A game restored with no whole recording: its start was never recorded, or the player continued it from a level change; never replays |
| `opt` | JSON | NETHACKOPTIONS, at the start of every session, as they can change between sessions |
| `rc` | JSON | The `.nethackrc`, likewise |
| `alone` | `0` or `1` | No other tab was playing |
| `seed` | n | A random seed the core asked for |
| `now` | n | The time the core asked for, in seconds since 1970 |
| `uuid` | uuid | The new game's id |
| `bones` | name hash | What the host answered when the core looked for bones for a level: the SHA-256 of the file, or `-` for none |
| `k` | key code | A key |
| `c` | x y button | A click on the map |
| `y` | JSON key [count] | An answer to a yes/no question; the player's answers about a game left unfinished are left out |
| `l` | JSON text | A line typed at a prompt |
| `m` | JSON list | Menu items chosen, each `[text, which, count, letter]`, `which` counting the items with that text and `letter` being empty for an item without one; or `[number, count]` for a choice the menu doesn't list; a count of -1 means no count was given |
| `w` | | A text window dismissed |
| `x` | JSON name | An extended command chosen |
| `p` | JSON list | A character chosen: the names of its role, race, gender and alignment, or the core's negative number for one left to it |
| `asc` | `0` or `1` | The ASCII map switched from outside the game |
| `T` | turn sum | The turn has just moved on, before the next command; `sum` is four hex digits for the core's main random generator and the hero's position |
| `=` | turn `@`x,y rng JSON | A check, every 100 turns: where the hero was, a fingerprint of the core's random generator, and every field the status line showed, by name |
| `lv` | hash | Only while shadowed, every 20 turns: a hash of the game's files as the last checkpoint left them, which hold raw pointers and so only match on the same build |
| `end` | `save` or `over` | The session ended by saving, or the game ended; written before the last persist, as the page may go straight after it |

Answers name what was chosen rather than the core's number for it. A position in a table moves when something is added to it, and a menu item's number can be a memory address. A replay finds the choice in the prompt it's answering, a menu item by its text and otherwise by a letter only one item has, and stops at that line if neither is there. A letter can then mean another item, which the checks below catch if it changes the game.

A recording from before these rules may number its lines and hold `ckpt` lines and a time on `T`, which a replay ignores, and picks without a letter; one holding `session recover` is refused.

The core's reads of the clock needn't match the `now` lines one for one, as they aren't the game: a read with no line left gets the last time, and a line no read takes is skipped.

All times are the player's clock and are recorded as they were, even if that clock jumps.

## Replaying

`src/worker/replayer.ts` plays a recording again. Each session runs on a fresh core whose host answers from the recording, checking each `T`, `=` and `end` against the core. A restore starts from the files the replay itself saved. The replay stops with the line where the game went differently.

The sum on each `T` covers the main random generator and the hero's position, so a game that goes differently is nearly always stopped within a turn or so. A `=` also compares the figures on the status line (HP, AC, attributes, gold, turn and so on), leaving out wording and glyph numbers, and ignoring a field either side lacks. Something that differs without touching any of those, such as a stored value no roll has yet depended on, replays without complaint until it does. Only a change to the dice the game rolls or where the hero stands should stop a replay. They hold across a rebuild that doesn't change how the game plays, such as adding an extended command. A shadow also compares the bytes of the game's files as of the last checkpoint through `lv`, so what it sees of the level being played waits for the next level change, but only for lines written while it follows, since earlier ones may be from another build. A game whose files an earlier build wrote can still show a difference there that isn't one: after a rebuild, trust a shadow's `lv` result only on a new game.

## Bones

Bones belong to the host, not the core. When the core has decided to look for bones for a level it asks the host, and when it has written some at a death it hands them over. `src/worker/bones.ts` is the browser's database, under `/save/bones/`:

- `<sha256>` holds the bones themselves, kept for good so that recordings naming them can replay.
- `<name>`, such as `bonD0.5`, holds the hash of the bones waiting for the next game to reach that level. The first bones left for a level stay until a game takes them; debug-mode games neither leave nor take any.

A recording holds only the hash, so a replay needs a database that has those bones, and stops at that line if not. A replay never takes anything, so it can't use bones up. Taking bones and recording that reach IndexedDB in the same sync, at the next command.

## Coming back after the page closed

A game left unfinished comes back by replay when it can. When the core finds the game's lock and asks about the old game, `src/worker/resume.ts` plays the recording on new cores without showing it, the last session on a core reading the real `/save`. When the lines run out, the recorder takes over on that same core and the page is shown the last session's events. Nothing reaches IndexedDB until then.

If the replay goes differently, the recording is cut back to its last line known good, and the game comes back from there and says so. An ASCII map switched in the part cut off stays as the page has it, while the core goes back to how it was, until it's next switched. A failed `=` goes back to the `=` before it, as sums take no account of the status line; anything else goes back to the last sum or `=` that passed.

A replay is applied once, as it would only fail the same way again. If no check had passed, the second replay fails too, or the recording can't be replayed, the player chooses: destroy the game, or continue from its last level change, losing what came after. A game continued that way starts its recording again as `session unrecorded`, so it can never be replayed or accepted by a server, and it's offered the same choice on every later close. The core's checkpoints play no other part. Only the player can destroy a game.

A page that closes or crashes during a replay leaves `/save/resuming`, so the next start asks first instead of replaying. So does another tab being open, or having no locks to tell. There Destroy deletes the game and Recover applies its replay.

The web build never reads the high score list during play, only to rank a finished game, so what's on it can't make a replay go differently. Corpses, statues and doppelgangers that would take a past player's role and name get a random role and no name, as on a new install.

## Watching a recording

In the browser, `/play/?replay` plays the last finished game, which each game over replaces, and only the end screen offers a button for it. Recordings aren't versioned: one that no longer plays, as after an upgrade that changed the game, or that's corrupted, is reported only as no longer available. `src/worker/replay-runner.ts` plays it at a chosen number of turns a second, flashing each prompt the player answered at 1× and slower, and seeks by playing again from the start without showing the way.

`tests/headless/golden/` holds long recorded games that every test run replays, so a change that alters how the game plays fails there. `GOLDEN=write pnpm test golden` records them afresh, after a change meant to alter play.

## Shadowing a game

For developers. `/play/?shadow` turns it on for this browser and `?shadow=0` turns it off. A second worker runs its own core, replaying the recording as it's written (`src/worker/shadow.ts`) and checking every mark, so a game that wouldn't replay shows up while it's played. It only reads, and can't affect the game. A bar shows how it's getting on.

The bar's **Download Debug Package** gives a JSON file with the recording so far, the bones it names, the build, and both sides' files of this game if it found a difference. It holds the character's name and options and all that was typed, and is only ever shared by hand. To replay one on the headless core:

```
PACKAGE=/path/to/package.json pnpm test debug-package
```
