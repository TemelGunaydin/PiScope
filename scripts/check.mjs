import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dirs = ['src', 'scripts', 'extensions', 'public', 'test'];
let count = 0;
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(?:mjs|js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
      count++;
    }
  }
}
for (const dir of dirs) scan(resolve(dir));
console.log(`Syntax checked ${count} JavaScript modules (Pi TypeScript entry tested separately by Pi at load time).`);
