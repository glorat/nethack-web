import { expect, test } from "@playwright/test";

test("ANSI walls meet without gaps or overhang", async ({ page }) => {
  await page.goto("/offline/");
  const result = await page.evaluate(async () => {
    const { asciiCell, drawSymbol, MAP_BACKGROUND } = await import("/src/ui/ascii.ts");
    const cell = asciiCell(32, null, 1);
    const width = cell.width;
    const height = cell.height;
    const draw = (cols: number, rows: number, symbols: string[]) => {
      const canvas = document.createElement("canvas");
      canvas.width = cols * width;
      canvas.height = rows * height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = MAP_BACKGROUND;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      symbols.forEach((s, i) => drawSymbol(ctx, cell, s, 7, (i % cols) * width, Math.floor(i / cols) * height));
      return ctx;
    };
    const nonBackground = (data: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) n++;
      return n;
    };
    const pixels = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) =>
      ctx.getImageData(x, y, w, h).data;

    const wall = draw(1, 2, ["║", "║"]);
    const wallRows: number[] = [];
    for (let y = 0; y < height * 2; y++) wallRows.push(nonBackground(pixels(wall, 0, y, width, 1)));

    const one = draw(2, 1, ["║", " "]);
    const neighbour = nonBackground(pixels(one, width, 0, width, height));

    const shade = draw(3, 1, ["░", "░", "░"]);
    const boundary = pixels(shade, width - 1, Math.floor(height / 2), 2, 1);
    const center = [...pixels(shade, Math.floor(width / 2), Math.floor(height / 2), 1, 1).slice(0, 3)];

    return { width, height, bg: MAP_BACKGROUND, wallRows, neighbour, boundary: [...boundary], center };
  });
  expect(result.width / result.height).toBeCloseTo(0.4375, 2);
  expect(result.bg).toBe("#000");
  expect(result.wallRows.every((n) => n >= 2)).toBe(true);
  expect(result.neighbour).toBe(0);
  expect(result.boundary[0]).not.toBe(0); // shade reaches the shared edge
  expect(result.boundary[4]).not.toBe(0);
  expect(result.center[0]).toBeGreaterThan(43);
  expect(result.center[0]).toBeLessThan(50);
  expect(result.center[1]).toBeGreaterThan(45);
  expect(result.center[1]).toBeLessThan(52);
  expect(result.center[2]).toBeGreaterThan(46);
  expect(result.center[2]).toBeLessThan(53);
});

test("the page doesn't wait for the map's fallback font, which only the ASCII map uses", async ({ page }) => {
  // a font that never arrives, as on a slow first visit
  await page.route(/JuliaMono/, () => {});
  await page.goto("/offline/play/?name=Fonts");
  await expect(page.getByRole("dialog", { name: "Choose your character" })).toBeVisible({ timeout: 10_000 });
});

test("the map's fallback font is fetched for a character the map's font lacks, never for ASCII", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (r) => {
    if (/JuliaMono/.test(r.url())) fetched.push(r.url());
  });
  await page.goto("/offline/play/?name=Fonts");
  await page.getByRole("dialog", { name: "Choose your character" }).waitFor();
  const status = (text: string) =>
    page.evaluate(async (text) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      // as on a machine with none of the map's usual fonts, such as Linux
      ctx.font = `20px "No Such Font", "JuliaMono", monospace`;
      ctx.fillText(text, 0, 20);
      await new Promise((r) => setTimeout(r, 1000));
      return [...document.fonts].find((f) => f.family === "JuliaMono")!.status;
    }, text);
  expect(await status("@ #.|-+ abc 123")).toBe("unloaded");
  expect(fetched).toEqual([]);
  expect(await status("⯑")).not.toBe("unloaded");
});
