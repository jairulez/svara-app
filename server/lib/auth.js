import crypto from 'node:crypto';
import { config } from './config.js';
import { get, run, insert, now } from './db.js';

// ---- passwords: scrypt with per-user random salt; plaintext is never stored or logged ----
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [alg, N, r, p, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: +N, r: +r, p: +p });
  const expected = Buffer.from(hashHex, 'hex');
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use a mix of letters and numbers.';
  return null;
}

// ---- sessions: opaque random token in HttpOnly cookie; only an HMAC of it is stored ----
const hmac = (v) => crypto.createHmac('sha256', config.appSecret).update(v).digest('hex');
export const anonId = (userId) => hmac('anon:' + userId).slice(0, 20);
export const ipHash = (ip) => hmac('ip:' + (ip || '')).slice(0, 16);
const SESSION_DAYS = 14;

export function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  insert('sessions', {
    user_id: userId, token_hash: hmac(token), csrf_token: crypto.randomBytes(24).toString('base64url'), ip_hash: ipHash(req.ip),
    user_agent: String(req.headers['user-agent'] || '').slice(0, 200),
    expires_at: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString(),
  });
  return token;
}
export function sessionCookie(token, clear = false) {
  const parts = [`svara_sid=${clear ? '' : token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`];
  if (config.isProd) parts.push('Secure');
  return parts.join('; ');
}
export function loadSession(req) {
  const m = /(?:^|;\s*)svara_sid=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = get(`SELECT s.id sid, s.csrf_token, s.expires_at, u.id, u.email, u.role, u.status, u.is_demo
                 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, hmac(m[1]));
  if (!s || s.status !== 'active' || s.expires_at < now()) return null;
  return { sessionId: s.sid, csrf: s.csrf_token, user: { id: s.id, email: s.email, role: s.role, is_demo: !!s.is_demo } };
}
export const destroySession = (sid) => run('DELETE FROM sessions WHERE id=?', sid);

// ---- Magic-link + OAuth architecture hooks (not enabled in the preview) ----
export const authProviders = {
  password: { enabled: true },
  magic_link: { enabled: false, note: 'Issue single-use HMAC-signed token (15 min TTL) → email via SMTP_URL → POST /api/auth/magic/verify creates session.' },
  google: { enabled: false, note: 'OIDC code flow: /api/auth/google/start → callback verifies id_token, upserts users(auth_provider=google).' },
};

export function audit(req, action, { targetType, targetId, subjectUserId, detail } = {}) {
  insert('audit_logs', {
    actor_id: req?.user?.id || null, actor_role: req?.user?.role || null, action,
    target_type: targetType || null, target_id: targetId || null, subject_user_id: subjectUserId || null,
    ip_hash: ipHash(req?.ip), detail: JSON.stringify(detail || {}),
  });
}
