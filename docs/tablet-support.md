# Tablet support

The aim is a game that plays on an iPad or similar tablet in landscape, by touch alone or with a keyboard. Phones and portrait aren't supported.

In landscape every iPad is at least 1133px wide, so it gets the desktop layout, inventory sidebar included. Nothing below has been tried on a real device yet.

## Already working by touch

- Tapping the map steps or travels, and a prompt for a map position takes a tap as the answer (`getpos.c`).
- The menu bar covers about 90 commands.
- Menus, answer buttons, the direction picker, text fields and the character picker are all tappable.
- Safari's pinch gesture zooms the map, as do the + and − buttons.

## To do

### Prompts and cancelling

- [ ] **Every prompt gets a dialog, on desktop as well.**
  - This includes the prompts with no answer list or more than nine answers, which Cocoa asks in the message window.
  - "Press a key" prompts (`#adjust`, the crystal ball, `&`) have a Cancel button, but still need a way to answer by touch, such as a one-character field that brings up the on-screen keyboard. Whether iOS's on-screen keyboard sends key events the dialog can read needs a device.
- [ ] **An Esc button on screen** whenever there's something to cancel: a dialog, a map position prompt, a prompt waiting for a key.
  - It also teaches new players on desktop that Esc cancels.
  - It covers iPad keyboards without an Esc key, such as the Magic Keyboard.
  - Left for later: the core gives no sign that a map position prompt is waiting, so the button can't yet tell when there's something to cancel there.
- [x] **⌘. works as Esc**, as in iPadOS and macOS apps, for keyboards without an Esc key.
- [x] **The extended command dialog has a Cancel button**, as Cocoa's has a window close button.

### Commands

- [x] **The menus have the commands Cocoa's lacked:**
  - Repeat and Extended Command... in Act;
  - Travel Again (`#retravel`) in Move;
  - Tip Container in Act;
  - Annotate Level in Info;
  - Quit Without Saving in Game.

  Cocoa's menu bar comes from the 3.4.3-era port and was regrouped, not extended, in 2026, so it missed commands added since: `#tip` and `#annotate` arrived in 3.6.0, and `#retravel` in 5.0. Repeat dates from 3.4.3, but Cocoa players type `^A`, and Cocoa's only Quit is the app's, which saves. Repeat is sent as its key, as running it as an extended command would clear the command it repeats.

### The map

- [ ] **A long press does what a right-click does**: the context menu with the wiki search.
  - iOS Safari doesn't send `contextmenu` for a long press, so it needs its own timer on touch pointer events.
  - The timer must be cancelled when the finger moves or a second finger joins, so panning and pinching still work.
  - The tap that ends a long press must not also reach the core as a click, or the hero moves.
  - It must not affect the mouse, so check `pointerType`.
  - There's no downside beyond that care. Map tooltips on touch aren't needed.
- [x] **Safari's own touch handling is kept off the map**, so it doesn't fight the game's taps:
  - `touch-action: manipulation` stops double-tap zooming the page and keeps panning. A pinch still reaches the map's own zoom through Safari's gesture events, which the map stops from zooming the page. That's untried on a device.
  - `-webkit-touch-callout: none` and `user-select: none` stop a long press selecting text or opening the callout.
  - `overscroll-behavior: none` stops the map bouncing.

### Touch targets

- [ ] **Bigger targets under `@media (pointer: coarse)`.**
  - Menu bar items, menu rows, inventory rows and dialog buttons are about 24 to 26px tall.
  - Pad them to Apple's 44pt minimum for touch only, so desktop keeps its density.

### Check on a device

- [ ] **Storage:** Safari deletes a site's stored data after 7 days without a visit, unless the site is on the Home Screen. Offline games and the options file would be lost.
  - Find out whether that applies here.
  - If it does, decide between asking players to add it to the Home Screen and relying on online mode's server copy.
- [ ] **Wasm on iOS Safari:** memory, and the speed of ASYNCIFY, on a long game and a long replay.
- [ ] **The on-screen keyboard:** whether it covers the dialog that opened it.

## Later

- **A count before a command** (`n20s`, search 20 turns) by touch. A gap, but not a priority.
- **Quick actions:** a toolbar for search, rest, repeat, pick up and the stairs, instead of two taps through a menu.

## Not supported

- **Phones, and portrait on a tablet.** Below 900px the inventory sidebar is hidden, and the map sits in a corner.
- **Map tooltips by touch.**
