# Newcomer UX

What still makes it hard for a new player to command the hero and follow what's happening, as opposed to how to play well, and that the front end can fix without changing the game's rules or showing what the game hides.

Effort: S under a day, M a few days, L a week or more. Benefit is to a new player. Both are rough guesses, to be revised as items are looked into. Ordered by priority.

## To do

- [x] **Explain status badges and AC.** A tooltip on each badge saying what the condition means and how urgent it is, and on AC that lower is better. Effort S, benefit high. Decided: do it.
  - The labels and severities are already in `src/ui/StatsView.tsx` and `src/port/badges.ts`; this adds a short explanation each.
  - Wording answers the player's question ("You're turning to stone. Fix it now or you die."), not how the game works.
- [ ] **An on-screen Esc button** for dialogs and prompts waiting for a key. Effort S, benefit medium.
  - Also an open item in `docs/tablet-support.md`. Map position prompts wait on the item below.
- [ ] **Quick-action toolbar:** search, rest, pick up, up and down stairs, travel to the stairs. Effort M, benefit high.
  - The commands are already in the menu bar; the work is the layout and the choice of buttons.
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
