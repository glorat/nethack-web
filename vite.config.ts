/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

function publicFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return publicFiles(path);
    return name === "README" || name.startsWith(".") ? [] : [path];
  });
}

/** Emits sw.js with a precache list of everything the built game loads. */
function serviceWorker(): Plugin {
  let publicDir = "";
  return {
    name: "nethack-service-worker",
    apply: "build",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const files = [
        "./",
        "./index.html",
        ...Object.keys(bundle).filter((f) => !f.endsWith(".map")).map((f) => `./${f}`),
        ...publicFiles(publicDir).map((f) => `./${relative(publicDir, f).split("\\").join("/")}`),
      ];
      const hash = createHash("sha256");
      for (const f of Object.values(bundle)) hash.update(f.type === "chunk" ? f.code : f.source);
      for (const f of publicFiles(publicDir)) hash.update(readFileSync(f));
      const source = readFileSync(new URL("./src/sw/sw.js", import.meta.url), "utf8");
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const PRECACHE = ${JSON.stringify([...new Set(files)])};\nconst VERSION = "${hash.digest("hex").slice(0, 12)}";\n${source}`,
      });
    },
  };
}

/** "5.0.0", from the core's patchlevel.h. */
function nethackVersion(): string {
  const header = readFileSync(new URL("./nethack/include/patchlevel.h", import.meta.url), "utf8");
  const level = (name: string) => header.match(new RegExp(`#define ${name} (\\d+)`))?.[1] ?? "0";
  return [level("VERSION_MAJOR"), level("VERSION_MINOR"), level("PATCHLEVEL")].join(".");
}

export default defineConfig({
  base: "./",
  define: { __NETHACK_VERSION__: JSON.stringify(nethackVersion()) },
  plugins: [preact(), serviceWorker()],
  worker: { format: "es" },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/headless/**/*.test.ts"],
  },
});
