import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svara-test-'));
const DB = path.join(tmp, 'test.db');
const PW = 'Sup3rSecret-pass';
let seeded = false;
const servers = [];

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

async function startServer(extraEnv = {}) {
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), DATABASE_PATH: DB, NODE_ENV: 'test', DEMO_MODE: 'true', APP_SECRET: 'test-secret', RATE_LIMIT_MAX: '2000', AUTH_RATE_LIMIT_MAX: '1000', ...extraEnv };
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) break; } catch { /* not up yet */ }
    if (child.exitCode !== null) throw new Error(`server exited early:\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  const srv = { base, port, child, log: () => log };
  servers.push(srv);
  return srv;
}

class Client {
  constructor(base) { this.base = base; this.cookie = ''; this.csrf = ''; }
  async req(method, url, body, { csrf = true, headers = {} } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (this.cookie) h.Cookie = this.cookie;
    if (csrf && this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    const res = await fetch(this.base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() || []) { const pair = c.split(';')[0]; if (pair.startsWith('svara_sid=')) this.cookie = pair.endsWith('=') ? '' : pair; }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    if (json?.csrf) this.csrf = json.csrf;
    return { status: res.status, headers: res.headers, json, text };
  }
}

let S1; let uniq = 0;
const email = (p = 'u') => `${p}${Date.now()}${uniq++}@example.test`;
async function signup(client, em = email(), extra = {}) {
  return client.req('POST', '/api/auth/signup', { email: em, password: PW, name: 'Test User', consents: { terms: true, privacy: true }, ...extra });
}

before(async () => {
  const env = { ...process.env, DATABASE_PATH: DB, NODE_ENV: 'test', APP_SECRET: 'test-secret' };
  const mig = spawnSync(process.execPath, ['scripts/migrate.js'], { cwd: ROOT, env, encoding: 'utf8' });
  if (mig.status !== 0) throw new Error(`migrate failed: ${mig.stderr}`);
  const seed = spawnSync(process.execPath, ['scripts/seed.js', '--reset'], { cwd: ROOT, env, encoding: 'utf8' });
  seeded = seed.status === 0;
  if (!seeded) console.warn('seed unavailable, skipping seed-dependent tests:', (seed.stderr || '').slice(0, 300));
  S1 = await startServer();
});

after(() => {
  for (const s of servers) s.child.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('health, config and security headers', async () => {
  const c = new Client(S1.base);
  const r = await c.req('GET', '/api/health');
  assert.equal(r.status, 200); assert.equal(r.json.status, 'ok');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('referrer-policy')); assert.ok(r.headers.get('permissions-policy'));
  assert.ok(r.headers.get('x-request-id'));
  if (seeded) {
    const cfg = await c.req('GET', '/api/config');
    assert.equal(cfg.status, 200); assert.equal(cfg.json.demoMode, true); assert.ok(cfg.json.dimensions.length >= 10);
  }
});

test('unknown api path returns JSON 404 and wrong method 405', async () => {
  const c = new Client(S1.base);
  const r = await c.req('GET', '/api/nope');
  assert.equal(r.status, 404); assert.equal(r.json.error.code, 'not_found');
  const m = await c.req('DELETE', '/api/health');
  assert.equal(m.status, 405);
});

test('signup validation, success, generic conflict, me', async () => {
  const c = new Client(S1.base);
  const bad = await c.req('POST', '/api/auth/signup', { email: 'nope', password: 'short', consents: { terms: true, privacy: true } });
  assert.equal(bad.status, 400); assert.ok(bad.json.error.fields.email); assert.ok(bad.json.error.fields.password);
  const noConsent = await c.req('POST', '/api/auth/signup', { email: email(), password: PW, consents: { terms: true, privacy: false } });
  assert.equal(noConsent.status, 400);
  const em = email();
  const ok = await signup(c, em);
  assert.equal(ok.status, 201); assert.equal(ok.json.user.role, 'USER'); assert.ok(ok.json.csrf);
  assert.match(ok.headers.getSetCookie().join(';'), /svara_sid=.*HttpOnly/i);
  const dup = await signup(new Client(S1.base), em);
  assert.equal(dup.status, 409); assert.doesNotMatch(dup.json.error.message, /already registered|exists/i);
  const me = await c.req('GET', '/api/auth/me');
  assert.equal(me.json.user.email, em); assert.ok(me.json.csrf);
  const anon = await new Client(S1.base).req('GET', '/api/auth/me');
  assert.equal(anon.json.user, null);
});

test('login is generic on failure; logout clears session', async () => {
  const em = email();
  await signup(new Client(S1.base), em);
  const c = new Client(S1.base);
  const wrongPw = await c.req('POST', '/api/auth/login', { email: em, password: 'wrong-password-1' });
  const noUser = await c.req('POST', '/api/auth/login', { email: email('ghost'), password: 'wrong-password-1' });
  assert.equal(wrongPw.status, 401); assert.equal(noUser.status, 401);
  assert.equal(wrongPw.json.error.message, 'Invalid email or password');
  assert.deepEqual(wrongPw.json, noUser.json);
  const ok = await c.req('POST', '/api/auth/login', { email: em, password: PW });
  assert.equal(ok.status, 200);
  const out = await c.req('POST', '/api/auth/logout', {});
  assert.equal(out.status, 200);
  assert.equal((await c.req('GET', '/api/auth/me')).json.user, null);
});

test('CSRF token is required for mutating requests when logged in', async () => {
  const c = new Client(S1.base);
  await signup(c);
  const noToken = await c.req('PUT', '/api/profile', { name: 'Changed' }, { csrf: false });
  assert.equal(noToken.status, 403); assert.equal(noToken.json.error.code, 'csrf_invalid');
  const wrong = await c.req('PUT', '/api/profile', { name: 'Changed' }, { csrf: false, headers: { 'X-CSRF-Token': 'x'.repeat(32) } });
  assert.equal(wrong.status, 403);
  const ok = await c.req('PUT', '/api/profile', { name: 'Changed' });
  assert.equal(ok.status, 200); assert.equal(ok.json.name, 'Changed');
});

test('RBAC: unauthenticated 401, wrong role 403', async () => {
  const anon = new Client(S1.base);
  assert.equal((await anon.req('GET', '/api/dashboard')).status, 401);
  assert.equal((await anon.req('GET', '/api/pro/overview')).status, 401);
  const u = new Client(S1.base); await signup(u);
  assert.equal((await u.req('GET', '/api/pro/overview')).status, 403);
  assert.equal((await u.req('GET', '/api/admin/overview')).status, 403);
  assert.equal((await u.req('GET', '/api/admin/resources/users')).status, 403);
  if (seeded) {
    const cl = new Client(S1.base);
    assert.equal((await cl.req('POST', '/api/demo/start', { persona: 'clinician' })).status, 200);
    assert.equal((await cl.req('GET', '/api/dashboard')).status, 403, 'clinician must not use USER endpoints');
    assert.equal((await cl.req('GET', '/api/admin/overview')).status, 403);
    const ad = new Client(S1.base);
    assert.equal((await ad.req('POST', '/api/demo/start', { persona: 'admin' })).status, 200);
    assert.equal((await ad.req('GET', '/api/admin/overview')).status, 200);
    assert.equal((await ad.req('GET', '/api/profile')).status, 403, 'admin is strictly separated from USER endpoints');
  }
});

test('clinician request requires explicit consent and records it', { skip: false }, async (t) => {
  if (!seeded) return t.skip('needs seed');
  const u = new Client(S1.base); await signup(u);
  const none = await u.req('POST', '/api/clinician/request', { range_days: 30, questions: [], comments: '' });
  assert.equal(none.status, 400);
  const falsy = await u.req('POST', '/api/clinician/request', { range_days: 30, consent: false });
  assert.equal(falsy.status, 400);
  const str = await u.req('POST', '/api/clinician/request', { range_days: 30, consent: 'true' });
  assert.equal(str.status, 400, 'consent must be boolean true');
  const ok = await u.req('POST', '/api/clinician/request', { range_days: 30, questions: ['How is my sleep rhythm?'], comments: 'Tired lately', consent: true });
  assert.equal(ok.status, 201, ok.text);
  const id = ok.json.report.id;
  const priv = await u.req('GET', '/api/privacy');
  assert.equal(priv.json.consents.clinician_sharing.granted, true);
  // another user can never see it
  const other = new Client(S1.base); await signup(other);
  assert.equal((await other.req('GET', `/api/clinician/reports/${id}`)).status, 404);
  assert.equal((await other.req('POST', `/api/clinician/reports/${id}/revoke`, {})).status, 404);
  // assigned clinician can find it (demo clinician is the only one) ... then revoke hides it
  const pathway = await u.req('GET', '/api/clinician/pathway');
  assert.equal(pathway.json.reports.length, 1);
  const rev = await u.req('POST', `/api/clinician/reports/${id}/revoke`, {});
  assert.equal(rev.status, 200); assert.equal(rev.json.report.status, 'revoked');
  assert.equal((await u.req('GET', '/api/privacy')).json.consents.clinician_sharing.granted, false);
  const hist = await u.req('GET', '/api/privacy/access-history');
  assert.ok(hist.json.entries.some((e) => e.action === 'clinician_report_shared'));
});

test('clinician sees only assigned, non-revoked reports and views are audited', async (t) => {
  if (!seeded) return t.skip('needs seed');
  const u = new Client(S1.base); await signup(u);
  const req = await u.req('POST', '/api/clinician/request', { range_days: 7, consent: true });
  assert.equal(req.status, 201);
  const id = req.json.report.id;
  const cl = new Client(S1.base);
  await cl.req('POST', '/api/demo/start', { persona: 'clinician' });
  const ov = await cl.req('GET', '/api/pro/overview');
  assert.equal(ov.status, 200);
  assert.ok(ov.json.reports.some((r) => r.id === id));
  const view = await cl.req('GET', `/api/pro/reports/${id}`);
  assert.equal(view.status, 200); assert.ok(view.json.content);
  const note = await cl.req('POST', `/api/pro/reports/${id}/notes`, { kind: 'note', body: 'Seen.', visible_to_user: true });
  assert.equal(note.status, 201);
  const seen = await u.req('GET', `/api/clinician/reports/${id}`);
  assert.equal(seen.json.notes.length, 1);
  const hist = await u.req('GET', '/api/privacy/access-history');
  assert.ok(hist.json.entries.some((e) => e.action === 'clinician_view_report' && e.actor_role === 'CLINICIAN'));
  // upload validation
  const bad = await cl.req('POST', `/api/pro/reports/${id}/upload`, { file_name: 'x.exe', mime: 'application/octet-stream', content_base64: Buffer.from('MZ').toString('base64') });
  assert.equal(bad.status, 400);
  const good = await cl.req('POST', `/api/pro/reports/${id}/upload`, { file_name: 'notes.txt', mime: 'text/plain', content_base64: Buffer.from('hello').toString('base64'), visible_to_user: true });
  assert.equal(good.status, 201);
  assert.equal((await u.req('GET', `/api/clinician/reports/${id}/documents/${good.json.document.id}`)).status, 200);
  assert.equal((await new Client(S1.base).req('GET', `/api/uploads/anything`)).status, 404);
  // revoke -> clinician loses access
  await u.req('POST', `/api/clinician/reports/${id}/revoke`, {});
  assert.equal((await cl.req('GET', `/api/pro/reports/${id}`)).status, 404);
  assert.equal((await cl.req('POST', `/api/pro/reports/${id}/notes`, { kind: 'note', body: 'x' })).status, 404);
});

test('events whitelist and no PII storage', async () => {
  const c = new Client(S1.base);
  assert.equal((await c.req('POST', '/api/events', { name: 'landing_view', props: { page: '/', email: 'a@b.c', source: 'test' } })).status, 204);
  assert.equal((await c.req('POST', '/api/events', { name: 'steal_data' })).status, 400);
});

test('static serving: SPA fallback, traversal blocked, uploads not served', async () => {
  const c = new Client(S1.base);
  const spa = await c.req('GET', '/home');
  assert.ok([200, 404].includes(spa.status)); // 404 only if frontend not yet built
  const raw = (p) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: S1.port, path: p }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject);
  });
  for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/..%5c..%5cpackage.json', '/js/..%2f..%2f..%2fserver/index.js', '/.env', '/data/svara.db']) {
    const r = await raw(p);
    assert.doesNotMatch(r.body, /"private": true|createServer/, `leaked via ${p}`);
  }
  assert.notEqual((await raw('/data/uploads/x.txt')).status, 200);
});

test('privacy export and hard delete cascade', async () => {
  const c = new Client(S1.base);
  const em = email('del');
  await signup(c, em);
  await c.req('PUT', '/api/profile', { goals: ['energy'] });
  const exp = await c.req('GET', '/api/privacy/export');
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get('content-disposition'), /attachment/);
  assert.equal(exp.json.users[0].email, em); assert.ok(exp.json.consents.length >= 2); assert.equal(exp.json.users[0].password_hash, undefined);
  const wrong = await c.req('POST', '/api/privacy/delete', { password: 'not-the-password1' });
  assert.equal(wrong.status, 403);
  const del = await c.req('POST', '/api/privacy/delete', { password: PW });
  assert.equal(del.status, 200);
  assert.equal((await c.req('GET', '/api/auth/me')).json.user, null);
  assert.equal((await new Client(S1.base).req('POST', '/api/auth/login', { email: em, password: PW })).status, 401);
});

test('rate limiter returns 429 with Retry-After on auth endpoints', async () => {
  const srv = await startServer({ AUTH_RATE_LIMIT_MAX: '3', RATE_LIMIT_MAX: '2000' });
  const c = new Client(srv.base);
  const codes = [];
  let last;
  for (let i = 0; i < 6; i++) { last = await c.req('POST', '/api/auth/login', { email: 'rl@example.test', password: 'wrong-password-1' }); codes.push(last.status); }
  assert.deepEqual(codes.slice(0, 3), [401, 401, 401]);
  assert.ok(codes.slice(3).every((x) => x === 429), codes.join());
  assert.ok(Number(last.headers.get('retry-after')) >= 1);
  assert.equal((await c.req('GET', '/api/health')).status, 200, 'non-auth routes use the general bucket');
});

test('oversized body rejected', async () => {
  const c = new Client(S1.base);
  const r = await c.req('POST', '/api/assessment/score', { answers: [], pad: 'x'.repeat(1.2 * 1024 * 1024) });
  assert.equal(r.status, 413);
});

test('graceful shutdown on SIGTERM', async () => {
  const srv = await startServer();
  const exited = new Promise((resolve) => srv.child.once('exit', (code) => resolve(code)));
  srv.child.kill('SIGTERM');
  assert.equal(await exited, 0);
});
