import { expect, test } from "vitest";
import { messageLook, pinnedMessage, referencesHero } from "../../src/port/messages";

test("a message mentions the hero when its first 'you' is the word you or your", () => {
  expect(referencesHero("You see here a dagger.")).toBe(true);
  expect(referencesHero("The newt bites you!")).toBe(true);
  expect(referencesHero("Your sword glows blue.")).toBe(true);
  expect(referencesHero("You.")).toBe(true);
  expect(referencesHero("The jackal misses.")).toBe(false);
  expect(referencesHero("You feel like yourself again.")).toBe(true);
  // only the first 'you' counts, as in Cocoa
  expect(referencesHero("Bayou water. You drink it.")).toBe(false);
  expect(referencesHero("Yourself!")).toBe(false);
  expect(referencesHero("Youth fountain.")).toBe(false);
  expect(referencesHero("YOU DIE")).toBe(true);
});

test("a message's attribute picks its look, and a plain one about the hero stands out", () => {
  expect(messageLook("You hit it.", 0)).toBe("hero");
  expect(messageLook("It hits.", 0)).toBeNull();
  expect(messageLook("Really attack?", 1)).toBe("bold");
  expect(messageLook("x", 2)).toBe("underline");
  expect(messageLook("x", 4)).toBe("underline");
  expect(messageLook("x", 5)).toBe("inverse");
  expect(messageLook("x", 7)).toBe("inverse");
  expect(messageLook("x", 3)).toBeNull();
  // the urgent and no-history flags don't change it
  expect(messageLook("You die...", 16)).toBe("hero");
  expect(messageLook("x", 1 | 32)).toBe("bold");
});

test("the newest urgent message is kept in view until two later turns' messages follow it, or it's let go", () => {
  const urgent = (id: number) => ({ id, attr: 16 });
  const plain = (id: number) => ({ id, attr: 0 });
  const turn = (id: number) => ({ id, attr: 0, separator: true });
  expect(pinnedMessage([plain(1), urgent(2), plain(3)], 0)).toBe(2);
  expect(pinnedMessage([urgent(1), turn(2), plain(3)], 0)).toBe(1);
  expect(pinnedMessage([urgent(1), turn(2), plain(3), turn(4), plain(5)], 0)).toBeNull();
  // only the newest, so they never stack
  expect(pinnedMessage([urgent(1), urgent(2)], 0)).toBe(2);
  expect(pinnedMessage([urgent(1), urgent(2)], 2)).toBeNull();
  expect(pinnedMessage([plain(1)], 0)).toBeNull();
});
