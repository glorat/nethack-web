// Adds the constants in the core's include/monflag.h to nhdata.json.
// Usage: node monflag.mjs <monflag.h> <nhdata.json>
import { readFileSync, writeFileSync } from "node:fs";

const [header, dataPath] = process.argv.slice(2);
const text = readFileSync(header, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const values = {};
const pattern = /^\s*(?:#define\s+([A-Z][A-Z0-9_]*)\s+(.+?)|([A-Z][A-Z0-9_]*)\s*=\s*([^,\n]+),?)\s*$/gm;
for (const m of text.matchAll(pattern)) {
  const [name, expr] = m[1] ? [m[1], m[2]] : [m[3], m[4]];
  if (name.endsWith("_H")) continue;
  const cleaned = expr.trim().replace(/\b(0x[0-9A-Fa-f]+|\d+)[UL]+\b/g, "$1");
  // only numbers, names defined above, | & << and brackets
  if (!/^[\w\s|&<()x]+$/.test(cleaned)) throw new Error(`${name}: ${expr}`);
  const evaluated = cleaned.replace(/\b[A-Z][A-Z0-9_]*\b/g, (n) => {
    if (!(n in values)) throw new Error(`${name}: ${n} isn't defined above`);
    return String(values[n]);
  });
  values[name] = Function(`"use strict"; return (${evaluated});`)();
}
const data = JSON.parse(readFileSync(dataPath, "utf8"));
data.monflag = values;
writeFileSync(dataPath, JSON.stringify(data));
