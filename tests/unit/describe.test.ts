import { expect, test } from "vitest";
import { tooltipText, wikiTerm, wikiUrl } from "../../src/port/describe";

test("a tooltip keeps what farlook says is actually there", () => {
  expect(tooltipText("d        a dog or other canine (tame little dog)")).toBe("tame little dog");
  expect(tooltipText("@        a human or elf (human valkyrie called Tester)")).toBe("human valkyrie called Tester");
  expect(tooltipText("         can be many things (unexplored area)")).toBe("unexplored area");
});

test("a tooltip keeps text after the parentheses, and text without any", () => {
  expect(tooltipText("@        a human (peaceful watchman) [seen: normal vision]")).toBe("peaceful watchman [seen: normal vision]");
  expect(tooltipText("#        a tree")).toBe("a tree");
});

test("the wiki is searched for the thing's name alone", () => {
  expect(wikiTerm("d        a dog or other canine (tame little dog)")).toBe("little dog");
  expect(wikiTerm("@        a human (peaceful watchman) [seen: normal vision]")).toBe("watchman");
  expect(wikiTerm("#        a tree")).toBe("tree");
  expect(wikiTerm("I        remembered, unseen, creature (an invisible stalker)")).toBe("stalker");
});

test("a wiki search URL encodes the term", () => {
  expect(wikiUrl("potion of see invisible")).toBe("https://nethackwiki.com/mediawiki/index.php?search=potion%20of%20see%20invisible");
});

test("the words left out of a wiki search are matched in any case", () => {
  expect(wikiTerm("         The Oracle")).toBe("Oracle");
});
