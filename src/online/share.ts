// Share links for finished online games: /g/<id>, rendered by a Pages Function from the server's public data, with the
// preview tags that chat apps read. Self-contained, as the Pages Function bundles it without Vite.

import { alignmentName, ascended, characterName } from "../port/xlog";
import { tombstone } from "../port/tombstone";
import { PITCH } from "../port/pitch";
import { shortId } from "./game-id";
import { type Chapter, chaptersOf } from "./story";
import type { GameResult } from "./results";

/** A scored game's story as the server publishes it. */
export interface PublicStory {
  chronicle: { turn: number; line: number; flags: number; text: string }[];
  achievements: { id: string; name: string; description: string; turn: number }[];
  standing?: { place: number; of: number };
}

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
.obit { display: grid; gap: 8px; min-width: 0; }
.kicker { font: 600 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.18em; text-transform: uppercase; color: #f0726b; }
.kicker.up { color: var(--gold); }
.obit h1 { font-size: clamp(32px, 6vw, 52px); line-height: 1.05; margin: 0; overflow-wrap: anywhere; }
.character { color: #b8b4ab; }
.end { font-size: clamp(18px, 2.4vw, 22px); color: var(--text); font-weight: 600; margin-top: 4px; }
.obit .actions { margin-top: 12px; }
.story { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 32px; align-items: start; }
.story > div { display: grid; gap: 24px; min-width: 0; }
h2 { font: 600 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0 0 12px; }
.journey { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--border); }
.journey li { display: grid; grid-template-columns: 56px 1fr; gap: 12px; padding: 0 0 12px 16px; position: relative; }
.journey li::before { content: ""; position: absolute; left: -7px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--bg); border: 2px solid var(--muted); }
.journey li.kind-descent::before { border-color: var(--accent); }
.journey li.kind-feat::before { border-color: var(--gold); }
.journey li.kind-end::before { border-color: #e5534b; background: #e5534b; }
.journey .turn { font: 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--muted); padding-top: 2px; font-variant-numeric: tabular-nums; }
.journey .what { font-size: 15px; line-height: 1.4; min-width: 0; overflow-wrap: anywhere; }
.journey a { font-size: 12px; color: #8fb3ff; margin-left: 4px; }
.earned { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.earned li { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
.earned span { color: var(--muted); font-size: 13px; }
.story dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.story dl div { border-right: 0; border-bottom: 1px solid var(--border); }
.story dl div:nth-child(odd) { border-right: 1px solid var(--border); }
.story dl div:last-child:nth-child(odd) { grid-column: span 2; border-right: 0; }
.button.secondary { background: #2e2e2e; border: 1px solid var(--border); color: var(--text); }
.button:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
@media (max-width: 640px) { .hero, .story { grid-template-columns: 1fr; } pre { font-size: 12px; } dl div { border-right: 0; border-bottom: 1px solid var(--border); } }
`;

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
<title>${html(head.title)} · nethack.app</title>
${meta("name", "description", head.description)}
${meta("name", "robots", "noindex")}
${meta("name", "theme-color", head.themeColor)}
${meta("property", "og:site_name", "nethack.app")}
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
<header><a href="/">nethack.app</a><span>Online games</span></header>
${body}
</main>
</body>
</html>
`;
}

const play = `<div class="actions"><a class="button" href="/online/">Play NetHack</a></div>`;

/** How many turns before the end "the last moments" start. */
const LAST_MOMENTS = 30;

const watchAddress = (game: string, at = "") => `/online/watch/?game=${encodeURIComponent(game)}${at}`;

function journey(game: string, chapters: Chapter[]): string {
  if (!chapters.length) return "";
  const rows = chapters.map(
    (c) =>
      `<li class="kind-${c.kind}"><span class="turn">T${html(String(c.turn))}</span><span class="what">${html(c.text)} <a href="${html(watchAddress(game, `&line=${c.line}`))}" aria-label="Watch ${html(c.text)}, on turn ${html(String(c.turn))}">watch</a></span></li>`,
  );
  // list-style none would otherwise lose the list for Safari's screen reader
  return `<section><h2>The journey</h2><ol class="journey" role="list">${rows.join("")}</ol></section>`;
}

function earned(achievements: PublicStory["achievements"]): string {
  if (!achievements.length) return "";
  const badges = achievements.map((a) => `<li><b>${html(a.name)}</b><span>${html(a.description)} · turn ${html(n(Number(a.turn)))}</span></li>`);
  return `<section><h2>Earned in this game</h2><ul class="earned" role="list">${badges.join("")}</ul></section>`;
}

/** The share page for a game, or for a link that names none the server can show. */
export function sharePage(origin: string, id: string, g: PublicGame | null, story: PublicStory | null = null): string {
  const url = `${origin}/g/${id}`;
  if (!g) {
    return page(
      { title: "NetHack in your browser", description: PITCH, url, image: `${origin}/social.jpg`, imageAlt: "NetHack played in a browser", themeColor: "#3b82f6" },
      `<div><h1>This game can't be shown</h1><p>If it finished just now, its score may not be ready yet, so try again in a few minutes. Otherwise, check the link.</p></div>\n${play}`,
    );
  }
  const { result } = g;
  const up = ascended(result);
  const role = characterName(result);
  const art = up ? `<div class="hero-glyph" aria-hidden="true">@</div>` : `<pre aria-hidden="true">${stone(g)}</pre>`;
  const character = [characterName(result), alignmentName(result)].filter(Boolean).join(" · ");
  const ended = g.endedAt !== undefined ? ` Finished ${new Date(g.endedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.` : "";
  const stat = (label: string, value: string | undefined) => (value === undefined ? "" : `<div><dt>${label}</dt><dd>${html(value)}</dd></div>`);
  const stats = [
    stat("Points", result.points !== undefined ? n(result.points) : undefined),
    stat("Turns", result.turns !== undefined ? n(result.turns) : undefined),
    up ? "" : stat("Died on", result.deathlev !== undefined ? `Level ${result.deathlev}` : undefined),
    stat("Deepest", result.maxlvl !== undefined ? `Level ${result.maxlvl}` : undefined),
    stat("High scores", story?.standing ? `#${n(story.standing.place)} of ${n(story.standing.of)}` : undefined),
  ].join("");
  const lastMoments = result.turns !== undefined && result.turns > LAST_MOMENTS ? watchAddress(g.game, `&turn=${result.turns - LAST_MOMENTS}&play=1`) : null;
  const actions = [
    lastMoments ? `<a class="button" href="${html(lastMoments)}">Watch the last moments</a>` : "",
    `<a class="button ${lastMoments ? "secondary" : ""}" href="${html(watchAddress(g.game))}">${lastMoments ? "Watch from the start" : "Watch the game"}</a>`,
    `<a class="button secondary" href="/online/">Play NetHack</a>`,
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
    `<div class="hero">${art}<div class="obit">
<div class="kicker ${up ? "up" : ""}">${up ? "Ascended" : "Rest in peace"}</div>
<h1>${html(who(g))}</h1>
${character ? `<div class="character">${html(character)}</div>` : ""}
<p class="end">${html(ending(g))}${html(ended)}</p>
<div class="actions">${actions}</div>
</div></div>
<div class="story">
<div>${journey(g.game, chaptersOf(story?.chronicle ?? []))}</div>
<div>${earned(story?.achievements ?? [])}<dl>${stats}</dl></div>
</div>`,
  );
}
