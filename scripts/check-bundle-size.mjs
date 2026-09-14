import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * "Fast to start" is a requirement, not a preference (docs/architecture.md), so
 * a bundle regression fails the build rather than being noticed six months later.
 *
 * The budget is specifically the *solo route's* initial JS, per
 * docs/architecture.md — "Each mode is additive. Mode 1 never loads mode 2's
 * code (route-level code splitting), so the cold start of the common case
 * stays minimal." So this walks the real Vite module graph from what a
 * visitor to `/` actually has to download — the kit runtime, the root
 * layout, and the `/` page's own chunk — following only *static* imports.
 * A chunk reachable only through a `dynamicImports` edge (a feature loaded
 * on demand, like the QR camera scanner) is never fetched by someone who
 * never asks for it, so it must not count against this budget — counting it
 * anyway is exactly the case route-splitting exists to avoid paying for.
 */
const BUDGET_KB = 60;
const CLIENT_OUTPUT = '.svelte-kit/output/client';
const MANIFEST_PATH = join(CLIENT_OUTPUT, '.vite/manifest.json');
const GENERATED_NODES_DIR = '.svelte-kit/generated/client-optimized/nodes';

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

/** The generated node wrapper for a route is a one-line re-export of the
 *  real `+page.svelte`/`+layout.svelte` it stands in for — reading that
 *  content is the only reliable way to tell "node 2" from "the home page",
 *  since the numbering itself isn't stable across builds. */
async function findNodeManifestKey(routeSourceSuffix) {
  const files = await readdir(GENERATED_NODES_DIR);
  for (const file of files) {
    const path = join(GENERATED_NODES_DIR, file);
    const content = readFileSync(path, 'utf8');
    if (content.includes(routeSourceSuffix)) return path;
  }
  throw new Error(`No generated node imports "${routeSourceSuffix}" — did routing change?`);
}

function findEntryManifestKey(name) {
  const found = Object.entries(manifest).find(([, entry]) => entry.name === name);
  if (found === undefined) throw new Error(`No manifest entry named "${name}".`);
  return found[0];
}

/** Follows only `imports` (static), never `dynamicImports` (on-demand) — the
 *  distinction the whole budget rests on. */
function collectStaticFiles(startKeys) {
  const files = new Set();
  const seen = new Set();
  const queue = [...startKeys];

  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = manifest[key];
    if (entry === undefined) throw new Error(`Manifest has no entry for "${key}".`);
    if (entry.file.endsWith('.js')) files.add(entry.file);
    for (const importedKey of entry.imports ?? []) queue.push(importedKey);
  }

  return files;
}

const rootLayoutKey = await findNodeManifestKey('src/routes/+layout.svelte');
const homePageKey = await findNodeManifestKey('src/routes/+page.svelte');

const soloRouteFiles = collectStaticFiles([
  findEntryManifestKey('entry/start'),
  findEntryManifestKey('entry/app'),
  rootLayoutKey,
  homePageKey
]);

const bytes = [...soloRouteFiles].reduce(
  (total, file) => total + gzipSync(readFileSync(join(CLIENT_OUTPUT, file))).length,
  0
);
const kilobytes = bytes / 1024;

console.log(`solo route, initial JS: ${kilobytes.toFixed(1)} kB gzipped (budget ${BUDGET_KB} kB)`);
console.log([...soloRouteFiles].sort().join('\n'));

if (kilobytes > BUDGET_KB) {
  console.error(`Over budget by ${(kilobytes - BUDGET_KB).toFixed(1)} kB.`);
  process.exit(1);
}
