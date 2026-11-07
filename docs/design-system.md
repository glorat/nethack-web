# Design system

The site has two looks:

- **The landing pages** (`/offline/`, `/online/`) are nethack.app's own, the brand.
- **The game** keeps the Cocoa port's look, as `docs/cocoa-parity.md` describes.

Both take their colours from tokens in `src/styles.css`. The landing pages set their own tokens on `.landing`, so a change there doesn't reach the game.

## Principles

- **The game's own material comes first.** The landing pages are built from what NetHack already has: its tiles, its tombstone, its opening lines, its fortune cookies and its greeting. Nothing is invented to stand in for them.
- **Each colour means one thing everywhere:**
  - amber is offline, and nethack.app's own colour;
  - cyan is online;
  - red is a death;
  - blue is the game's selection and focus.
- **A brand colour and an interaction colour can differ.** Amber draws the eye on a landing page. In the game, the interface colour should recede so the map leads. The game also already uses yellow and orange for warnings (the status badges, a low HP bar), so amber there would read as one more warning.
- **The accent marks only a few things on a screen.** Used on everything, it stops pointing at anything.

## Colour

| Token | Landing pages | Game | For |
|---|---|---|---|
| `--bg` | `#0b0b0c` | `#1e1e1e` | The page |
| `--text`, `--bright`, `--muted` | Light greys | Light greys | Text: body, emphasis, secondary |
| `--accent` | Amber `#e8a33a` | Blue `#3b82f6` | The colour each look builds on |
| `--online` | Cyan `#5fb8c0` | Not used | Online |
| `--danger` | `#e0603f` | `#e5534b` | A death, or a destructive action |

The accent reaches the page through role tokens, so a role can take another colour without the rest changing:

- `--action` and `--on-action` (a primary button and the text on it);
- `--link`, `--label` (frame labels) and `--focus`;
- `--menu-hover` and `--on-menu-hover`.

**Mode colour.** On a landing page, `--mode` is amber offline and cyan online. It colours:
- frame labels and frame borders;
- the Play button;
- the OFFLINE or ONLINE marker.

A way to the other home ("Go Online", "Play Offline Instead") takes that home's colour: the `to-online` and `to-offline` classes. The offline home's "Play online" frame is cyan.

Text on amber or cyan is near-black (`--on-accent`), as white doesn't read on either.

## Type

- **VT323,** from a DEC VT terminal's font: the wordmark, headlines and frame labels.
- **IBM Plex Mono:** all other landing-page text. Monospace, for the terminal feel.

Both are bundled from `@fontsource` (Latin only), which `src/ui/Landing.tsx` imports, so the service worker precaches them and offline pages need no outside service.

The game uses the system font, as Cocoa does, and keeps its own monospace for keys and stats.

## Landing-page parts

- **Frame:** `.frame` with a `.frame-label` set into its top line. Every panel on a landing page is one. Give a frame's heading the `frame-label` class. Where the label only repeats something, as "Play" does above the greeting, make it a `div` with `aria-hidden`.
- **The room** (`src/ui/landing/Scene.tsx`, layout in `src/port/scene.ts`): a fixed room drawn from `tiles64.png`, the same on every visit.
  - On a first visit it carries notes for a newcomer. Below 640px the notes are hidden, and the room's description reads them to screen readers.
  - Tile indexes are checked against the core's `win/share` names in `tests/headless/scene.test.ts`.
- **Messages above the room** (`src/port/omens.ts`): the full moon, new moon and Friday the 13th lines, worked out from the date as `allmain.c` does, then a fortune cookie from the core's `dat/rumors.tru`.
- **Tombstone** (`src/ui/landing/Grave.tsx`, from `src/port/tombstone.ts`): the latest finished game.
  - Offline, from the last line of the core's `xlogfile`.
  - Online, from the latest finished online game.
- **The high score list:** laid out like the core's own list: No, Points, Name.
- **Hotkeys:** a label's first letter is underlined and works as a key (`Keyed` in `Landing.tsx`). Visible labels stay short ("Play"), and a visually hidden span carries the full name ("Play Offline as Kevin").

## Layout

- Two columns: Play and the player's own frames on the left, and the room with its messages and status lines on the right. Online, the high scores go under the room.
- An iPad in landscape keeps both columns.
- Below 900px the columns stack in this order: Play, the room, then the rest.
- Phones get no special handling.

## Voice

This covers all text we write, on the landing pages and in the game's interface. The core's own messages are the game's, and stay as they are.

**Who it's for.** Veterans first. The words' job is to show a NetHack player that this is the real game, done well. Regulars need almost no words, and newcomers get the "New to NetHack?" frame.

**The voice: Guidebook, old hand.** Plain, exact, brief and dry, and it knows the dungeon.
- Say what the player gets and what they can do, not how the system works ("Your games stay on this device", not "Games are stored locally").
- Say what something is, not what it isn't.
- Claim only what's true for every player. "The keys are the ones you know from the terminal", not "every key works": browsers on Windows and Linux keep Ctrl-T, Ctrl-W and Ctrl-N.
- No selling: no "experience", no "adventure", no exclamation marks.

**The game's own lines.** Where the game has words for something, use them: the greeting, "Who are you?", the tombstone, the fortune cookies. Beyond that, a game message may add flavour:
- Only real messages, quoted exactly from the core. Never one written in its style, as veterans can tell.
- Only where nothing is at stake: empty states, waiting, the not-found page, and a confirmation after something is done.
- Never in errors, delete prompts, sign-in, privacy or the terms.
- Beside the plain sentence, never in place of it: "No one is on the high scores yet. You hear the footsteps of a guard on patrol."

**The case for the site.** When there's no game to continue, the Play frame says what this is: "The real NetHack 5.0, free, with no sign-up. The keys are the ones you know from the terminal, and you can also play with the mouse and painted tiles." Then one line for the mode. Page descriptions and link previews use the same sentence. Online play works without signing in, so "no sign-up" is true of both homes.

**Rules**
- Buttons and menu items in Title Case, as Cocoa's are ("Delete Game"). Everything else, links included, in sentence case.
- "…", never "...". Straight quotes and apostrophes. No semicolons.
- Dates and numbers in the player's locale (`toLocaleString`).

**Words**
| Use | For | Not |
|---|---|---|
| nethack.app | The site, always lower case. Don't start a sentence with it | NetHack (that's the game) |
| NetHack 5.0 | The version | NetHack 5 |
| handle | Your public name online | username, public name |
| name | Your character's name | |
| high scores | The public list of online games | leaderboard |
| games on this device | Offline games | local games |
| sign in | The verb. "Sign In" on buttons | log in |
| game | One run, from start to death or ascension | session, run |

On a home's own page, leave out its mode: "Your finished games" on the online home, not "Your finished online games".
