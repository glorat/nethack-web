// Share links for finished online games: /g/<id>, rendered by a Pages Function from the server's public data, with the
// preview tags that chat apps read. Self-contained, as the Pages Function bundles it without Vite.

import type { GameResult } from "./results";

/** A finished online game as the server publishes it. */
export interface PublicGame {
  game: string;
  handle: string | null;
  endedAt?: number;
  result: GameResult;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A game's UUID as 22 base64url characters, for a shorter link. */
export function shortId(game: string): string {
  const hex = game.replace(/-/g, "");
  let bytes = "";
  for (let i = 0; i < 32; i += 2) bytes += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The game a link names, by its short form or its UUID; null if it names none. */
export function gameOf(id: string): string | null {
  if (UUID.test(id)) return id;
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const bytes = atob(id.replace(/-/g, "+").replace(/_/g, "/") + "==");
  const hex = [...bytes].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  const game = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return shortId(game) === id ? game : null;
}

export const shareAddress = (origin: string, game: string) => `${origin}/g/${shortId(game)}`;

const ROLES: Record<string, [string, string?]> = {
  Arc: ["Archeologist"], Bar: ["Barbarian"], Cav: ["Caveman", "Cavewoman"], Hea: ["Healer"], Kni: ["Knight"], Mon: ["Monk"],
  Pri: ["Priest", "Priestess"], Rog: ["Rogue"], Ran: ["Ranger"], Sam: ["Samurai"], Tou: ["Tourist"], Val: ["Valkyrie"], Wiz: ["Wizard"],
};
const RACES: Record<string, string> = { Hum: "Human", Elf: "Elf", Dwa: "Dwarf", Gno: "Gnome", Orc: "Orc" };

/** The character, as the xlogfile's abbreviations spell it out: "Human Valkyrie", "Elf Priestess". */
export function character({ role, race, gender }: GameResult): string {
  const names = role ? ROLES[role] : undefined;
  const roleName = names ? ((gender === "Fem" && names[1]) || names[0]) : role;
  return [race ? (RACES[race] ?? race) : undefined, roleName].filter(Boolean).join(" ");
}


const isAscension = (result: GameResult) => /^ascended\b/.test(result.death ?? "");
const who = (g: PublicGame) => g.handle ?? "Anonymous";
const n = (x: number) => x.toLocaleString("en-US");
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How the game ended, as a sentence. */
export function ending({ result }: PublicGame): string {
  const death = capitalised(result.death ?? "ended");
  const where = !isAscension(result) && result.deathlev !== undefined ? ` on dungeon level ${result.deathlev}` : "";
  const when = result.turns !== undefined ? ` after ${n(result.turns)} turns` : "";
  return `${death}${where}${when}.`;
}

export function title(g: PublicGame): string {
  const points = g.result.points !== undefined ? `${n(g.result.points)} points` : "";
  const role = character({ role: g.result.role, gender: g.result.gender });
  if (isAscension(g.result)) return `${who(g)} ascended! ${[role, points].filter(Boolean).join(", ")}`;
  return `${who(g)}'s ${role || "game"}${points ? `: ${points}` : ""}`;
}

const html = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function centred(text: string, width: number): string {
  const s = text.slice(0, width);
  const left = Math.floor((width - s.length) / 2);
  return " ".repeat(left) + s + " ".repeat(width - s.length - left);
}

/** The core's tombstone, from rip.c, engraved as the end of the game engraves it; as HTML. */
export function tombstone(g: PublicGame): string {
  const year = g.endedAt !== undefined ? String(new Date(g.endedAt).getUTCFullYear()) : "";
  const engraving = [who(g), g.result.points !== undefined ? `${n(g.result.points)} points` : "", ...wrap(g.result.death ?? "", 16).slice(0, 3), year];
  while (engraving.length < 6) engraving.push("");
  return [
    "      ----------",
    "     /          \\",
    "    /    REST    \\",
    "   /      IN      \\",
    "  /     PEACE      \\",
    " /                  \\",
    ...engraving.map((line) => ` |<b>${html(centred(line, 18))}</b>|`),
    "*|     *  *  *      | *",
    "_)/\\_//(\\/(/\\)/\\//\\/|_)_",
  ]
    .map((row) => (row.includes("<b>") ? row : html(row)))
    .join("\n");
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
  const up = isAscension(result);
  const role = character(result);
  const art = up ? `<div class="hero-glyph" aria-hidden="true">@</div>` : `<pre aria-hidden="true">${tombstone(g)}</pre>`;
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
