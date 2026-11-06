// A finished online game's share page: what chat apps read for the link's preview, and what a visitor sees.
import { gameOf } from "../../src/online/game-id";
import { sharePage } from "../../src/online/share";
import { cached, onlyGet, upstream } from "../../edge/public-data.js";

const unavailable = () =>
  new Response("The game couldn't be loaded. Try again in a moment.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export const onRequest = (context) => {
  const refused = onlyGet(context.request);
  if (refused) return refused;
  const id = String(context.params.id);
  const { origin } = new URL(context.request.url);
  return cached(context, async () => {
    const game = gameOf(id);
    const ask = (path) => (game ? fetch(`${upstream(context.env)}/v1/games/${game}${path}`).catch(() => null) : null);
    const [found, told] = await Promise.all([ask(".json"), ask("/story.json")]);
    // only the server's own "no such game" makes the page say so; a passing failure isn't cached
    if (game && !found?.ok && found?.status !== 404) return unavailable();
    const data = found?.ok ? await found.json() : null;
    // the story is extra: without it the page still says how the game went
    const story = data && told?.ok ? await told.json().then((s) => (Array.isArray(s?.chronicle) && Array.isArray(s?.achievements) ? s : null), () => null) : null;
    return new Response(sharePage(origin, id, data, story), {
      status: data ? 200 : 404,
      // kept only whole, as a page kept for an hour without its story would hide it that long
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": data && story ? "public, max-age=60, s-maxage=3600" : "no-store" },
    });
  });
};
