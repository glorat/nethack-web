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

**Who it's for.** Veterans first: the words' job is to show a NetHack player that this is the real game, done well. A first visit serves newcomers too, so it can carry a little for them (the room's notes, "New to NetHack?"), but a veteran reads every first-visit line as well, so nothing there may read as a simplified game. Regulars need almost no words.

**The voice: Guidebook, old hand.** Plain, exact, brief and dry, and it knows the dungeon. No selling.

**Before writing a line, name its reader and their doubt.** Who reads this spot, and what are they wondering at that moment? Write the line that settles that doubt, and stop. Then test every phrase:
- **Does it answer this reader?** A phrase that would persuade someone else (a newcomer in a veteran's spot, or the other way round) waters down the line, and can raise the very doubt the line is there to settle. It belongs where that other reader looks.
- **Did a doubt choose it, or did a feature list?** Something being true and ours is not a reason to say it. Start from what the reader doubts, not from what the site has.
- **Does the page already show it?** Don't tell what a picture, a label or the layout already shows. Words go to what can't be seen.
- **Would the reader miss it if it were cut?** If not, cut it.
- **Is it already said on this page?** Say each fact once, in the place the reader looks for it.
- **Is it true for every player?** It must hold on every device, browser and mode. A claim may stand with rare exceptions only if a player who meets one can find it explained in the help. Otherwise claim less.
- **Is it about the player or the system?** Say what the player gets and can do, never how it works underneath.
- **Does it say what something is?** A line made of what something isn't or lacks leaves the reader to work out what's left.

**Borrowed words must be genuine.** Where the game has words for something, use them. Beyond that, a game message may add flavour:
- Only real messages, quoted exactly from the core: a whole message or an unchanged part of one. Never one written in its style, as veterans can tell.
- Only where nothing is at stake: empty states, waiting, the not-found page, and a confirmation after something is done.
- Never in errors, delete prompts, sign-in, privacy or the terms.
- Beside the plain sentence, never in place of it.

**The case for the site.** `PITCH` in `src/port/pitch.ts` is the case to a veteran. The Play frame shows it when there's no game to continue in that mode, whether or not it's a first visit, then the mode's one line, which shows on every visit. The page descriptions in the HTML files and the share page's fallback repeat it, so they change together. A shared game's page leads with that game, not the case. The link preview's image, `public/social.jpg`, is a screenshot of the offline home (`public/README` says how it's taken), so retake it when the home's look changes.

**Rules**
- Title Case for anything that acts as a command: buttons, menu items, and links styled or used as one, such as the way to the other home. Follow Apple's style: lower case for articles, coordinating conjunctions and prepositions of four or fewer letters, unless first or last. Everything else, other links included, in sentence case.
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

On a home's own page, leave out its mode, as the page already says it. Privacy notices and the terms keep it, where being explicit matters more than being brief.
