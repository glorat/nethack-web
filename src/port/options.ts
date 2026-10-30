// The player's options file (.nethackrc), kept in the browser, and the one the game reads.

export const OPTIONS_TEMPLATE = `# NetHack options. Lines starting with # are ignored.
# Changes take effect when you start a new game. A saved game keeps
# most of its own options; change those with Game > Options instead,
# which also lists every option and its current value.
#
# The game already shows the turn count and experience points, colors
# menus, and marks your pet and item piles, so those needn't be set here.
#
# Some options players often change; remove the # to use one:
#OPTIONS=autodig
#OPTIONS=autopickup,pickup_types:$?!/="+
#OPTIONS=number_pad:1
#OPTIONS=paranoid_confirmation:pray wand-break
#OPTIONS=sortloot:full
#OPTIONS=fruit:slime mold
`;

// the menu colors the core adds for the web front end, which #saveoptions writes out with the player's
const DEFAULT_MENU_COLORS = [
  'MENUCOLOR=" blessed "=green',
  'MENUCOLOR=" holy water"=green',
  'MENUCOLOR=" cursed "=red',
  'MENUCOLOR=" unholy water"=red',
];

/**
 * A file #saveoptions wrote, made the player's again:
 * - the core's own menu colors, the name and ascii_map are the game's to add, not the player's;
 * - the game's options (`base`) it sets as the game does are left to the game, so changes to them still reach the player;
 * - the core writes only what differs from its defaults, from which each of the game's options differs, so one it
 *   leaves out is one the player turned back: that is written out, or the game's would come back next time.
 */
export function savedOptionsFile(text: string, base: string): string {
  const baseOptions = base.split(",").filter(Boolean);
  const written = new Set<string>();
  const lines = text.split("\n").flatMap((line) => {
    if (DEFAULT_MENU_COLORS.includes(line.trim())) return [];
    const m = /^\s*OPTIONS\s*=(.*)$/i.exec(line);
    if (!m) return [line];
    const kept = m[1].split(",").filter((option) => {
      const token = option.trim();
      const name = token.split(":")[0].replace(/^!/, "").toLowerCase();
      written.add(name);
      return name !== "name" && name !== "ascii_map" && !baseOptions.includes(token);
    });
    return kept.length ? [`OPTIONS=${kept.join(",")}`] : [];
  });
  const turnedBack = baseOptions
    .filter((option) => !option.includes(":") && !written.has(option.replace(/^!/, "").toLowerCase()))
    .map((option) => (option.startsWith("!") ? option.slice(1) : `!${option}`));
  return turnedBack.length ? `${lines.join("\n").replace(/\n*$/, "\n")}OPTIONS=${turnedBack.join(",")}\n` : lines.join("\n");
}

/** The names of the options a file's OPTIONS lines set, without "!" or "no". */
export function optionNames(file: string): Set<string> {
  const names = new Set<string>();
  for (const line of file.split("\n")) {
    const m = /^\s*OPTIONS\s*=(.*)$/i.exec(line);
    if (!m) continue;
    for (const option of m[1].split(",")) {
      const name = option.split(":")[0].trim().replace(/^!/, "").toLowerCase();
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * The player's file with the game's own options added after it, but only those the player doesn't set:
 * an option set twice in a file is an error, and the player's choice wins.
 */
export function configFile(base: string, player: string): string {
  const set = optionNames(player);
  const left = base.split(",").filter((option) => {
    const name = option.split(":")[0].replace(/^!/, "").toLowerCase();
    return !set.has(name) && !set.has(`no${name}`);
  });
  return left.length ? `${player.replace(/\n?$/, "\n")}OPTIONS=${left.join(",")}\n` : player;
}

export const OPTIONS_KEY = "nethack.options";

export function savedOptions(): string {
  try {
    return localStorage.getItem(OPTIONS_KEY) ?? OPTIONS_TEMPLATE;
  } catch {
    return OPTIONS_TEMPLATE;
  }
}

/** False if the browser wouldn't keep it. */
export function saveOptions(text: string): boolean {
  try {
    localStorage.setItem(OPTIONS_KEY, text);
    return true;
  } catch {
    return false;
  }
}
