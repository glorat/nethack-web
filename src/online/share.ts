// Share links for finished online games: /g/<id>, rendered by a Pages Function from the server's public data, with the
// preview tags that chat apps read. Self-contained, as the Pages Function bundles it without Vite.

import { ascended, characterName } from "../port/xlog";
import { tombstone } from "../port/tombstone";
import { shortId } from "./game-id";
import type { GameResult } from "./results";

/** A finished online game as the server publishes it. */
export interface PublicGame {
  game: string;
  handle: string | null;
  endedAt?: number;
  result: GameResult;
}

export const shareAddress = (origin: string, game: string) => `${origin}/g/${shortId(game)}`;

const who = (g: PublicGame) => g.handle ?? "Anonymous";
const n = (x: number) => x.toLocaleString("en-US");
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How the game ended, as a sentence. */
export function ending({ result }: PublicGame): string {
  const death = capitalised(result.death ?? "ended");
  const where = !ascended(result) && result.deathlev !== undefined ? ` on dungeon level ${result.deathlev}` : "";
  const when = result.turns !== undefined ? ` after ${n(result.turns)} turns` : "";
  return `${death}${where}${when}.`;
}

export function title(g: PublicGame): string {
  const points = g.result.points !== undefined ? `${n(g.result.points)} points` : "";
  const role = characterName({ role: g.result.role, gender: g.result.gender });
  if (ascended(g.result)) return `${who(g)} ascended! ${[role, points].filter(Boolean).join(", ")}`;
  return `${who(g)}'s ${role || "game"}${points ? `: ${points}` : ""}`;
}

const html = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The core's tombstone, engraved for the game, as HTML. */
function stone(g: PublicGame): string {
  const rows = tombstone({ who: who(g), points: g.result.points, death: g.result.death, year: g.endedAt !== undefined ? new Date(g.endedAt).getUTCFullYear() : undefined });
  return rows.map(({ before, engraved, after }) => html(before) + (engraved === undefined ? "" : `<b>${html(engraved)}</b>${html(after ?? "")}`)).join("\n");
}

const STYLE = `
:root { color-scheme: dark; --bg: #1e1e1e; --panel: #262626; --border: #3a3a3a; --text: #e6e6e6; --muted: #9a9a9a; --accent: #3b82f6; --stone: #b9b4a8; --gold: #e3b341; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 20px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); display: grid; gap: 28px; }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; color: var(--muted); font-size: 14px; }
header a { color: var(--text); font-weight: 600; text-decoration: none; }
.hero { display: grid; grid-template-columns: auto 1fr; gap: 20px 40px; align-items: center; }
pre { margin: 0; font: 14px/1.2 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--stone); }
pre b { color: #f4f1ea; font-weight: 600; }
.hero-glyph { font: 600 120px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--gold); text-shadow: 0 0 40px #e3b34166; padding: 0 30px; }
h1 { margin: 0 0 8px; font-size: clamp(22px, 4vw, 30px); line-height: 1.2; text-wrap: balance; }
p { margin: 0; color: #a8a8a8; max-width: 60ch; }
dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
dl div { padding: 12px 16px; border-right: 1px solid var(--border); }
dl div:last-child { border-right: 0; }
dt { font-size: 12px; color: var(--muted); }
dd { margin: 0; font: 600 18px ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.button { font-weight: 600; font-size: 15px; border-radius: 6px; padding: 9px 18px; background: var(--accent); color: #fff; text-decoration: none; }
.button:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
@media (max-width: 640px) { .hero { grid-template-columns: 1fr; } pre { font-size: 12px; } dl div { border-right: 0; border-bottom: 1px solid var(--border); } }
`;

const SITE_DESCRIPTION = "The classic dungeon crawl in your browser: online with high scores, or offline on your device.";

interface Head {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  themeColor: string;
}

function page(head: Head, body: string): string {
  const meta = (attr: "name" | "property", key: string, content: string) => `<meta ${attr}="${key}" content="${html(content)}" />`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${html(head.title)} · NetHack</title>
${meta("name", "description", head.description)}
${meta("name", "robots", "noindex")}
${meta("name", "theme-color", head.themeColor)}
${meta("property", "og:site_name", "NetHack")}
${meta("property", "og:type", "website")}
${meta("property", "og:url", head.url)}
${meta("property", "og:title", head.title)}
${meta("property", "og:description", head.description)}
${meta("property", "og:image", head.image)}
${meta("property", "og:image:width", "1200")}
${meta("property", "og:image:height", "630")}
${meta("property", "og:image:alt", head.imageAlt)}
${meta("name", "twitter:card", "summary_large_image")}
<link rel="canonical" href="${html(head.url)}" />
<link rel="icon" type="image/png" href="/favicon.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<style>${STYLE}</style>
</head>
<body>
<main>
<header><a href="/">NetHack</a><span>Online games</span></header>
${body}
</main>
</body>
</html>
`;
}

const play = `<div class="actions"><a class="button" href="/online/">Play NetHack</a></div>`;

/** The share page for a game, or for a link that names none the server can show. */
export function sharePage(origin: string, id: string, g: PublicGame | null): string {
  const url = `${origin}/g/${id}`;
  if (!g) {
    return page(
      { title: "NetHack in your browser", description: SITE_DESCRIPTION, url, image: `${origin}/social.jpg`, imageAlt: "NetHack played in a browser", themeColor: "#3b82f6" },
      `<div><h1>This game can't be shown</h1><p>If it finished just now, its score may not be ready yet, so try again in a few minutes. Otherwise, check the link.</p></div>\n${play}`,
    );
  }
  const { result } = g;
  const up = ascended(result);
  const role = characterName(result);
  const art = up ? `<div class="hero-glyph" aria-hidden="true">@</div>` : `<pre aria-hidden="true">${stone(g)}</pre>`;
  const headline = up ? `${who(g)}'s ${role || "character"} ascended` : `${who(g)}'s ${role || "character"} was ${result.death ?? "lost"}`;
  const ended = g.endedAt !== undefined ? ` Finished ${new Date(g.endedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.` : "";
  const stat = (label: string, value: string | undefined) => (value === undefined ? "" : `<div><dt>${label}</dt><dd>${html(value)}</dd></div>`);
  const stats = [
    stat("Points", result.points !== undefined ? n(result.points) : undefined),
    stat("Turns", result.turns !== undefined ? n(result.turns) : undefined),
    up ? "" : stat("Died on", result.deathlev !== undefined ? `Level ${result.deathlev}` : undefined),
    stat("Deepest", result.maxlvl !== undefined ? `Level ${result.maxlvl}` : undefined),
  ].join("");
  return page(
    {
      title: title(g),
      description: ending(g),
      url,
      image: `${origin}/v1/games/${id}/card.png`,
      imageAlt: up ? `${who(g)}'s ${role} ascended` : `Tombstone for ${who(g)}'s ${role}: ${result.death ?? ""}`,
      themeColor: up ? "#e3b341" : "#e5534b",
    },
    `<div class="hero">${art}<div><h1>${html(headline)}</h1><p>${html(ending(g))}${html(ended)}</p></div></div>
<dl>${stats}</dl>
${play}`,
  );
}
