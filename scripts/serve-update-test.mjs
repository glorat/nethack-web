// Serves dist/ for the update test. GET /__next-version makes sw.js differ, as a new deploy would.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".bmp": "image/bmp", ".txt": "text/plain" };
const port = Number(process.argv[2]);
let version = 1;

createServer(async (req, res) => {
  const path = normalize(new URL(req.url, "http://x").pathname);
  if (path === "/__next-version") {
    version++;
    return res.end(String(version));
  }
  try {
    let body = await readFile(join("dist", path.endsWith("/") ? `${path}index.html` : path));
    if (path === "/sw.js") body = body.toString().replace(/const VERSION = "([^"]*)"/, `const VERSION = "$1-v${version}"`);
    res.writeHead(200, { "content-type": TYPES[extname(path) || ".html"] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(port, "127.0.0.1");
