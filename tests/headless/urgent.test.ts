import { expect, test } from "vitest";
import { Session } from "./harness";

test("a warning the core marks urgent reaches the page marked so", async () => {
  const g = await (await Session.start({ wizard: true, character: "role:Valkyrie,race:human,gender:female,align:neutral" })).skipText();
  await g.send("\x17");
  await g.getlin("cursed amulet of strangulation");
  await g.skipText();
  const amulet = g.state.inventory.find((i) => /amulet/.test(i.text))!;
  await g.send("P");
  await g.yn(amulet.accelerator);
  await g.skipText();
  for (const k of "lhlh") await (await g.send(k)).skipText();
  const attr = (text: string) => g.state.messages.find((m) => m.text === text)?.attr;
  expect(attr("You're gasping for air.")).toBe(16);
  expect(attr("You swap places with your little dog.")).toBe(0);
});
