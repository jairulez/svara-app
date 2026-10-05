import { config } from '../lib/config.js';
import { get, run, insert, tx, today } from '../lib/db.js';
import { hashPassword, verifyPassword, passwordProblem, createSession, sessionCookie, loadSession, destroySession, audit } from '../lib/auth.js';
import { httpError, reply } from '../lib/http.js';
import { S, validate } from '../lib/validate.js';
import { scoreAssessment } from '../engine/scoring.js';
import { recordCheckIn } from '../engine/trends.js';
import { getProfile, recordConsent, track } from './_shared.js';

// Dummy hash so unknown-email logins cost the same as real ones (timing-safe).
const DUMMY_HASH = hashPassword('dummy-password-for-timing-0');

const PERSONAS = {
  A: { email: 'maya@svara.demo', name: 'Maya', blurb: 'High energy, low relaxation, heavy workload.' },
  B: { email: 'arjun@svara.demo', name: 'Arjun', blurb: 'Good sleep, variable motivation.' },
  C: { email: 'neha@svara.demo', name: 'Neha', blurb: 'Variable sleep, high work stress.' },
  D: { email: 'rohan@svara.demo', name: 'Rohan', blurb: 'A balanced rhythm.' },
  clinician: { email: 'clinician@svara.demo', name: 'Dr. Demo Clinician', blurb: 'Review consented reports (demo).' },
  admin: { email: 'admin@svara.demo', name: 'Demo Admin', blurb: 'Manage content, rules and settings (demo).' },
};

function startSession(res, user, req) {
  const token = createSession(user.id, req);
  res.setHeader('Set-Cookie', sessionCookie(token));
  return loadSession({ headers: { cookie: `svara_sid=${token}` } }).csrf;
}

