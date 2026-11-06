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

/** The options the game sets, after the player's file. */
export const BASE_OPTIONS = "perm_invent,!autopickup,menucolors,time,showexp,hilite_pet,hilite_pile,force_invmenu";

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

const OPTIONS_LINE = /^(\s*OPTIONS\s*=)(.*)$/i;

/** Whether an option as written, such as "!number_pad" or "number_pad:3", sets `name`. */
function sets(option: string, name: string): boolean {
  const written = option.split(/[:=]/)[0].trim().toLowerCase();
  return written === name || written === `!${name}` || written === `no${name}`;
}

/** How the file's OPTIONS lines set `name`, as written, in order: none if it's left to the game. */
export function optionSettings(file: string, name: string): string[] {
  return file.split("\n").flatMap((line) => {
    const m = OPTIONS_LINE.exec(line);
    return m ? m[2].split(",").map((option) => option.trim()).filter((option) => sets(option, name)) : [];
  });
}

/**
 * The file with `name` set as `option`, or left to the game if null: changed where the file already sets it,
 * any other settings of it dropped, or else added on a line at the end. The rest of the file is kept as it was.
 */
export function withOption(file: string, name: string, option: string | null): string {
  let placed = option === null;
  const lines = file.split("\n").flatMap((line) => {
    const m = OPTIONS_LINE.exec(line);
    if (!m) return [line];
    const parts = m[2].split(",");
    if (!parts.some((part) => sets(part, name))) return [line];
    const kept = parts.flatMap((part) => {
      if (!sets(part, name)) return [part];
      if (placed) return [];
      placed = true;
      return [`${/^\s*/.exec(part)![0]}${option}`];
    });
    return kept.length ? [`${m[1]}${kept.join(",")}`] : [];
  });
  const text = lines.join("\n");
  return placed ? text : `${text === "" ? "" : text.replace(/\n?$/, "\n")}OPTIONS=${option}\n`;
}

/** The file with an option as written, such as "!tutorial" or "number_pad:1", kept as withOption keeps it. */
export function keptOption(file: string, option: string): string {
  return withOption(file, option.split(/[:=]/)[0].trim().replace(/^!/, "").toLowerCase(), option);
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
