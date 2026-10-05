import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config.js';
import { all, get, run, tx, now } from '../lib/db.js';
import { audit, verifyPassword, anonId, sessionCookie } from '../lib/auth.js';
import { httpError } from '../lib/http.js';
import { S, validate } from '../lib/validate.js';
import { latestConsents, recordConsent } from './_shared.js';

const REQ = { role: 'USER' };

const COLLECTED = [
  { what: 'Account details (email, hashed password)', why: 'To sign you in and keep your account secure.', who: 'You and SVARA systems only.', retention: 'Until you delete your account.' },
  { what: 'Wellness check-ins and notes you write', why: 'To show your own rhythm and trends over time.', who: 'You. Shared with a clinician only if you choose to.', retention: 'Until you delete them or your account.' },
  { what: 'Profile, goals and preferences', why: 'To personalise questions and suggestions.', who: 'You.', retention: 'Until you delete your account.' },
  { what: 'Guide conversations', why: 'To give relevant, observational answers about your reported data.', who: 'You. Processed by an external AI model only if you allow AI processing and it is enabled.', retention: 'Until you delete the conversation or your account.' },
  { what: 'Clinician reports you choose to share', why: 'To let a clinician review a snapshot you consented to.', who: 'The assigned clinician, until you revoke access.', retention: 'Until you delete your account.' },
  { what: 'Anonymous product analytics', why: 'To understand how the app is used. Uses a hashed identifier, no personal details.', who: 'SVARA team.', retention: '12 months.' },
  { what: 'Access log entries', why: 'To show you who accessed your data and to keep the service secure.', who: 'You (as roles), and security administrators.', retention: 'Kept in anonymised form after account deletion.' },
];
const STATEMENTS = [
  'SVARA is a wellness platform. It is not a medical service and does not diagnose, treat or prescribe.',
  'You control sharing. Clinician access requires your explicit consent each time and can be revoked at any time.',
  'You can export everything we hold about you, or delete your account and data, from this page.',
  'Aggregate scores you choose to share through a link contain no name, email or notes.',
];

const USER_TABLES = [
  ['user_profiles', 'user_id'], ['consents', 'user_id'], ['wellness_goals', 'user_id'], ['check_ins', 'user_id'], ['daily_context', 'user_id'],
  ['wellness_scores', 'user_id'], ['trend_snapshots', 'user_id'], ['routine_activity', 'user_id'], ['weekly_reports', 'user_id'],
  ['ai_conversations', 'user_id'], ['clinician_assignments', 'user_id'], ['clinician_reports', 'user_id'], ['clinician_notes', 'user_id'],
  ['notifications', 'user_id'], ['safety_events', 'user_id'], ['audit_logs', 'subject_user_id'],
];

