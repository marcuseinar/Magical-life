import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

/**
 * Serves `build/` under a base path, the way GitHub Pages serves a project
 * site. Hand-rolled rather than another dependency: it is forty lines, and the
 * dependency count is deliberately small.
 */
const PORT = Number(process.env.PORT ?? 4180);
const BASE = process.env.BASE_PATH ?? '';
const ROOT = 'build';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

const send = (response, status, body, type) => {
  response.writeHead(status, { 'content-type': type ?? 'text/plain' });
  response.end(body);
};

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', `http://localhost:${PORT}`);

  if (BASE && !pathname.startsWith(BASE)) return send(response, 404, 'outside base path');
  const relative = pathname.slice(BASE.length) || '/';

  // `normalize` collapses any `..` before it can escape the build directory.
  const candidate = join(ROOT, normalize(relative));
  const file = relative.endsWith('/') ? join(candidate, 'index.html') : candidate;

  try {
    return send(response, 200, await readFile(file), TYPES[extname(file)]);
  } catch {
    // Only the app root falls back to the shell. Everything else 404s, the way
    // branch-served Pages does — which is what makes a preview at a sibling
    // path detectable rather than silently served the production app.
    if (relative !== '/') return send(response, 404, 'not found');
    try {
      return send(response, 200, await readFile(join(ROOT, 'index.html')), 'text/html');
    } catch {
      return send(response, 404, 'not found');
    }
  }
}).listen(PORT, () => console.log(`serving ${ROOT} at http://localhost:${PORT}${BASE}/`));
