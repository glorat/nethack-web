import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { BASE_OPTIONS, configFile, OPTIONS_TEMPLATE } from "../../src/port/options";
import { checkConfig, configProblems, type CreateModule } from "../../src/config-check";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

async function check(config: string) {
  const { default: createModule } = (await import(pathToFileURL(resolve(ROOT, "public/nethack.js")).href)) as { default: CreateModule };
  return checkConfig(createModule, { wasmBinary: readFileSync(resolve(ROOT, "public/nethack.wasm")) }, config);
}

test("the core finds nothing wrong with the template, with the game's own options after it", async () => {
  expect(await check(configFile(BASE_OPTIONS, OPTIONS_TEMPLATE))).toEqual([]);
});

test("the core says which lines are wrong and why", async () => {
  const file = "# mine\nOPTIONS=number_pad:1\nOPTIONS=bogusopt\nOPTIONS=number_pad:7\nFOO=bar\n";
  expect(await check(configFile(BASE_OPTIONS, file))).toEqual([
    { line: 3, message: "Unknown option 'bogusopt'." },
    { line: 4, message: "compound option specified multiple times: number_pad." },
    { line: 4, message: "Illegal number_pad parameter '7'." },
    { line: 5, message: "Unknown config statement." },
  ]);
});

test("a message the core ends with a full stop isn't given a second, and one with no line has none", async () => {
  expect((await check("OPTIONS=!number_pad:1\n"))[0].message).toMatch(/negated\.$/);
  expect(configProblems("0\tSomething's wrong\n")).toEqual([{ line: null, message: "Something's wrong." }]);
});
