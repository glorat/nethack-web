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
@font-face { font-family: "VT323"; src: url(/fonts/vt323-latin-400-normal.woff2) format("woff2"); font-display: swap; }
@font-face { font-family: "IBM Plex Mono"; font-weight: 400; src: url(/fonts/ibm-plex-mono-latin-400-normal.woff2) format("woff2"); font-display: swap; }
@font-face { font-family: "IBM Plex Mono"; font-weight: 600; src: url(/fonts/ibm-plex-mono-latin-600-normal.woff2) format("woff2"); font-display: swap; }
:root {
  color-scheme: dark; --bg: #0b0b0c; --text: #cfcfcc; --bright: #fafafa; --muted: #8e8e8a; --danger: #e0603f; --online: #5fb8c0; --accent: #e8a33a;
  --rule: #2a2a2d; --rule-strong: #1f1f22; --field-border: #55555a; --earned: #4f6b3c; --frame: color-mix(in srgb, var(--online) 24%, #3a3a3e);
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; --display: "VT323", var(--mono); --type: "IBM Plex Mono", var(--mono);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 var(--type); }
a { color: var(--online); }
:focus-visible { outline: 2px solid var(--online); outline-offset: 2px; }
.bar { display: flex; flex-wrap: wrap; gap: 4px 18px; align-items: baseline; justify-content: space-between; padding: 12px max(16px, calc((100% - 1088px) / 2)); border-bottom: 1px solid var(--rule-strong); }
.title { display: flex; gap: 14px; align-items: baseline; }
.wordmark { font: 28px/1 var(--display); color: var(--bright); text-decoration: none; }
.badge { font: 19px/1 var(--display); color: var(--online); text-transform: uppercase; letter-spacing: 0.08em; }
.bar-link { color: var(--text); text-decoration: none; }
.bar-link:hover { color: var(--bright); }
main { display: grid; gap: 28px; max-width: 1120px; margin: 0 auto; padding: 32px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); }
.frame { position: relative; margin: 0; padding: 22px 16px 16px; border: 1px solid var(--frame); min-width: 0; }
.frame-label { position: absolute; top: 0; left: 12px; transform: translateY(-50%); margin: 0; padding: 0 6px; background: var(--bg); color: var(--online); font: 400 20px/1 var(--display); letter-spacing: 0.04em; }
.obit { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 20px 40px; align-items: center; padding: 28px 24px 24px; }
.obit .frame-label { color: var(--danger); }
.obit.up .frame-label { color: var(--accent); }
pre { margin: 0; font: 13px/1.2 var(--type); color: var(--muted); }
pre b { color: var(--bright); font-weight: 600; }
.hero-glyph { font: 160px/1 var(--display); color: var(--accent); padding: 0 40px; }
.who { display: grid; gap: 10px; min-width: 0; }
h1 { margin: 0; font: 400 clamp(40px, 6vw, 60px)/1 var(--display); color: var(--bright); overflow-wrap: anywhere; }
.character { color: var(--muted); }
.end { margin: 0; color: var(--bright); max-width: 52ch; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
.button { padding: 8px 20px; border: 1px solid var(--field-border); color: var(--text); font-weight: 600; text-decoration: none; }
.button:hover { border-color: var(--bright); color: var(--bright); }
.button.primary { background: var(--online); border-color: var(--online); color: #06181a; }
.button.primary:hover { background: #7cc9d0; border-color: #7cc9d0; color: #06181a; }
.share { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; }
.share > span:first-child { color: var(--muted); font-size: 12.5px; margin-right: 4px; }
.share a, .share button { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; background: none; border: 1px solid var(--field-border); border-radius: 0; color: var(--text); cursor: pointer; }
.share a:hover, .share button:hover { border-color: var(--bright); color: var(--bright); }
.share svg { width: 18px; height: 18px; fill: currentColor; }
#share-said { color: var(--muted); font-size: 12.5px; margin-left: 4px; }
.story { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.story > div { display: grid; gap: 28px; min-width: 0; }
.journey { list-style: none; margin: 0; padding: 0; }
.journey li { display: grid; grid-template-columns: 4.5em minmax(0, 1fr); gap: 12px; padding: 5px 0; border-bottom: 1px dashed var(--rule); }
.journey li:last-child { border-bottom: 0; }
.journey .turn { color: var(--muted); font-variant-numeric: tabular-nums; }
.journey .what { overflow-wrap: anywhere; }
.journey .kind-descent .what { color: var(--online); }
.journey .kind-feat .what { color: var(--accent); }
.journey .kind-end .what { color: var(--danger); }
.journey a { margin-left: 6px; font-size: 12.5px; color: var(--muted); }
.journey a:hover { color: var(--bright); }
dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
dt { color: var(--muted); }
dd { margin: 0; color: var(--bright); font-weight: 600; font-variant-numeric: tabular-nums; }
.earned { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.earned li { display: grid; gap: 2px; padding: 8px; border: 1px solid var(--earned); }
.earned strong { color: var(--bright); font-weight: 600; }
.earned span { color: var(--muted); font-size: 12.5px; }
.lost { display: grid; gap: 12px; max-width: 560px; }
.lost h1 { font-size: 38px; }
.lost p { margin: 0; }
@media (max-width: 900px) { .story { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 640px) { .obit { grid-template-columns: minmax(0, 1fr); padding: 24px 16px 16px; } pre { font-size: 11px; } .hero-glyph { font-size: 120px; } }
`;

interface Head {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  themeColor: string;
}

function page(head: Head, body: string, script?: string): string {
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
<header class="bar"><div class="title"><a class="wordmark" href="/online/">nethack.app</a><span class="badge">Online</span></div><a class="bar-link" href="/online/">Play NetHack</a></header>
<main>
${body}
</main>${script ?? ""}
</body>
</html>
`;
}

/** How many turns before the end "the last moments" start. */
const LAST_MOMENTS = 30;

/** The device's share sheet where there is one, or else a copy of the page's link. */
const SHARE_SCRIPT = `<script>
(() => {
  const button = document.getElementById("share-link"), said = document.getElementById("share-said");
  const url = document.querySelector('link[rel="canonical"]').href;
  if (navigator.share) button.title = "Share";
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", async () => {
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        said.textContent = "Copied the link.";
      }
    } catch (e) {
      if (e.name !== "AbortError") said.textContent = "Couldn't share it. Try again.";
    }
  });
})();
</script>`;

const icon = (viewBox: string, body: string) => `<svg viewBox="${viewBox}" aria-hidden="true">${body}</svg>`;
// a chain link, drawn here
const LINK_ICON = icon("0 0 24 24", `<g transform="rotate(-45 12 12)" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="8.5" width="11" height="7" rx="3.5"/><rect x="11" y="8.5" width="11" height="7" rx="3.5"/></g>`);
// the sites' logos, from Simple Icons (CC0)
const REDDIT_ICON = icon("0 0 24 24", `<path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z"/>`);
const X_ICON = icon("0 0 24 24", `<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>`);

/** Ways to share the game: its link, or a post on another site through that site's own page. */
function share(url: string, text: string): string {
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
  const sites = [
    ["Reddit", `https://www.reddit.com/submit?${q({ url, title: text })}`, REDDIT_ICON],
    ["X", `https://x.com/intent/post?${q({ text, url })}`, X_ICON],
  ];
  const links = sites.map(([name, href, svg]) => `<a href="${html(href)}" target="_blank" rel="noopener" title="Share on ${name}" aria-label="Share on ${name}">${svg}</a>`).join("");
  return `<div class="share"><span>Share</span><button type="button" id="share-link" title="Copy link" aria-label="Copy link">${LINK_ICON}</button>${links}<span id="share-said" role="status"></span></div>`;
}

const watchAddress = (game: string, at = "") => `/online/watch/?game=${encodeURIComponent(game)}${at}`;

const frame = (label: string, body: string, cls = "") => `<section class="frame ${cls}"><h2 class="frame-label">${label}</h2>${body}</section>`;

function journey(game: string, chapters: Chapter[]): string {
  if (!chapters.length) return "";
  const rows = chapters.map(
    (c) =>
      `<li class="kind-${c.kind}"><span class="turn">T${html(String(c.turn))}</span><span class="what">${html(c.text)}<a href="${html(watchAddress(game, `&line=${c.line}`))}" aria-label="Watch ${html(c.text)}, on turn ${html(String(c.turn))}">watch</a></span></li>`,
  );
  // list-style none would otherwise lose the list for Safari's screen reader
  return frame("The journey", `<ol class="journey" role="list">${rows.join("")}</ol>`);
}

function earned(achievements: PublicStory["achievements"]): string {
  if (!achievements.length) return "";
  const badges = achievements.map((a) => `<li><strong>${html(a.name)}</strong><span>${html(a.description)} · turn ${html(n(Number(a.turn)))}</span></li>`);
  return frame("Earned in this game", `<ul class="earned" role="list">${badges.join("")}</ul>`);
}

/** The share page for a game, or for a link that names none the server can show. */
export function sharePage(origin: string, id: string, g: PublicGame | null, story: PublicStory | null = null): string {
  const url = `${origin}/g/${id}`;
  if (!g) {
    return page(
      { title: "NetHack in your browser", description: PITCH, url, image: `${origin}/social.jpg`, imageAlt: "NetHack played in a browser", themeColor: "#5fb8c0" },
      `<div class="lost"><h1>This game can't be shown</h1><p>If it finished just now, its score may not be ready yet, so try again in a few minutes. Otherwise, check the link.</p><div class="actions"><a class="button primary" href="/online/">Play NetHack</a></div></div>`,
    );
  }
  const { result } = g;
  const up = ascended(result);
  const role = characterName(result);
  const art = up ? `<div class="hero-glyph" aria-hidden="true">@</div>` : `<pre aria-hidden="true">${stone(g)}</pre>`;
  const character = [characterName(result), alignmentName(result)].filter(Boolean).join(" · ");
  const ended = g.endedAt !== undefined ? ` Finished ${new Date(g.endedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.` : "";
  const stat = (label: string, value: string | undefined) => (value === undefined ? "" : `<dt>${label}</dt><dd>${html(value)}</dd>`);
  const stats = [
    stat("Points", result.points !== undefined ? n(result.points) : undefined),
    stat("Turns", result.turns !== undefined ? n(result.turns) : undefined),
    up ? "" : stat("Died on", result.deathlev !== undefined ? `Level ${result.deathlev}` : undefined),
    stat("Deepest", result.maxlvl !== undefined ? `Level ${result.maxlvl}` : undefined),
    stat("High scores", story?.standing ? `#${n(story.standing.place)} of ${n(story.standing.of)}` : undefined),
  ].join("");
  const lastMoments = result.turns !== undefined && result.turns > LAST_MOMENTS ? watchAddress(g.game, `&turn=${result.turns - LAST_MOMENTS}&play=1`) : null;
  const actions = [
    lastMoments ? `<a class="button primary" href="${html(lastMoments)}">Watch the Last Moments</a>` : "",
    `<a class="button ${lastMoments ? "" : "primary"}" href="${html(watchAddress(g.game))}">${lastMoments ? "Watch from the Start" : "Watch the Game"}</a>`,
  ].join("");
  const who_ = `<div class="who">
<h1>${html(who(g))}</h1>
${character ? `<div class="character">${html(character)}</div>` : ""}
<p class="end">${html(ending(g))}${html(ended)}</p>
<div class="actions">${actions}</div>
${share(url, title(g))}
</div>`;
  return page(
    {
      title: title(g),
      description: ending(g),
      url,
      image: `${origin}/v1/games/${id}/card.png`,
      imageAlt: up ? `${who(g)}'s ${role} ascended` : `Tombstone for ${who(g)}'s ${role}: ${result.death ?? ""}`,
      themeColor: up ? "#e8a33a" : "#e0603f",
    },
    `${frame(up ? "Ascended" : "Rest in peace", `${art}${who_}`, `obit ${up ? "up" : ""}`)}
<div class="story">
<div>${journey(g.game, chaptersOf(story?.chronicle ?? []))}</div>
<div>${stats ? frame("The score", `<dl>${stats}</dl>`) : ""}${earned(story?.achievements ?? [])}</div>
</div>`,
    SHARE_SCRIPT,
  );
}
