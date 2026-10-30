import { expect, test } from "vitest";
import core from "../../nethack/dat/license?raw";
import repo from "../../LICENSE?raw";
import served from "../../public/license.txt?raw";
import thirdParty from "../../public/third-party-licenses.txt?raw";

test("the licence the site and this repository carry is the core's", () => {
  expect(served).toBe(core);
  expect(repo).toBe(core);
});

test("the third-party notices keep each project's copyright", () => {
  for (const notice of ["Lua.org, PUC-Rio", "Jason Miller", "Emscripten authors", "Rich Felker", "GNU GENERAL PUBLIC LICENSE"]) expect(thirdParty).toContain(notice);
});
