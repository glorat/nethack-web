# Cocoa parity checklist

Capabilities of [nethack-cocoa](https://github.com/glorat/nethack-cocoa) (`win/cocoa/`) that this front end doesn't have yet. Tick items off as they land, one commit per item with its test.

Decided for the web:

- Commands and wizard commands go in a slim menu bar along the top of the page, grouped as Cocoa's are.
- Right-click opens a small context menu with the wiki search, and keeps the secondary click to the core as an item.
- Options are a raw `.nethackrc` editor, as in Cocoa.
- Ship the 64px and classic 16px tile sheets; no 128px.
- Speech, notes, sound and tile-set import are later phases, not dropped.

## Map

- [x] Map marks (`MainView.m` `drawMarks`): pet heart, peaceful dot, steed saddle, item-pile badge, dashed outline on sensed-but-unseen monsters. Cocoa turns on `hilite_pet` and `hilite_pile`; the marks need the peaceful and ridden flags passed through.
- [x] Right-click menu: "Search the NetHack Wiki for '…'", with the description cleaned of tame/peaceful/articles (`menuForEvent`, `cleanTileDescription`), plus an item for the core's secondary click.
- [x] Two arrow keys held together move diagonally (`MainView.m` `keyDown`/`keyUp`).
- [x] ASCII mode: characters and colours instead of tiles, cell sized to the font (`enableAsciiMode`), with brighter blue, green and brown.
- [x] The hero's cursor is green above 75% HP, yellow above 50%, red below (`MainView.m` `drawRect:`).
- [x] Pinch zoom, actual size (⌘0) and zoom keyboard shortcuts.

## Status

- [x] Green/red ↑↓ beside St, Dx, Co, In, Wi, Ch, AC, XL or HD for a few turns after a change (`StatsView.m` `showChange`, `iHack/NhStatus.m`).
- [x] Badge colours by severity for hunger, encumbrance and conditions (`NhStatusBadge`).

## Menus

- [x] Default menu colours: blessed and holy water green, cursed and unholy water red, after the player's `MENUCOLOR` rules so those win (`wincocoa.m` `AddDefaultMenuColors`); `MENUCOLOR` attributes shown in the inventory sidebar too.
- [x] Counts: digits typed before a letter take that many.
- [x] Any inventory letter is accepted in a suitable-items menu, not only those listed (`UnlistedInventory`).
- [x] Pick-any keys `.` `,` select all and `-` `\` clear; a Select All button.
- [x] Sort A–Z checkbox, sorting items under each heading (`sortItems`).
- [x] Pick-one menus of 2–4 short items without tiles shown as answer buttons (`isQuestion`, `buildQuestionContents`).
- [x] Items the core gave no letter get the next free one, as tty and Cocoa hand out (`buildRows`).
- [x] Read-only menus as selectable, copyable text.
- [x] Keyboard and hover highlight; Return or space picks the highlighted row.

## Prompts

- [x] Direction picker: 3×3 arrows, Self, Up and Down, with a key hint, placed near the hero (`DirectionWindowController.m`).
- [x] Count line for yn prompts that allow one (`YesNoWindowController.m`, `YesNoInput`).
- [x] Vertical answer buttons when labels are long (`isHorizontal`).
- [x] A non-dismiss key closes a text window and goes to the game (`MessageWindowController.m` `keyDown`).

## Sidebar and layout

- [x] Show/Hide Inventory.
- [x] Drag the inventory sidebar's edge to resize it, remembered.
- [x] Bigger, Smaller and Default text size for messages, stats, inventory and menus, remembered (`TextSize.m`); `font_size_message` option.

## Commands and settings

- [x] Command menu grouped like Cocoa's menu bar (Act, Items, Magic, Info, …), each running `#` plus the command name, enabled only at the command prompt (`performMenuAction`, `validateMenuItem`).
- [x] Wizard Mode menu, shown only in wizard mode (`updateWizardMenu`).
- [x] Options file (`.nethackrc`) kept in the browser, editable, read at start.
- [x] `#saveoptions` writes to a file the game doesn't keep; copy it back into the browser's options file, minus the default menu colours it writes out as the player's own.
- [x] Tile set choice between 64px and classic 16px, and the `tile_file` option (`setTileSet`).
- [x] Game-over dialog offers Quit as well as New Game (`showGameOver`). Unlike Cocoa, Quit goes to the landing page, and Save & Quit goes there without the dialog, as a page can't close its own tab.
- [x] Help: what a key does, NetHack Wiki search.

## Second pass

- [x] Save & Quit doesn't ask "Really save?" or "Overwrite the old file?" (`wincocoa.m` `AlwaysYes`).
- [x] Equipment tooltips as Cocoa words them: "(a) +1 long sword", without "(being worn)" (`EquipmentView.m`).
- [x] Extended commands: a sole match is completed and selected as you type; Esc clears what's typed before it cancels (`ExtCommandWindowController.m`).
- [x] The bell, and a refused click or inventory pick, are heard or seen (`nhbell`, `NSBeep`).
- [x] Choose the ASCII map's font and size, remembered; choosing one switches to ASCII (`changeFont`).
- [x] An About box: NetHack, this port and the painted tiles by Kevin Tam, the Cocoa interface it follows, the classic tiles, the licence.
- [x] Closing the tab mid-game keeps the game (Cocoa saves on ⌘Q or closing the window, `terminateApplication`). A page can't wait on a save as it unloads, so the recording is kept as the game goes, and the next start brings the game back by replaying it, asking first only if the last replay didn't finish or another tab is open; see `docs/recording.md`.

## Third pass

Found by comparing the code of each window with Cocoa's.

Extended commands:

- [x] Nothing is highlighted until something is typed, so Return with an empty field runs nothing (`ExtCommandWindowController.m` `textChangedIn:`).
- [x] The highlighted row is scrolled into view (`highlightRow:`).
- [ ] A hint under the list: "Return runs the highlighted command, Esc cancels."

Messages:

- [ ] Message attributes: bold, underline for dim and underline, and inverse; a plain line mentioning "you" or "your" in blue (`iHack/NhWindow.m` `addLine:attr:`).
- [ ] A `------------` line between turns, after the core clears the message window.

Menus:

- [ ] A row picked by its letter is scrolled into view (`reloadRowForItem`).
- [ ] Columns padded with two or more spaces line up, as tab-separated ones do (`SplitFields`).
- [ ] The current heading stays at the top while the list scrolls (group rows).
- [ ] No tile or letter column in a menu without tiles or letters.
- [ ] A text line indented four or more spaces starts where the items' text does.
- [ ] Close is the default button in a read-only menu.

Status:

- [ ] HP and Pw bars warn below 2/3 as well as below 1/3 (`StatsView.m` `SetMeter`).
- [ ] Alignment, race and role, or the polymorphed form, and the dungeon's name with the level (`wincocoa.m` `RoleText`, `LevelText`).

Map:

- [ ] The Rogue level is drawn as text even with tiles on (`MainView.m` `drawRect:`).

To decide, by trying both:

- [ ] A prompt with fewer than two or more than nine answers goes to the message window instead of a dialog (`YesNoInput` `canAskWithChoices`).
- [ ] Roles a chosen race can't play are disabled in the character picker, where web changes the race instead (`PlayerSelectionWindowController.m` `selectRace`).
- [ ] Menus as wide as their contents, up to 90% of the screen, clipped rather than wrapped.
- [ ] Map tooltips shown only once the pointer rests, and kept across turns (`MainView.m` `mouseMoved:`).

## Later

- [ ] Importing a tile set, kept in the browser (`importTileSet`).
- [ ] Sound: a core feature, not Cocoa's. 5.0 calls a sound library (`include/sndprocs.h`; `sound/macsound` and others) for effects, achievements, instrument tunes, ambience and user sounds. A web one would be a fork sound library passing these to Web Audio.
  - **Clips:** the core ships 61 clips in `sound/wav` as uuencoded `.uu` files, about 6 MB. Decode them at build time, as `sys/unix/hints/include/multisnd2-pre.500` does, and consider a compressed format.
  - **Credits:** some clips are CC BY 4.0 (`sound/wav/attributions.txt`), so the About box needs a credit.
  - **Turning it off:** the `sounds` option, and play only after a gesture (as `src/ui/beep.ts` does).
  - **Coverage:** few events have clips, so the payoff is modest.
- [ ] Speech, in two parts:
  - the core's spoken lines (`sound_verbal` with `SetVoice()`, which `macsound` speaks), through `speechSynthesis` in the same sound library;
  - Cocoa's "Use Speech" toggle that reads every message aloud (`speakString`, called from `NhWindow.m`), a UI feature.
- [ ] Notes window, only if someone asks. It's Cocoa-only: one free-text pad, kept across games (`NotesWindowController.m`). The core's `#annotate` and `#name` already cover per-game notes.
- [ ] Reaching wizard mode from the browser, only if someone asks.
  - **What's needed:** `sys/libnh/sysconf` has `WIZARDS=root games`, and the core's user is `web_user`, so `playmode:debug` is refused. Cocoa doesn't offer it to players either.
  - **The catch:** opening it with `WIZARDS=*` first needs a fork guard in `can_make_bones()` refusing debug mode, as it refuses explore mode, because a debug game's bones would reach later normal games (the `wizard_bones` flag is never read).
