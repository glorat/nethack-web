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
