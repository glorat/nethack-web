# Newcomer UX

What still makes it hard for a new player to command the hero and follow what's happening, as opposed to how to play well, and that the front end can fix without changing the game's rules or showing what the game hides.

Effort: S under a day, M a few days, L a week or more. Benefit is to a new player. Both are rough guesses, to be revised as items are looked into. Ordered by priority.

## To do

- [x] **Explain status badges and every stat:** what each means, how urgent a badge is, and that lower AC is better. Effort S, benefit high. Decided: do it.
  - The labels and severities are already in `src/ui/StatsView.tsx` and `src/port/badges.ts`; this adds a short explanation each.
  - Wording answers the player's question ("You're turning to stone. Fix it now or you die."), not how the game works.
- [x] **Click or tap a stat or badge for a popover** with its explanation and a NetHack Wiki link, closed by clicking or tapping elsewhere. Effort S, benefit high. Decided: do it.
  - Stats and badges do nothing else when clicked, so nothing conflicts, and it works by touch.
  - Chosen over a one-shot help mode (press ?, then click anything), which is kept for later in case players can't find this; it would open the same popover.
  - Click only, with no hover tooltip: a toggletip, as accessibility guidance has it for tips that hold a link. A hover tooltip showing the same text before the popover read as a duplicate. A hover card that can be moved into, like Wikipedia's link previews, is the alternative if testers want hover back.
- [ ] **An on-screen Esc button** for dialogs and prompts waiting for a key. Effort S, benefit medium.
  - Also an open item in `docs/tablet-support.md`. Map position prompts wait on the item below.
- [x] **Quick-action toolbar** of what you can do where you stand. Effort M, benefit high. Decided, as designed below.
  - **Where:** a floating group at the map's bottom-left, mirroring the zoom buttons at the bottom-right, so on a tablet actions are under the left thumb and zoom under the right.
  - **What:** the actions the core's here-menu (`there_cmd_menu_self`, clicking your own square) finds for your square, such as go up or down, drink, sit, sacrifice, pick up, loot, tip, eat, dismount and disarm, plus Search, Rest and Cast (when you know a spell) always. Not the here-menu's Inventory, Drop and Look Here, which the sidebar and right-click already cover, nor actions on the squares next to you, which need a direction.
  - **From the core:** a fork change that lists those actions each turn without opening a menu, and runs one by its ID as picking it from the here-menu does, so it's recorded as an ordinary command. The list carries IDs and fixed labels, not the menu's item names: naming an object can mark it seen, which would change the game and break replays.
  - **Labels:** short verbs with the key in small type, as "Go down >", like the menu bar's keys. An action just appears when it applies, without a pulse.
  - **Showing it:** View > Show Toolbar, on by default and remembered. Toolbar modes showing more or fewer buttons, icons or text may come later; for now there's this one.
  - Also listed under Later in `docs/tablet-support.md`.
- [ ] **Alerts for dangerous messages,** such as stoning, sliming, illness and lycanthropy ("You feel feverish"): coloured, and kept in view until dealt with. Effort M, benefit high.
  - Most of the work is a curated list of message patterns. Hallucination changes some wording.
- [ ] **A sign that the game is waiting for a map position,** and Esc there. Effort M, benefit medium.
  - Needs the core to tell the front end; batch with the next item into one core update.
- [ ] **Remembered squares drawn differently from what's in view,** such as dimmed. Effort M, benefit medium.
  - Probably needs a "seen now" flag per glyph from the core.
- [ ] **Contextual hints,** dismissible, the first time something comes up: entering a shop, a fountain or altar, first Burdened or Hungry. Effort M–L, benefit high.
  - Triggered from messages, status and room type. A cheaper route to much of what a tutorial would teach.
- [ ] **Explain cryptic messages on hover.** Effort M, benefit low to medium. After the alerts, reusing their patterns.
- [ ] **A first-game tutorial.** Effort L, benefit high. Needs a design first: a scripted level, or overlays on a real game.
- [ ] **A settings panel** of common toggles that writes to the options file. Effort M (a full settings screen is L), benefit medium.
  - Goes against `docs/cocoa-parity.md`'s decision of a raw `.nethackrc` editor, so needs deciding again.
- [ ] **A count before a command by touch** (`n20s`). Effort M, benefit low. "Search 20" and rest buttons on the toolbar cover the common cases.
- [ ] **The `number_pad` default.** Effort S, benefit low. Arrow keys already move.

## Already done

Found while drawing up this list:

- **Autopickup is off by default.** The core's default is `Off` (`nethack/include/optlist.h`), and the options file only suggests turning it on.
- **Actions from an item.** Clicking an inventory item at the command prompt sends `i` and its letter, which opens the core's `itemactions()` menu of what can be done with it.
