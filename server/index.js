import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, ROOT } from './lib/config.js';
import { db, migrate, get, j } from './lib/db.js';
import { Router, dispatchApi, handleError, applySecurityHeaders, sendJson, clientIp } from './lib/http.js';
import { createLimiter } from './lib/ratelimit.js';
import registerPublic from './routes/public.js';
import registerAuth from './routes/auth.js';
import registerUser from './routes/user.js';
import registerClinician from './routes/clinician.js';
import registerPro from './routes/pro.js';
import registerAdmin from './routes/admin.js';
import registerPrivacy from './routes/privacy.js';

const PUBLIC_DIR = path.resolve(ROOT, process.env.STATIC_DIR || 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildRouter(limiter) {
  const router = new Router();
  const deps = { limiter };
  for (const reg of [registerPublic, registerAuth, registerUser, registerClinician, registerPro, registerAdmin, registerPrivacy]) reg(router, deps);
  return router;
}

function textHead(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(msg);
}

function serveFile(req, res, file, stat) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  const revalidate = ['.html', '.js', '.mjs', '.css', '.json'].includes(ext);
  const headers = { 'Content-Type': type, 'Content-Length': stat.size, ETag: etag, 'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=86400', 'Last-Modified': stat.mtime.toUTCString() };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': headers['Cache-Control'] }); return res.end(); }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

function resolveStatic(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  const full = path.resolve(PUBLIC_DIR, '.' + path.posix.normalize('/' + p));
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) return null;
  if (path.relative(PUBLIC_DIR, full).split(path.sep).some((seg) => seg.startsWith('.'))) return null; // no dotfiles
  return full;
}

function serveIndex(req, res, extraHead = '') {
  const file = path.join(PUBLIC_DIR, 'index.html');
  let html;
  try { html = fs.readFileSync(file, 'utf8'); } catch { return textHead(res, 404, 'Not found'); }
  if (extraHead) html = html.includes('</head>') ? html.replace('</head>', `${extraHead}\n</head>`) : extraHead + html;
  const buf = Buffer.from(html);
  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': buf.length, 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function snapshotMeta(slug) {
  if (!/^[a-z0-9]{6,16}$/i.test(slug)) return '';
  const s = get('SELECT scores FROM snapshot_shares WHERE slug=?', slug);
  if (!s) return '';
  const dims = (() => { try { return Object.fromEntries(db.prepare('SELECT key, label FROM wellness_dimensions').all().map((d) => [d.key, d.label])); } catch { return {}; } })();
  const scores = j(s.scores, {});
  const text = Object.entries(scores).filter(([, v]) => Number.isInteger(v)).map(([k, v]) => `${dims[k] || k} ${v}`).join(' · ');
  const title = 'My SVARA snapshot: my inner rhythm';
  const desc = `${text}. A snapshot of what I reported. Wellness reflection, not medical advice.`;
  const url = `${config.publicUrl}/s/${slug}`;
  return [
    `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="SVARA">`,
    `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`, `<meta property="og:url" content="${esc(url)}">`,
    `<meta name="twitter:card" content="summary">`, `<meta name="twitter:title" content="${esc(title)}">`, `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="description" content="${esc(desc)}">`,
  ].join('\n');
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return textHead(res, 405, 'Method not allowed'); }
  const pathname = url.pathname;
  const share = /^\/s\/([^/]+)\/?$/.exec(pathname);
  if (share) { let slug = ''; try { slug = decodeURIComponent(share[1]); } catch { /* ignore */ } return serveIndex(req, res, snapshotMeta(slug)); }
  const full = resolveStatic(pathname);
  if (!full) return textHead(res, 400, 'Bad request');
  let stat = null;
  try { stat = fs.statSync(full); } catch { /* missing */ }
  if (stat?.isDirectory()) { const idx = path.join(full, 'index.html'); try { const s2 = fs.statSync(idx); if (pathname === '/' || s2) return pathname === '/' ? serveIndex(req, res) : serveFile(req, res, idx, s2); } catch { /* fallthrough */ } stat = null; }
  if (stat?.isFile()) return serveFile(req, res, full, stat);
  if (path.extname(pathname)) return textHead(res, 404, 'Not found'); // missing asset: don't SPA-fallback
  return serveIndex(req, res);
}

export function createApp() {
  const limiter = createLimiter();
  const router = buildRouter(limiter);
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomBytes(6).toString('hex');
    res.setHeader('X-Request-Id', requestId);
    applySecurityHeaders(res);
    req.ip = clientIp(req);
    try {
      let url;
      try { url = new URL(req.url, 'http://localhost'); } catch { return textHead(res, 400, 'Bad request'); }
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) await dispatchApi(router, req, res, url, { limiter, requestId });
      else {
        const rl = await limiter.check('default', req.ip);
        if (!rl.allowed) { res.setHeader('Retry-After', String(rl.retryAfter)); return textHead(res, 429, 'Too many requests'); }
        serveStatic(req, res, url);
      }
    } catch (err) {
      if (res.headersSent) { res.destroy(); return; }
      handleError(err, res, requestId);
    }
  });
  server.requestTimeout = 30_000; server.headersTimeout = 15_000; server.keepAliveTimeout = 5_000;
  return { server, limiter };
}

export function start() {
  const ran = migrate();
  if (ran.length) console.log(`[svara] applied migrations: ${ran.join(', ')}`);
  const { server, limiter } = createApp();
  server.listen(config.port, () => {
    const addr = server.address();
    console.log(`[svara] listening on http://localhost:${addr.port}  (${config.isProd ? 'production' : 'development'})`);
    if (config.demoMode) console.log('[svara] DEMO_MODE on. Demo logins (password SvaraDemo!2025): maya@svara.demo, arjun@svara.demo, neha@svara.demo, rohan@svara.demo, clinician@svara.demo, admin@svara.demo - or use /api/demo/start.');
  });
  let closing = false;
  const shutdown = (sig) => {
    if (closing) return; closing = true;
    console.log(`[svara] ${sig} received, shutting down`);
    const force = setTimeout(() => process.exit(1), 10_000); force.unref();
    server.close(() => { try { limiter.store.close?.(); db.close(); } catch { /* ignore */ } process.exit(0); });
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
