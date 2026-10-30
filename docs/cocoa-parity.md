# Cocoa parity checklist

Capabilities of [nethack-cocoa](https://github.com/glorat/nethack-cocoa) (`win/cocoa/`) that this front end doesn't have yet. Tick items off as they land, one commit per item with its test.

Decided for the web:

- Commands and wizard commands go in a slim menu bar along the top of the page, grouped as Cocoa's are.
- Right-click opens a small context menu with the wiki search, and keeps the secondary click to the core as an item.
- Options are a raw `.nethackrc` editor, as in Cocoa.
- Ship the 64px and classic 16px tile sheets; no 128px.
- Not porting Cocoa's speech or notes.

## Map

- [x] Map marks (`MainView.m` `drawMarks`): pet heart, peaceful dot, steed saddle, item-pile badge, dashed outline on sensed-but-unseen monsters. Cocoa turns on `hilite_pet` and `hilite_pile`; the marks need the peaceful and ridden flags passed through.
- [x] Right-click menu: "Search the NetHack Wiki for '…'", with the description cleaned of tame/peaceful/articles (`menuForEvent`, `cleanTileDescription`), plus an item for the core's secondary click.
- [x] Two arrow keys held together move diagonally (`MainView.m` `keyDown`/`keyUp`).
- [x] ASCII mode: characters and colours instead of tiles, cell sized to the font (`enableAsciiMode`), with brighter blue, green and brown.
- [x] The hero's cursor is green above 75% HP, yellow above 50%, red below (`MainView.m` `drawRect:`).
- [x] Pinch zoom, actual size (⌘0) and zoom keyboard shortcuts.

## Status

- [ ] Green/red ↑↓ beside St, Dx, Co, In, Wi, Ch, AC, XL or HD for a few turns after a change (`StatsView.m` `showChange`, `iHack/NhStatus.m`).
- [ ] Badge colours by severity for hunger, encumbrance and conditions (`NhStatusBadge`).

## Menus

- [ ] Default menu colours: blessed and holy water green, cursed and unholy water red, ahead of the player's `MENUCOLOR` rules (`wincocoa.m` `AddDefaultMenuColors`); `MENUCOLOR` attributes shown in the inventory sidebar too.
- [ ] Counts: digits typed before a letter take that many.
- [ ] Any inventory letter is accepted in a suitable-items menu, not only those listed (`UnlistedInventory`).
- [ ] Pick-any keys `.` `,` select all and `-` `\` clear; a Select All button.
- [ ] Sort A–Z checkbox, sorting items under each heading (`sortItems`).
- [ ] Pick-one menus of 2–4 short items without tiles shown as answer buttons (`isQuestion`, `buildQuestionContents`).
- [ ] Read-only menus as selectable, copyable text.
- [ ] Keyboard and hover highlight; Return or space picks the highlighted row.

## Prompts

- [ ] Direction picker: 3×3 arrows, Self, Up and Down, with a key hint, placed near the hero (`DirectionWindowController.m`).
- [ ] Count line for yn prompts that allow one (`YesNoWindowController.m`, `YesNoInput`).
- [ ] Vertical answer buttons when labels are long (`isHorizontal`).
- [ ] A non-dismiss key closes a text window and goes to the game (`MessageWindowController.m` `keyDown`).

## Sidebar and layout

- [ ] Show/Hide Inventory.
- [ ] Drag the inventory sidebar's edge to resize it, remembered.
- [ ] Bigger, Smaller and Default text size for messages, stats, inventory and menus, remembered (`TextSize.m`); `font_size_message` option.

## Commands and settings

- [ ] Command menu grouped like Cocoa's menu bar (Act, Items, Magic, Info, …), each running `#` plus the command name, enabled only at the command prompt (`performMenuAction`, `validateMenuItem`).
- [ ] Wizard Mode menu, shown only in wizard mode (`updateWizardMenu`).
- [ ] Options file (`.nethackrc`) kept in the browser, editable, read at start.
- [ ] Tile set choice between 64px and classic 16px, and the `tile_file` option (`setTileSet`).
- [ ] Game-over dialog offers Quit as well as New Game (`showGameOver`).
- [ ] Help: what a key does, NetHack Wiki search.

## Deferred

- [ ] Importing a tile set, kept in the browser (`importTileSet`).
