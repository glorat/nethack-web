// How bad a status badge is, as Cocoa grades hunger, encumbrance and the core's condition groups,
// and what each badge means to the player.

export type Severity = "info" | "caution" | "warning" | "danger";

const HUNGER: Record<string, Severity> = { Satiated: "info", Hungry: "caution", Weak: "warning" };
const ENCUMBRANCE: Record<string, Severity> = { Burdened: "caution", Stressed: "warning" };

// the core's major_troubles, minor_troubles and movement condition groups
const MAJOR_TROUBLES = new Set(["FOODPOIS", "GRAB", "INLAVA", "SLIME", "STONE", "STRNGL", "TERMILL"]);
const MINOR_TROUBLES = new Set(["BLIND", "CONF", "DEAF", "HALLU", "PARLYZ", "SUBMERGED", "STUN"]);
const MOVEMENT = new Set(["LEV", "FLY", "RIDE"]);

const CONDITION_LABELS: Record<string, string> = {
  BAREH: "Bare-handed", BLIND: "Blind", BUSY: "Busy", CONF: "Confused", DEAF: "Deaf",
  ELF_IRON: "Iron", FLY: "Flying", FOODPOIS: "Food poisoned", GLOWHANDS: "Glowing hands",
  GRAB: "Grabbed", HALLU: "Hallucinating", HELD: "Held", ICY: "Icy", INLAVA: "In lava",
  LEV: "Levitating", PARLYZ: "Paralyzed", RIDE: "Riding", SLEEPING: "Asleep", SLIME: "Slimed",
  SLIPPERY: "Slippery", STONE: "Stoning", STRNGL: "Strangled", STUN: "Stunned",
  SUBMERGED: "Underwater", TERMILL: "Ill", TETHERED: "Tethered", TRAPPED: "Trapped",
  UNCONSC: "Unconscious", WOUNDEDL: "Wounded legs", HOLDING: "Holding",
};

const HUNGER_TIPS: Record<string, string> = {
  Satiated: "You're full. Eating much more could make you choke.",
  Hungry: "You're hungry. Eat something soon.",
  Weak: "You're weak from hunger, and your Strength is down. Eat now, or pray if you have no food.",
  Fainting: "You're starving and passing out. Eat right away, or pray if you have no food, or you'll starve to death.",
  Fainted: "You're starving and passing out. Eat right away, or pray if you have no food, or you'll starve to death.",
  Starved: "You starved to death.",
};

const ENCUMBRANCE_TIPS: Record<string, string> = {
  Burdened: "You're carrying a lot, so you move more slowly. Drop something to speed up.",
  Stressed:
    "You're carrying too much: you're slow, can't go upstairs, don't heal while you move, and can't move at all when badly hurt. Drop something.",
  Strained:
    "You're carrying far too much: you're very slow, can't go upstairs, moving and fighting hurt you, and you can't move at all when badly hurt. Drop things.",
  Overtaxed: "You can barely move under all you carry, and can't fight, pick things up, eat, read or cast spells. Drop things now.",
  Overloaded: "You can't move under all you carry. Drop things now.",
};

const PRAY_OR_UNICORN = "Praying can save you, and so can applying a unicorn horn that isn't cursed, perhaps more than once.";

