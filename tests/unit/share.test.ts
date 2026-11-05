import { describe, expect, test } from "vitest";
import { shortId } from "../../src/online/game-id";
import { ending, type PublicGame, shareAddress, sharePage, title } from "../../src/online/share";

const GAME = "3f9c2a7e-5b1d-4c8e-9a62-7d0e4b81c3f5";
const died: PublicGame = {
  game: GAME,
  handle: "glorat",
  endedAt: Date.parse("2026-11-03T10:00:00Z"),
  result: { points: 48210, turns: 8412, role: "Val", race: "Hum", gender: "Fem", align: "Neu", death: "killed by a soldier ant", deathlev: 7, maxlvl: 9 },
};
const ascended: PublicGame = { ...died, result: { ...died.result, role: "Pri", race: "Elf", align: "Cha", death: "ascended", deathlev: -5, maxlvl: 50 } };

const meta = (html: string, key: string) => new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`).exec(html)?.[1];

test("a share link names the game by its short ID", () => {
  expect(shareAddress("https://nethack.app", GAME)).toBe(`https://nethack.app/g/${shortId(GAME)}`);
});

describe("the share page", () => {
  test("gives a death and an ascension their own title and sentence", () => {
    expect(title(died)).toBe("glorat's Valkyrie: 48,210 points");
    expect(ending(died)).toBe("Killed by a soldier ant on dungeon level 7 after 8,412 turns.");
    expect(title(ascended)).toBe("glorat ascended! Priestess, 48,210 points");
    expect(ending(ascended)).toBe("Ascended after 8,412 turns.");
    expect(title({ ...died, handle: null })).toBe("Anonymous's Valkyrie: 48,210 points");
  });

  test("carries the preview tags for the game, with its card", () => {
    const id = shortId(GAME);
    const html = sharePage("https://nethack.app", id, died);
    expect(meta(html, "og:title")).toBe("glorat&#39;s Valkyrie: 48,210 points");
    expect(meta(html, "og:description")).toBe(ending(died));
    expect(meta(html, "og:image")).toBe(`https://nethack.app/v1/games/${id}/card.png`);
    expect(meta(html, "og:url")).toBe(`https://nethack.app/g/${id}`);
    expect(meta(html, "theme-color")).toBe("#e5534b");
    expect(meta(html, "twitter:card")).toBe("summary_large_image");
    expect(meta(sharePage("https://nethack.app", id, ascended), "theme-color")).toBe("#e3b341");
    expect(html).toContain(`href="/online/watch/?game=${GAME}"`);
    expect(sharePage("https://nethack.app", id, null)).not.toContain("/online/watch/");
  });

  test("is the game's obituary: its journey, each moment linked to its replay, what it earned, and where it stands", () => {
    const story = {
      chronicle: [
        { turn: 1, line: 17, flags: 0x2, text: "glorat the lawful human Valkyrie entered the dungeon" },
        { turn: 242, line: 305, flags: 0x8000, text: "entered level 3, the Gnomish Mines" },
        { turn: 527, line: 914, flags: 0x4000, text: "killed by a <dwarf>" },
      ],
      achievements: [{ id: "entered-mines", name: "Into the Mines", description: "Entered the Gnomish Mines", turn: 242 }],
      standing: { place: 1, of: 5 },
    };
    const html = sharePage("https://nethack.app", shortId(GAME), died, story);
    expect(html).toContain(`<li class="kind-descent"><span class="turn">T242</span>`);
    expect(html).toContain(`href="/online/watch/?game=${GAME}&#38;line=914"`);
    expect(html).toContain("Killed by a &#60;dwarf&#62;");
    expect(html).not.toContain("<dwarf>");
    expect(html).toContain("<b>Into the Mines</b>");
    expect(html).toContain("<dd>#1 of 5</dd>");
    // the last moments start 30 turns before the end, and play on
    expect(html).toContain(`href="/online/watch/?game=${GAME}&#38;turn=${8412 - 30}&#38;play=1">Watch the last moments`);
    expect(html).toContain(`href="/online/watch/?game=${GAME}">Watch from the start`);
  });

  test("without a story, or for a short game, shows what it can", () => {
    const html = sharePage("https://nethack.app", GAME, { ...died, result: { ...died.result, turns: 12 } });
    expect(html).not.toContain("The journey");
    expect(html).not.toContain("Earned in this game");
    expect(html).not.toContain("Watch the last moments");
    expect(html).toContain(">Watch the game</a>");
  });

  test("never shows the character's name", () => {
    const html = sharePage("https://nethack.app", GAME, died);
    expect(html).toContain("glorat");
    expect(html).not.toMatch(/Agnes/);
  });

  test("escapes what the game wrote", () => {
    const html = sharePage("https://nethack.app", GAME, { ...died, result: { ...died.result, death: 'killed by a <script>"x"</script>' } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("<b>   killed by a    </b>|");
  });

  test("for a game it can't show, gives the site's own preview", () => {
    const html = sharePage("https://nethack.app", "whatever", null);
    expect(meta(html, "og:image")).toBe("https://nethack.app/social.jpg");
    expect(html).toContain("This game can't be shown");
  });

});
