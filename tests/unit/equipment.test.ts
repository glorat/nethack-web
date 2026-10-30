import { expect, test } from "vitest";
import { equipmentTip } from "../../src/port/equipment";

test("an equipment tooltip shows the item's letter, and drops (being worn) as Cocoa does", () => {
  expect(equipmentTip("armor", "c", "an uncursed +1 small shield (being worn)")).toBe("(c) an uncursed +1 small shield");
  expect(equipmentTip("weapon", "a", "a +1 long sword (weapon in hand)")).toBe("(a) a +1 long sword (weapon in hand)");
  expect(equipmentTip("cloak", "", undefined)).toBe("cloak");
});
