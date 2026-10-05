import crypto from 'node:crypto';
import { config } from './config.js';
import { loadSession } from './auth.js';

export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status; this.code = code; this.fields = fields;
  }
}
export const httpError = (status, code, message, fields) => new HttpError(status, code, message, fields);

/** Wrap a non-default status / headers response from a handler. */
export class Reply {
  constructor(status, body, headers = {}) { this.status = status; this.body = body; this.headers = headers; }
}
export const reply = (status, body, headers) => new Reply(status, body, headers);

export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
if (config.isProd) SECURITY_HEADERS['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

export function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

export function sendJson(res, status, data, headers = {}) {
  if (res.headersSent || res.writableEnded) return;
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body), ...headers,
  });
  res.end(body);
}

export function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true') {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket?.remoteAddress || '';
}

const ROLE_ANY = 'ANY';
const MAX_BODY = 1024 * 1024;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { req.resume(); return reject(httpError(413, 'payload_too_large', 'Request body is too large.')); }
    const chunks = []; let size = 0; let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; chunks.length = 0; reject(httpError(413, 'payload_too_large', 'Request body is too large.')); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

function compile(pattern) {
  const keys = [];
  const src = pattern.split('/').map((seg) => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { re: new RegExp(`^${src}/?$`), keys };
}

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, opts, handler) {
    if (typeof opts === 'function') { handler = opts; opts = {}; }
    this.routes.push({ method, pattern, ...compile(pattern), opts, handler });
    return this;
  }
  get(p, o, h) { return this.add('GET', p, o, h); }
  post(p, o, h) { return this.add('POST', p, o, h); }
  put(p, o, h) { return this.add('PUT', p, o, h); }
  patch(p, o, h) { return this.add('PATCH', p, o, h); }
  delete(p, o, h) { return this.add('DELETE', p, o, h); }

  match(method, pathname) {
    let pathMatched = false; const allow = new Set();
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true; allow.add(r.method);
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const params = {};
      try { r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); } catch { return { badPath: true }; }
      return { route: r, params };
    }
    return { pathMatched, allow: [...allow] };
  }
}

/**
 * Dispatch an /api request. opts: { role: 'USER'|'CLINICIAN'|'ADMIN'|['USER',..]|'ANY'|undefined(public),
 *   bucket: 'auth'|'heavy'|undefined, maxBody, csrf: false (exempt) }
 */
export async function dispatchApi(router, req, res, url, { limiter, requestId }) {
  const method = req.method;
  const pathname = url.pathname;
  const m = router.match(method, pathname);
  const bucket = m.route?.opts.bucket || 'default';
  const rl = await limiter.check(bucket, req.ip);
  res.setHeader('X-RateLimit-Limit', String(rl.limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return sendJson(res, 429, { error: { code: 'rate_limited', message: 'Too many requests. Please slow down and try again shortly.' } });
  }
  if (m.badPath) return sendJson(res, 400, { error: { code: 'bad_request', message: 'Malformed path.' } });
  if (!m.route) {
    if (m.pathMatched) return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, { Allow: m.allow.join(', ') });
    return sendJson(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
  }
  const { route, params } = m;
  const { opts } = route;

  const session = loadSession(req);
  req.user = session?.user || null;
  const roles = opts.role === undefined ? null : Array.isArray(opts.role) ? opts.role : [opts.role];
  if (roles) {
    if (!req.user) return sendJson(res, 401, { error: { code: 'unauthenticated', message: 'Please sign in to continue.' } });
    if (!roles.includes(ROLE_ANY) && !roles.includes(req.user.role)) {
      return sendJson(res, 403, { error: { code: 'forbidden', message: 'You do not have access to this resource.' } });
    }
  }
  const safe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  if (!safe && session && opts.csrf !== false) {
    const sent = String(req.headers['x-csrf-token'] || '');
    const a = Buffer.from(sent); const b = Buffer.from(session.csrf);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return sendJson(res, 403, { error: { code: 'csrf_invalid', message: 'Security token missing or invalid. Please refresh and try again.' } });
    }
  }
  let body = {};
  if (!safe) {
    const buf = await readBody(req, opts.maxBody || MAX_BODY);
    if (buf.length) {
      try { body = JSON.parse(buf.toString('utf8')); } catch { throw httpError(400, 'invalid_json', 'Request body must be valid JSON.'); }
      if (body === null || typeof body !== 'object') throw httpError(400, 'invalid_json', 'Request body must be a JSON object.');
    }
  }
  const query = Object.fromEntries(url.searchParams.entries());
  const ctx = { req, res, params, query, body, user: req.user, session, ip: req.ip, requestId, handled: false };
  const out = await route.handler(ctx);
  if (ctx.handled || res.writableEnded) return;
  if (out instanceof Reply) return sendJson(res, out.status, out.body, out.headers);
  if (out === undefined) return sendJson(res, 204, undefined);
  return sendJson(res, 200, out);
}

export function handleError(err, res, requestId) {
  const status = Number(err?.status);
  if (status >= 400 && status < 500) {
    const e = { code: err.code || (status === 404 ? 'not_found' : 'bad_request'), message: err.message || 'Request could not be completed.' };
    if (err.fields) e.fields = err.fields;
    if (err.violations) e.violations = err.violations;
    return sendJson(res, status, { error: e });
  }
  console.error(`[${requestId}] unhandled error:`, err?.stack || err);
  return sendJson(res, 500, { error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.', requestId } });
}
