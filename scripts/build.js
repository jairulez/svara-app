// Build: syntax-check every JS file, then copy public/ -> dist/ with build-info.json. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'data']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const jsFiles = walk(ROOT).filter((f) => /\.(m?js)$/.test(f));
let failed = 0;
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { failed++; console.error(`SYNTAX ERROR in ${path.relative(ROOT, f)}\n${r.stderr}`); }
}
if (failed) { console.error(`Build failed: ${failed} file(s) with syntax errors.`); process.exit(1); }
console.log(`Checked ${jsFiles.length} JS files.`);

const src = path.join(ROOT, 'public');
const dist = path.join(ROOT, 'dist');
if (!fs.existsSync(src)) { console.error('public/ not found'); process.exit(1); }
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(src, dist, { recursive: true });

const files = walk(dist).sort();
const hash = crypto.createHash('sha256');
for (const f of files) { hash.update(path.relative(dist, f)); hash.update(fs.readFileSync(f)); }
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const info = { name: pkg.name, version: pkg.version, builtAt: new Date().toISOString(), node: process.version, files: files.length, contentHash: hash.digest('hex').slice(0, 16) };
fs.writeFileSync(path.join(dist, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Copied public -> dist (${files.length} files). Build ${info.version} ${info.contentHash}`);
