/** The options the bot plays with. */
export const BOT_OPTIONS = [
  "autopickup",
  "pickup_types:$?!/",
  "pickup_burden:unencumbered",
  "mention_walls",
  "!cmdassist",
  "!legacy",
  "showexp",
  "showscore",
  "time",
  "runmode:teleport",
  // options 5.0 added or changed, set as 3.6 played: AutoAscend handles locks itself, searches beside
  // monsters, and walks into water it means to
  "autounlock:none",
  "!safe_wait",
  "paranoid_confirmation:pray",
].join(",");
