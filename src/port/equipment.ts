// An equipment slot's tooltip, worded as Cocoa's EquipmentView words it.

/** "(a) a +1 long sword (weapon in hand)" for an item, without "(being worn)", which every slot would say; else the slot's name. */
export function equipmentTip(slot: string, letter: string, text: string | undefined): string {
  if (!letter || !text) return slot;
  return `(${letter}) ${text.replace(/ \(being worn\)$/, "")}`;
}