export default function register(r, { limiter }) {
  r.post('/api/auth/signup', { bucket: 'auth', csrf: false }, async ({ req, res, body, ip }) => {
    let v;
    try { v = validate(body, {
      email: S.email({ required: true }),
      password: S.str({ required: true, max: 200, trim: false }),
      name: S.str({ max: 80 }),
      assessment: S.obj({ answers: S.arr(S.obj({ question_id: S.str({ required: true, max: 64 }), value: S.int({ required: true, min: 1, max: 5 }) }), { required: true, min: 1, max: 30 }) }),
      consents: S.obj({ terms: S.bool({ required: true }), privacy: S.bool({ required: true }) }, { required: true }),
    }); } catch (e) {
      if (e.fields && !e.fields.password && typeof body?.password === 'string') { const pp = passwordProblem(body.password); if (pp) e.fields.password = pp; }
      throw e;
    }
    const fields = {};
    const pw = passwordProblem(v.password); if (pw) fields.password = pw;
    if (v.consents.terms !== true) fields['consents.terms'] = 'You need to accept the Terms to continue.';
    if (v.consents.privacy !== true) fields['consents.privacy'] = 'You need to accept the Privacy Policy to continue.';
    if (Object.keys(fields).length) throw httpError(400, 'validation_error', 'Please check the highlighted fields.', fields);
    if (v.assessment) { try { scoreAssessment(v.assessment.answers); } catch (e) { throw httpError(400, 'invalid_answers', e.message || 'Invalid assessment answers.'); } }

    if (get('SELECT 1 x FROM users WHERE email=?', v.email)) {
      hashPassword(v.password); // keep timing similar
      throw httpError(409, 'conflict', 'We could not create an account with those details. If you already have an account, try signing in.');
    }
    const hash = hashPassword(v.password);
    const user = tx(() => {
      const u = insert('users', { email: v.email, password_hash: hash, role: 'USER', status: 'active', is_demo: 0, auth_provider: 'password' });
      insert('user_profiles', { user_id: u.id, name: v.name || null, timezone: 'UTC', lifestyle: '{}', preferences: '{}', onboarding_completed: 0 });
      recordConsent(u.id, 'terms', true, { source: 'signup' });
      recordConsent(u.id, 'privacy', true, { source: 'signup' });
      return u;
    });
    if (v.assessment) {
      const day = today();
      try { for (const a of v.assessment.answers) recordCheckIn(user.id, { question_id: a.question_id, raw_value: a.value, kind: 'assessment', day }); }
      catch (e) { console.error('assessment save failed:', e.message); }
    }
    const csrf = startSession(res, user, req);
    audit({ user: { id: user.id, role: 'USER' }, ip }, 'signup', { targetType: 'user', targetId: user.id, subjectUserId: user.id });
    track('account_created', { userId: user.id, ip });
    return reply(201, { user: { id: user.id, email: user.email, role: user.role }, csrf });
  });

  r.post('/api/auth/login', { bucket: 'auth', csrf: false }, async ({ req, res, body, ip }) => {
    const v = validate(body, { email: S.email({ required: true }), password: S.str({ required: true, max: 200, trim: false }) });
    const key = `login:${v.email}`;
    const WIN = 15 * 60_000;
    if (!(await limiter.peekKey(key, 8, WIN)).allowed) throw httpError(429, 'rate_limited', 'Too many sign-in attempts. Please try again later.');
    const u = get('SELECT id, email, role, status, is_demo, password_hash FROM users WHERE email=?', v.email);
    const ok = verifyPassword(v.password, u?.password_hash || DUMMY_HASH);
    if (!u || !u.password_hash || !ok || u.status !== 'active') {
      await limiter.hitKey(key, 8, WIN);
      audit({ ip }, 'login_failed', { detail: {} });
      throw httpError(401, 'invalid_credentials', 'Invalid email or password');
    }
    await limiter.resetKey(key);
    const old = loadSession(req); if (old) destroySession(old.sessionId);
    const csrf = startSession(res, u, req);
    audit({ user: u, ip }, 'login', { targetType: 'user', targetId: u.id, subjectUserId: u.id });
    return { user: { id: u.id, email: u.email, role: u.role, is_demo: !!u.is_demo }, csrf };
  });

  r.post('/api/auth/logout', { csrf: false }, ({ req, res, ip }) => {
    const s = loadSession(req);
    if (s) {
      // logout only needs to be authenticated by the cookie itself; still require CSRF when a session exists
      const sent = String(req.headers['x-csrf-token'] || '');
      if (sent !== s.csrf) throw httpError(403, 'csrf_invalid', 'Security token missing or invalid. Please refresh and try again.');
      destroySession(s.sessionId);
      audit({ user: s.user, ip }, 'logout', { subjectUserId: s.user.id });
    }
    res.setHeader('Set-Cookie', sessionCookie('', true));
    return { ok: true };
  });

  r.get('/api/auth/me', ({ session }) => {
    if (!session) return { user: null };
    return { user: session.user, profile: getProfile(session.user.id), csrf: session.csrf };
  });

  r.get('/api/demo/personas', () => {
    if (!config.demoMode) throw httpError(404, 'not_found', 'Not found.');
    return Object.entries(PERSONAS).map(([persona, p]) => ({ persona, name: p.name, blurb: p.blurb }));
  });

  r.post('/api/demo/start', { bucket: 'auth', csrf: false }, ({ req, res, body, ip }) => {
    if (!config.demoMode) throw httpError(404, 'not_found', 'Not found.');
    const { persona } = validate(body, { persona: S.enum(Object.keys(PERSONAS), { required: true }) });
    const u = get('SELECT id, email, role, is_demo, status FROM users WHERE email=? AND is_demo=1 AND status=?', PERSONAS[persona].email, 'active');
    if (!u) throw httpError(503, 'demo_unavailable', 'Demo data has not been loaded yet.');
    const old = loadSession(req); if (old) destroySession(old.sessionId);
    const csrf = startSession(res, u, req);
    audit({ user: u, ip }, 'demo_start', { subjectUserId: u.id, detail: { persona } });
    return { user: { id: u.id, email: u.email, role: u.role, is_demo: true }, csrf };
  });
}
