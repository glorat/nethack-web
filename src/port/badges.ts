// How bad a status badge is, as Cocoa grades hunger, encumbrance and the core's condition groups.

export type Severity = "info" | "caution" | "warning" | "danger";

const HUNGER: Record<string, Severity> = { Satiated: "info", Hungry: "caution", Weak: "warning" };
const ENCUMBRANCE: Record<string, Severity> = { Burdened: "caution", Stressed: "warning" };

// the core's major_troubles, minor_troubles and movement condition groups
const MAJOR_TROUBLES = new Set(["FOODPOIS", "GRAB", "INLAVA", "SLIME", "STONE", "STRNGL", "TERMILL"]);
const MINOR_TROUBLES = new Set(["BLIND", "CONF", "DEAF", "HALLU", "PARLYZ", "SUBMERGED", "STUN"]);
const MOVEMENT = new Set(["LEV", "FLY", "RIDE"]);

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
