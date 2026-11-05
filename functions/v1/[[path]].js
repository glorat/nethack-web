// The server's public data under this site's address, for the share pages' images and anyone else: only the addresses
// it serves, without query strings, so nothing can be asked that the cache doesn't hold.
import { cached, onlyGet, upstream } from "../../edge/public-data.js";

const KNOWN = /^\/v1\/(leaderboard\.json|games\/([A-Za-z0-9_-]{22}|[0-9a-f-]{36})(\.json|\/card\.png|\/story\.json))$/;

export const onRequest = (context) => {
  const refused = onlyGet(context.request);
  if (refused) return refused;
  const { pathname } = new URL(context.request.url);
  if (!KNOWN.test(pathname)) return new Response("Not found", { status: 404 });
  return cached(context, async () => {
    const response = await fetch(`${upstream(context.env)}${pathname}`);
    const headers = new Headers();
    for (const name of ["Content-Type", "Cache-Control", "Access-Control-Allow-Origin"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  });
};
