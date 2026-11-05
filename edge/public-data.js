// The server's public data, which the share pages and /v1/ put behind this site. PUBLIC_DATA overrides it, such as for
// `wrangler pages dev` against the emulators.
const PRODUCTION = "https://europe-west1-nethack-web-server.cloudfunctions.net/publicData";

export const upstream = (env) => env.PUBLIC_DATA ?? PRODUCTION;

/**
 * The cached answer for this address without its query string, or else `answer()`, kept as its headers allow if it's
 * a page or a 404. Anything else, such as a server's passing failure, isn't kept.
 */
export async function cached(context, answer) {
  const url = new URL(context.request.url);
  url.search = "";
  const key = new Request(url.toString(), { method: "GET" });
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await answer();
  if (response.status === 200 || response.status === 404) context.waitUntil(cache.put(key, response.clone()));
  return response;
}

export const onlyGet = (request) =>
  request.method === "GET" || request.method === "HEAD" ? null : new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