const CONDITION_TIPS: Record<string, string> = {
  BAREH: "You aren't wielding anything, so you fight with your hands.",
  BLIND: "You can't see. The map shows only what you remember, feel or sense.",
  BUSY: "You're in the middle of something that takes several turns.",
  CONF: "You're confused: you may stumble the wrong way, and scrolls and spells may not do what you expect.",
  DEAF: "You can't hear, so you'll miss noises and anything said to you.",
  ELF_IRON: "Iron is hurting you.",
  FLY: "You're flying, so you can cross water and lava.",
  FOODPOIS: `You have food poisoning and will die soon unless you're cured. ${PRAY_OR_UNICORN}`,
  GLOWHANDS: "Your hands are glowing: the next monster you hit will be confused.",
  GRAB: "A sea monster has hold of you and can drown you. Get free or kill it fast.",
  HALLU: "You're hallucinating: monsters and objects look like random things, so you can't trust what you see.",
  HELD: "Something is holding you or has swallowed you, so you can't get away from it.",
  HOLDING: "You're holding onto a monster, so it can't get away.",
  ICY: "You're on ice and may slip as you move.",
  INLAVA: "You're sinking into lava and will burn to death. Get out now.",
  LEV: "You're floating, so you can't reach the floor: you can't pick things up or go down stairs.",
  PARLYZ: "You can't move or act until this wears off.",
  RIDE: "You're riding, so you move at your steed's speed.",
  SLEEPING: "You're asleep and can't act until you wake.",
  SLIME:
    "You're turning into green slime and will die in a few turns unless you're cured. Burning it off, such as by zapping fire at yourself or reading a scroll of fire, or praying can save you.",
  SLIPPERY: "Your fingers are slippery, so you'll drop the weapon you hold, and rings may slide off bare hands. It wears off.",
  STONE:
    "You're turning to stone and will die in a few turns. Eating a lizard or acidic corpse, drinking acid, or praying can save you.",
  STRNGL: "You're being strangled and will die in a few turns. If it's your amulet, take it off; otherwise pray.",
  STUN: "You're stunned, so you'll stagger in random directions and can't cast spells.",
  SUBMERGED: "You're underwater, so you can't see far.",
  TERMILL: `You have a deadly illness and will die soon unless you're cured. ${PRAY_OR_UNICORN}`,
  TETHERED: "You're chained to a buried ball, so you can't move far until you're free.",
  TRAPPED: "You're stuck in a trap. Keep trying to move to get out.",
  UNCONSC: "You've passed out and can't act until you come to.",
  WOUNDEDL: "Your legs are hurt: you can't kick, and you can carry less until they heal.",
};

/** What each stat in the status panel means, by the core's field name. */
export const STAT_TIPS = {
  BL_HP: "Hit points: your health. It comes back over time, and if it reaches 0, you die.",
  BL_ENE: "Power: what casting spells uses up. It comes back over time.",
  BL_STR: "Strength: how hard and how often you hit, and how much you can carry.",
  BL_DX: "Dexterity: how often you hit, up close or when throwing.",
  BL_CO: "Constitution: how fast your health comes back, how much you gain as you level up, and how much you can carry.",
  BL_IN: "Intelligence: whether you can learn spells from books safely, and for some roles how well you cast them.",
  BL_WI: "Wisdom: how much power you gain as you level up, how fast it comes back, and for some roles how well you cast.",
  BL_CH: "Charisma: what shopkeepers charge you.",
  BL_AC: "Armor Class: how hard you are to hit. Lower is better.",
  BL_XP: "Experience level: it goes up as you defeat monsters, bringing more health and power.",
  BL_HD: "Your level in the form you've taken. Your own level comes back when you change back.",
  BL_GOLD: "The gold you're carrying.",
  BL_EXP: "Experience points: earn enough and your experience level goes up.",
  BL_TIME: "Turns played so far.",
  BL_SCORE: "Your score so far.",
} as const satisfies Record<string, string>;

export type StatName = keyof typeof STAT_TIPS;

/** Fainting, Fainted and Starved are dangerous. */
export function hungerSeverity(text: string): Severity {
  return HUNGER[text.trim()] ?? "danger";
}

/** Strained and worse are dangerous. */
export function encumbranceSeverity(text: string): Severity {
  return ENCUMBRANCE[text.trim()] ?? "danger";
}

/** `condition` is a BL_MASK_ name without the prefix, such as "STUN". */
export function conditionSeverity(condition: string): Severity {
  if (MAJOR_TROUBLES.has(condition)) return "danger";
  if (MINOR_TROUBLES.has(condition)) return "warning";
  if (MOVEMENT.has(condition)) return "info";
  return "caution";
}

export interface Badge {
  label: string;
  severity: Severity;
  tip?: string;
}

/** Hunger first, then encumbrance, then the conditions in the core's order. */
export function statusBadges(conditions: string[], hunger: string, encumbrance: string): Badge[] {
  const badges = conditions.map(
    (c): Badge => ({ label: CONDITION_LABELS[c] ?? c, severity: conditionSeverity(c), tip: CONDITION_TIPS[c] }),
  );
  const cap = encumbrance.trim();
  if (cap) badges.unshift({ label: cap, severity: encumbranceSeverity(cap), tip: ENCUMBRANCE_TIPS[cap] });
  const hu = hunger.trim();
  if (hu) badges.unshift({ label: hu, severity: hungerSeverity(hu), tip: HUNGER_TIPS[hu] });
  return badges;
}