export default function register(r, { limiter }) {
  r.get('/api/privacy', REQ, ({ user }) => ({
    collected: COLLECTED,
    consents: latestConsents(user.id),
    sharing: all('SELECT r.id, r.status, r.range_days, r.created_at, r.revoked_at, c.display_name clinician_name FROM clinician_reports r JOIN clinicians c ON c.id=r.clinician_id WHERE r.user_id=? ORDER BY r.created_at DESC', user.id),
    retention: 'Your data is kept until you delete it or your account. Anonymous analytics are kept for 12 months.',
    statements: STATEMENTS,
  }));

  r.put('/api/privacy/consents', REQ, ({ user, body, req }) => {
    const v = validate(body, { ai_processing: S.bool(), marketing: S.bool(), analytics: S.bool() });
    const cur = latestConsents(user.id);
    for (const [type, granted] of Object.entries(v)) {
      if (cur[type]?.granted === granted) continue;
      recordConsent(user.id, type, granted, { source: 'privacy_page' });
      audit(req, 'consent_change', { targetType: 'consent', targetId: type, subjectUserId: user.id, detail: { granted } });
    }
    return { consents: latestConsents(user.id) };
  });

  r.get('/api/privacy/export', REQ, ({ user, req, res }) => {
    const out = { exported_at: now(), format: 'svara-export-v1' };
    out.users = all('SELECT id, email, role, status, is_demo, auth_provider, created_at, updated_at FROM users WHERE id=?', user.id);
    out.sessions = all('SELECT id, user_agent, created_at, expires_at FROM sessions WHERE user_id=?', user.id);
    for (const [table, col] of USER_TABLES) out[table] = all(`SELECT * FROM ${table} WHERE ${col}=?`, user.id);
    out.ai_messages = all('SELECT m.* FROM ai_messages m JOIN ai_conversations c ON c.id=m.conversation_id WHERE c.user_id=?', user.id);
    out.analytics_events = all('SELECT id, name, props, created_at FROM analytics_events WHERE anon_id=?', anonId(user.id));
    out.routines_referenced = all('SELECT DISTINCT r.id, r.name FROM routines r JOIN routine_activity a ON a.routine_id=r.id WHERE a.user_id=?', user.id);
    // internal file paths are not part of the export; documents are listed by name only
    out.clinician_notes = out.clinician_notes.map(({ file_path, ...n }) => n);
    audit(req, 'data_export', { subjectUserId: user.id });
    const body = JSON.stringify(out, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body),
      'Content-Disposition': 'attachment; filename="svara-export.json"', 'Cache-Control': 'no-store',
    });
    res.end(body);
    return undefined;
  });

  r.post('/api/privacy/delete', { ...REQ, bucket: 'auth' }, async ({ user, body, req, res }) => {
    const { password } = validate(body, { password: S.str({ required: true, max: 200, trim: false }) });
    const key = `delete:${user.id}`;
    if (!(await limiter.peekKey(key, 5, 15 * 60_000)).allowed) throw httpError(429, 'rate_limited', 'Too many attempts. Please try again later.');
    const row = get('SELECT password_hash FROM users WHERE id=?', user.id);
    if (!verifyPassword(password, row?.password_hash)) {
      await limiter.hitKey(key, 5, 15 * 60_000);
      throw httpError(403, 'invalid_password', 'That password is not correct.', { password: 'Incorrect password.' });
    }
    const files = all('SELECT file_path FROM clinician_notes WHERE user_id=? AND file_path IS NOT NULL', user.id).map((f) => f.file_path);
    const anon = anonId(user.id);
    tx(() => {
      // keep audit entries but anonymise them
      run("UPDATE audit_logs SET actor_id=NULL, ip_hash=NULL, detail='{}', updated_at=? WHERE actor_id=?", now(), user.id);
      run("UPDATE audit_logs SET subject_user_id=NULL, updated_at=? WHERE subject_user_id=?", now(), user.id);
      run('UPDATE safety_events SET excerpt=NULL, user_id=NULL, updated_at=? WHERE user_id=?', now(), user.id);
      run('DELETE FROM analytics_events WHERE anon_id=?', anon);
      run('DELETE FROM clinician_notes WHERE user_id=?', user.id);
      run('DELETE FROM clinician_reports WHERE user_id=?', user.id);
      run('DELETE FROM sessions WHERE user_id=?', user.id);
      run('DELETE FROM users WHERE id=?', user.id); // cascades profile, consents, check-ins, conversations, etc.
    });
    for (const f of files) {
      const full = path.join(config.uploadDir, path.basename(f));
      try { fs.unlinkSync(full); } catch { /* already gone */ }
    }
    audit({ user: null, ip: req.ip }, 'account_deleted', { targetType: 'user' });
    res.setHeader('Set-Cookie', sessionCookie('', true));
    return { ok: true };
  });

  r.get('/api/privacy/access-history', REQ, ({ user }) => ({
    entries: all('SELECT created_at "at", actor_role, action FROM audit_logs WHERE subject_user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 200', user.id)
      .map((e) => ({ at: e.at, actor_role: e.actor_role || 'SYSTEM', action: e.action })),
  }));
}
