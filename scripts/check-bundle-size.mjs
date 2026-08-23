import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * "Fast to start" is a requirement, not a preference (docs/architecture.md), so
 * a bundle regression fails the build rather than being noticed six months later.
 */
const BUDGET_KB = 60;
const ROOT = 'build/_app/immutable';

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
    )
  );
  return files.flat();
};

const scripts = (await walk(ROOT)).filter((file) => file.endsWith('.js'));
const bytes = scripts.reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0);
const kilobytes = bytes / 1024;

console.log(`client JavaScript: ${kilobytes.toFixed(1)} kB gzipped (budget ${BUDGET_KB} kB)`);

if (kilobytes > BUDGET_KB) {
  console.error(`Over budget by ${(kilobytes - BUDGET_KB).toFixed(1)} kB.`);
  process.exit(1);
}
