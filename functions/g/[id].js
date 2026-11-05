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
    if (found?.ok && !told?.ok) return unavailable();
    const data = found?.ok ? await found.json() : null;
    const story = data ? await told.json() : null;
    return new Response(sharePage(origin, id, data, story), {
      status: data ? 200 : 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=60, s-maxage=${data ? 3600 : 300}` },
    });
  });
};
