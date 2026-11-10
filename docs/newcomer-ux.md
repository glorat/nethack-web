# Newcomer UX

What was decided to help a new player command the hero and follow what's happening, and why. The front end doesn't change the game's rules, give advice on playing well, or show what the game doesn't keep in view itself.

## Decisions

- **Status badges and stats** open a popover with what each means and a NetHack Wiki link, by click or tap only: a toggletip, as accessibility guidance has it for tips that hold a link. A hover tooltip read as a duplicate of it. A badge pulses as it appears, rather than opening the popover, which would interrupt. The wording answers the player's question, not how the game works.
  - If players can't find the popovers: a one-shot help mode (press ?, then click anything) opening the same popover. If testers want hover back: a hover card that can be moved into, like Wikipedia's link previews.
- **Quick-action toolbar,** at the map's bottom-left opposite the zoom buttons, for the thumbs on a tablet. It lists the core's here-menu actions for your own square (`there_cmd_menu_self`), plus Search, Rest and Cast; not Inventory, Drop and Look Here, which the sidebar and right-click cover, nor actions on the squares next to you, which need a direction.
  - The core lists them by fixed names, run by `#hereaction`, never by the menu's item names: naming an object can mark it seen, which would change the game and break replays.
  - It leaves out Go up where that would leave the dungeon and end the game.
- **Game Settings:** the options file is the only place settings are kept; a choice rewrites its line there, and an option written in a way no choice matches shows as written. The site's own settings stay on the View menu.
- **Hints the first time a place comes up:** a pulsing "?" beside what the hint is about, opening the badges' popover, chosen over a card by the messages, a dialog or a hints log. A card is the fallback if testers miss the pulses. Hungry and Burdened need none, as their badges explain them.
- **The tutorial's "don't ask again"** is a third answer, `d`, recorded by its text; `y` and `n` keep theirs, so old recordings replay.
- **The character picker** shows the Guidebook's paragraph on the chosen role and race, with no beginner's recommendation, as that's advice on playing well.
- **Forcing a locked box:** the default options add `force` to `autounlock`; a player's own `autounlock` line replaces it.
- **Urgent messages:** those the core marks urgent (`urgent_pline`, which tty and curses never let a player skip) have a yellow edge, and the newest stays at the top of the message panel until two later turns' messages follow it or the player clicks it. The core chooses them, so there's no list of patterns to keep, and hallucination doesn't matter. Counting by the turn lines in the log makes a replay or a restored game show the same.
  - No badge for lycanthropy: the core's status line doesn't keep it in view.

## Dropped

- **Remembered squares drawn differently:** the core's `dark_room`, on by default, already dims remembered room floors, and `lit_corridor` makes no visible difference in ASCII or the painted tiles; more wasn't worth a core change.
- **A sign that the game wants a map position:** the Cancel button already shows then.
- **A count before a command by touch** (`n20s`): the toolbar's Search and Rest cover the common cases.
- **Explaining cryptic messages on hover:** it was to reuse the alerts' list of message patterns, which the core's urgent mark made unnecessary.
- **Changing the `number_pad` default:** the arrows and numeric keypad move either way, through the core's own direction keys.
