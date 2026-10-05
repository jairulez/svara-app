import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../lib/config.js';
import { all, get, insert, update } from '../lib/db.js';
import { audit } from '../lib/auth.js';
import { httpError, reply } from '../lib/http.js';
import { S, validate } from '../lib/validate.js';
import { notify } from '../engine/notifications.js';
import { asObj } from './_shared.js';
import { sendUpload } from './clinician.js';

const REQ = { role: 'CLINICIAN' };
const MAX_UPLOAD = 2 * 1024 * 1024;
const EXT_MIME = { pdf: ['application/pdf'], png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], txt: ['text/plain'] };

function clinicianOf(user) {
  const c = get('SELECT * FROM clinicians WHERE user_id=? AND active=1', user.id);
  if (!c) throw httpError(403, 'forbidden', 'No active clinician profile.');
  return c;
}
/** Only reports assigned to this clinician, with an active assignment, and not revoked. 404 otherwise (no enumeration). */
function accessibleReport(id, clinician) {
  const rep = get(`SELECT r.* FROM clinician_reports r
    JOIN clinician_assignments a ON a.clinician_id=r.clinician_id AND a.user_id=r.user_id AND a.status='active'
    WHERE r.id=? AND r.clinician_id=? AND r.status!='revoked' AND r.revoked_at IS NULL`, id, clinician.id);
  if (!rep) throw httpError(404, 'not_found', 'Report not found.');
  return rep;
}
const magicOk = (ext, buf) => {
  if (ext === 'pdf') return buf.subarray(0, 5).toString('latin1') === '%PDF-';
  if (ext === 'png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === 'jpg' || ext === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === 'txt') return !buf.includes(0);
  return false;
};

export default function register(r) {
  r.get('/api/pro/overview', REQ, ({ user }) => {
    const c = clinicianOf(user);
    const reports = all(`SELECT r.id, r.status, r.range_days, r.created_at, r.scheduled_for, p.name user_name
      FROM clinician_reports r JOIN clinician_assignments a ON a.clinician_id=r.clinician_id AND a.user_id=r.user_id AND a.status='active'
      LEFT JOIN user_profiles p ON p.user_id=r.user_id
      WHERE r.clinician_id=? AND r.status!='revoked' AND r.revoked_at IS NULL ORDER BY r.created_at DESC LIMIT 200`, c.id)
      .map((x) => ({ ...x, user_name: x.user_name || 'Member' }));
    const counts = { requested: 0, scheduled: 0, in_consultation: 0, completed: 0 };
    for (const x of reports) if (x.status in counts) counts[x.status]++;
    return { counts, reports };
  });

  r.get('/api/pro/users', REQ, ({ user }) => {
    const c = clinicianOf(user);
    return {
      users: all(`SELECT r.user_id id, p.name, p.age_range, COUNT(r.id) report_count, MAX(r.created_at) latest_at
        FROM clinician_reports r JOIN clinician_assignments a ON a.clinician_id=r.clinician_id AND a.user_id=r.user_id AND a.status='active'
        LEFT JOIN user_profiles p ON p.user_id=r.user_id
        WHERE r.clinician_id=? AND r.status!='revoked' AND r.revoked_at IS NULL GROUP BY r.user_id ORDER BY latest_at DESC`, c.id)
        .map((u) => ({ ...u, name: u.name || 'Member' })),
    };
  });

  r.get('/api/pro/reports/:id', REQ, ({ user, params, req }) => {
    const c = clinicianOf(user);
    const rep = accessibleReport(params.id, c);
    audit(req, 'clinician_view_report', { targetType: 'clinician_report', targetId: rep.id, subjectUserId: rep.user_id });
    const profile = get('SELECT name, age_range FROM user_profiles WHERE user_id=?', rep.user_id) || {};
    const subject = get('SELECT is_demo FROM users WHERE id=?', rep.user_id);
    return {
      report: { id: rep.id, status: rep.status, range_days: rep.range_days, scheduled_for: rep.scheduled_for, created_at: rep.created_at },
      content: asObj(rep.content),
      user: { name: profile.name || 'Member', age_range: profile.age_range || '' },
      notes: all('SELECT id, kind, body, file_name, visible_to_user, created_at FROM clinician_notes WHERE report_id=? ORDER BY created_at, rowid', rep.id)
        .map((n) => ({ ...n, visible_to_user: !!n.visible_to_user })),
      demo: !!(c.is_demo || subject?.is_demo),
    };
  });

  r.post('/api/pro/reports/:id/status', REQ, ({ user, params, body, req }) => {
    const c = clinicianOf(user);
    const rep = accessibleReport(params.id, c);
    const v = validate(body, {
      status: S.enum(['scheduled', 'in_consultation', 'completed', 'closed'], { required: true }),
      scheduled_for: S.str({ max: 40 }),
    });
    if (v.scheduled_for && Number.isNaN(Date.parse(v.scheduled_for))) throw httpError(400, 'validation_error', 'Invalid date.', { scheduled_for: 'Enter a valid date and time.' });
    if (rep.status === 'closed') throw httpError(409, 'conflict', 'This report is closed.');
    const patch = { status: v.status };
    if (v.scheduled_for) patch.scheduled_for = new Date(v.scheduled_for).toISOString();
    update('clinician_reports', rep.id, patch);
    audit(req, 'clinician_status_change', { targetType: 'clinician_report', targetId: rep.id, subjectUserId: rep.user_id, detail: { status: v.status } });
    try { notify(rep.user_id, 'clinician', 'Update on your clinician request', `Status: ${v.status.replace('_', ' ')}.`, '/clinician'); } catch (e) { console.error('notify:', e.message); }
    return { report: { id: rep.id, status: v.status, scheduled_for: patch.scheduled_for ?? rep.scheduled_for } };
  });

  r.post('/api/pro/reports/:id/notes', REQ, ({ user, params, body, req }) => {
    const c = clinicianOf(user);
    const rep = accessibleReport(params.id, c);
    const v = validate(body, { kind: S.enum(['note', 'decision', 'next_step'], { required: true }), body: S.str({ required: true, min: 1, max: 4000 }), visible_to_user: S.bool({ default: false }) });
    const note = insert('clinician_notes', { report_id: rep.id, clinician_id: c.id, user_id: rep.user_id, kind: v.kind, body: v.body, visible_to_user: v.visible_to_user ? 1 : 0 });
    audit(req, 'clinician_note_added', { targetType: 'clinician_report', targetId: rep.id, subjectUserId: rep.user_id, detail: { kind: v.kind, visible: !!v.visible_to_user } });
    if (v.visible_to_user) { try { notify(rep.user_id, 'clinician', 'New message from your clinician', 'A note has been shared with you.', '/clinician'); } catch (e) { console.error('notify:', e.message); } }
    return reply(201, { note: { id: note.id, kind: note.kind, body: note.body, visible_to_user: !!v.visible_to_user, created_at: note.created_at } });
  });

  r.post('/api/pro/reports/:id/upload', { ...REQ, maxBody: 3 * 1024 * 1024 }, ({ user, params, body, req }) => {
    const c = clinicianOf(user);
    const rep = accessibleReport(params.id, c);
    const v = validate(body, {
      file_name: S.str({ required: true, min: 1, max: 120 }),
      mime: S.str({ required: true, max: 80 }),
      content_base64: S.str({ required: true, min: 4, max: 3 * 1024 * 1024, trim: false }),
      visible_to_user: S.bool({ default: false }),
    });
    const ext = path.extname(v.file_name).slice(1).toLowerCase();
    if (!EXT_MIME[ext]) throw httpError(400, 'invalid_file', 'Only PDF, PNG, JPG and TXT files are allowed.', { file_name: 'Unsupported file type.' });
    if (!EXT_MIME[ext].includes(v.mime.toLowerCase().split(';')[0])) throw httpError(400, 'invalid_file', 'File type does not match its extension.', { mime: 'Does not match extension.' });
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v.content_base64.replace(/\s/g, ''))) throw httpError(400, 'invalid_file', 'File content is not valid base64.', { content_base64: 'Invalid encoding.' });
    const buf = Buffer.from(v.content_base64, 'base64');
    if (!buf.length) throw httpError(400, 'invalid_file', 'File is empty.');
    if (buf.length > MAX_UPLOAD) throw httpError(413, 'payload_too_large', 'Files must be 2MB or smaller.');
    if (!magicOk(ext, buf)) throw httpError(400, 'invalid_file', 'File content does not match its type.', { content_base64: 'Content does not match type.' });
    fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
    const stored = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(config.uploadDir, stored), buf, { mode: 0o600 });
    const safeName = path.basename(v.file_name).replace(/[^\w. -]/g, '_').slice(0, 120);
    const note = insert('clinician_notes', { report_id: rep.id, clinician_id: c.id, user_id: rep.user_id, kind: 'document', file_name: safeName, file_path: stored, visible_to_user: v.visible_to_user ? 1 : 0 });
    audit(req, 'clinician_document_uploaded', { targetType: 'clinician_report', targetId: rep.id, subjectUserId: rep.user_id, detail: { bytes: buf.length, ext } });
    return reply(201, { document: { id: note.id, file_name: safeName, size: buf.length, visible_to_user: !!v.visible_to_user } });
  });

  r.get('/api/pro/reports/:id/documents/:noteId', REQ, ({ user, params, req, res }) => {
    const c = clinicianOf(user);
    const rep = accessibleReport(params.id, c);
    const note = get("SELECT * FROM clinician_notes WHERE id=? AND report_id=? AND kind='document'", params.noteId, rep.id);
    if (!note) throw httpError(404, 'not_found', 'File not found.');
    audit(req, 'clinician_document_download', { targetType: 'clinician_report', targetId: rep.id, subjectUserId: rep.user_id });
    sendUpload(res, note, note.file_name);
    return undefined;
  });
}
