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

Copy follows the game's own words where it has them, as with the greeting "Hello Kevin, welcome to NetHack!". Otherwise it's plain and classic, in the tone of the Guidebook.
