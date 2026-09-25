import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDirectory } from '../src/config.mjs';

const args = process.argv.slice(2); const project = args.find(a => !a.startsWith('--'));
if (!project) { console.error('Usage: npm run install:pi -- /absolute/project/path [--update] [--instructions]'); process.exit(1); }
const root = resolve(project);
if (!existsSync(root) || !statSync(root).isDirectory()) { console.error('Project directory does not exist'); process.exit(1); }
const source = fileURLToPath(new URL('../extensions/agent-dashboard/', import.meta.url));
const dest = join(root, '.pi', 'extensions', 'agent-dashboard');
if (resolve(source) === resolve(dest)) { console.error('Choose your coding project, not the extension directory.'); process.exit(1); }
const backupRoot = join(dataDirectory(), 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
if (existsSync(dest)) {
  if (!args.includes('--update')) { console.error(`Already installed: ${dest}\nUse --update to back up and replace this extension only.`); process.exit(1); }
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  cpSync(dest, join(backupRoot, 'agent-dashboard'), { recursive: true });
}
mkdirSync(dest, { recursive: true }); cpSync(source, dest, { recursive: true });
if (args.includes('--instructions')) {
  const target = join(root, 'AGENTS.md'); const marker = '<!-- agent-desk-observability -->';
  const previous = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (!previous.includes(marker)) {
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    if (existsSync(target)) cpSync(target, join(backupRoot, 'AGENTS.md'));
    const snippet = readFileSync(new URL('../docs/AGENTS-observability.md', import.meta.url), 'utf8');
    writeFileSync(target, `${previous.trimEnd()}\n\n${snippet}\n`);
  }
}
console.log(`\nInstalled: ${dest}\nIn Pi: /reload then /dashboard-status\nNo provider/model/MCP configuration was changed.\n${args.includes('--instructions') ? 'Observability instructions appended to AGENTS.md (existing file backed up).' : 'For planned stages, see docs/AGENTS-observability.md; model events are captured automatically.'}\n`);
