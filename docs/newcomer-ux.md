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
- [x] **A badge pulses as it appears,** each time its status starts, to draw the eye and invite a click. Stronger for worse badges; a still highlight with reduced motion. Effort S, benefit medium. Decided: do it, in place of opening the popover the first time a badge appears, which would interrupt.
- [x] **An on-screen Esc button.** Effort S, benefit medium. Decided as in `docs/tablet-support.md`.
- [x] **Quick-action toolbar** of what you can do where you stand. Effort M, benefit high. Decided, as designed below.
  - **Where:** a floating group at the map's bottom-left, mirroring the zoom buttons at the bottom-right, so on a tablet actions are under the left thumb and zoom under the right.
  - **What:** the actions the core's here-menu (`there_cmd_menu_self`, clicking your own square) finds for your square, such as go up or down, drink, sit, sacrifice, pick up, loot, tip, eat, dismount and disarm, plus Search, Rest and Cast (when you know a spell) always. Not the here-menu's Inventory, Drop and Look Here, which the sidebar and right-click already cover, nor actions on the squares next to you, which need a direction.
  - **From the core:** a fork change that lists those actions each turn without opening a menu, and `#hereaction`, which runs one by its name as picking it from the here-menu does, so it's recorded as an ordinary command with the name as its answer. The list carries fixed names, not the menu's item names: naming an object can mark it seen, which would change the game and break replays.
  - **Labels:** short verbs with the key in small type, as "Go down >", like the menu bar's keys. An action just appears when it applies, without a pulse.
  - **Showing it:** View > Show Toolbar, on by default and remembered. Toolbar modes showing more or fewer buttons, icons or text may come later; for now there's this one.
  - Also listed under Later in `docs/tablet-support.md`.
- [x] **Game Settings:** choices for the most common settings beside the options file, in one dialog (Game > Game Settings…, and on the home page). Effort M, benefit medium. Decided:
  - The file is the only place settings are kept. A choice rewrites its option where the file sets it, or adds a line at the end, and shows in the file as it changes; editing the file changes the choices. An option written in a way no choice matches shows as written.
  - Tutorial and Move with (`number_pad`) only, for now; more can be added to `src/port/game-settings.ts`.
  - OK has a core of its own, loaded on the page and then dropped, read the file as a new game would (`nhweb_check_config`, a call that returns the problems), and the file isn't kept while it finds anything wrong, listed by line.
  - The site's own settings, such as text size and tiles, stay on the View menu.
- [ ] **Alerts for dangerous messages,** such as stoning, sliming, illness and lycanthropy ("You feel feverish"): coloured, and kept in view until dealt with. Effort M, benefit high. Decided:
  - [x] The badges already keep most of these dangers in view. Messages the core marks urgent (`urgent_pline`, which tty and curses never let a player skip) have a yellow edge, and stay at the top of the message panel as newer ones scroll past, until the player has acted twice or clicks one. The core chooses them, so there's no list of patterns to keep, and hallucination doesn't matter.
  - [ ] A Lycanthropy badge, from the core, as nothing else shows it after "You feel feverish".
- [ ] **A sign that the game is waiting for a map position.** Effort M, benefit medium.
  - The Cancel button already shows then, but for any key the core waits for outside a command; telling a map position apart needs the core's `program_state.input_state` (`getposInp`). Batch with the next item into one core update.
- [ ] **Remembered squares drawn differently from what's in view,** such as dimmed. Effort M, benefit medium.
  - Probably needs a "seen now" flag per glyph from the core.
- [x] **Hints the first time a place comes up.** Effort M, benefit high. Decided:
  - A "?" beside what the hint is about, pulsing every few seconds until opened, opens it in the badges' popover: on the level line at the top of the dungeon (the goal: go down) and in the Gnomish Mines and Sokoban, on the toolbar's Sacrifice (altar) and Dip (fountain), and on a shopkeeper's welcome in the messages. Chosen over a card by the messages, a dialog or a hints log, as the badges already pulse rather than interrupt. A card is the fallback if testers miss the pulses.
  - It stays until opened once, remembered per device. View > Hide Hints and Reset Hints. None in a replay or after the game ends.
  - Hungry and Burdened need none: their badges already explain them. The texts and triggers are in `src/port/hints.ts`.
  - The toolbar leaves out Go up where it would leave the dungeon and end the game. The menus and `<` still offer it.
- [x] **"No, and don't ask again" for the tutorial.** The core asks about its tutorial at every new game unless the options file sets `tutorial`. Effort S–M, benefit medium. Decided:
  - A third choice, `d`, in the fork's core (web build only), recorded by its text like the others; `y` and `n` keep their text, so old recordings replay. The note under the choices says it can be changed in Game Settings rather than how to edit the file.
  - Choosing it has the core tell the page (`NHWEB_EVENT_OPTION`), which keeps `OPTIONS=!tutorial` in the options file, where Game Settings shows Never. Not in replays.
  - The tutorial plays through on the site (checked by hand); a headless test enters it and leaves by its first portal. A recording of a full playthrough could become a replay fixture later.
- [x] **Something to choose a character by.** Effort S, benefit medium. Decided: the character picker shows the Guidebook's own paragraph on the chosen role and race (read from the core's `doc/Guidebook.mn` as the page is built, in `vite.config.ts`), beside the lists or below them on a narrow screen, with the role's tile at 96px above it where it sits beside them. No beginner's recommendation, as that's advice on playing well. Every role can be picked; see `docs/cocoa-parity.md`.
- [x] **Forcing a locked box.** Effort S, benefit medium. Decided: the default options add `force` to `autounlock` (`src/port/options.ts`), so looting a locked box asks to force it with the wielded weapon; a player's own `autounlock` line replaces it.
- [ ] **A count before a command by touch** (`n20s`). Effort M, benefit low. "Search 20" and rest buttons on the toolbar cover the common cases.
- [ ] **The `number_pad` default.** Effort S, benefit low. The arrows and the numeric keypad already move whichever way it is set, through the core's own direction keys, as in Cocoa.

## Already done

Found while drawing up this list:

- **Autopickup is off by default.** The core's default is `Off` (`nethack/include/optlist.h`), and the options file only suggests turning it on.
- **Actions from an item.** Clicking an inventory item at the command prompt sends `i` and its letter, which opens the core's `itemactions()` menu of what can be done with it.
