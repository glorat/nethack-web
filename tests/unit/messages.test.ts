import { expect, test } from "vitest";
import { isPinned, messageLook, referencesHero } from "../../src/port/messages";

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

test("an urgent message is kept in view until the player has acted twice since, or lets it go", () => {
  const urgent = { id: 7, attr: 16, batch: 3 };
  expect(isPinned(urgent, 3, -1)).toBe(true);
  expect(isPinned(urgent, 4, -1)).toBe(true);
  expect(isPinned(urgent, 5, -1)).toBe(false);
  expect(isPinned(urgent, 3, 7)).toBe(false);
  // a later urgent message is still kept after an earlier one is let go
  expect(isPinned({ ...urgent, id: 9 }, 3, 7)).toBe(true);
  expect(isPinned({ ...urgent, attr: 0 }, 3, -1)).toBe(false);
});
