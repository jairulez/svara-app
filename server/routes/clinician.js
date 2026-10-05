import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config.js';
import { all, get, run, insert, update, setting, now, tx } from '../lib/db.js';
import { audit } from '../lib/auth.js';
import { httpError, reply } from '../lib/http.js';
import { S, validate } from '../lib/validate.js';
import { buildClinicianReport } from '../engine/reports.js';
import { notify } from '../engine/notifications.js';
import { recordConsent, track, asObj } from './_shared.js';

const REQ = { role: 'USER' };
export const MIME_BY_EXT = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain; charset=utf-8' };

export function sendUpload(res, note, filename) {
  const base = path.basename(String(note.file_path || ''));
  const full = path.join(config.uploadDir, base);
  if (!base || !full.startsWith(config.uploadDir + path.sep) || !fs.existsSync(full)) throw httpError(404, 'not_found', 'File not found.');
  const ext = path.extname(base).slice(1).toLowerCase();
  const buf = fs.readFileSync(full);
  res.writeHead(200, {
    'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream', 'Content-Length': buf.length,
    'Content-Disposition': `attachment; filename="${String(filename || 'document').replace(/[^\w. -]/g, '_')}"`,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  });
  res.end(buf);
}

const publicReport = (r) => ({ id: r.id, status: r.status, range_days: r.range_days, scheduled_for: r.scheduled_for, revoked_at: r.revoked_at, created_at: r.created_at, updated_at: r.updated_at });

export default function register(r) {
  r.get('/api/clinician/pathway', REQ, ({ user }) => ({
    reports: all(`SELECT r.*, c.display_name clinician_name FROM clinician_reports r JOIN clinicians c ON c.id=r.clinician_id WHERE r.user_id=? ORDER BY r.created_at DESC`, user.id)
      .map((x) => ({ ...publicReport(x), clinician_name: x.clinician_name })),
    clinicians: all(`SELECT c.display_name, c.specialty, c.is_demo FROM clinicians c JOIN users u ON u.id=c.user_id WHERE c.active=1 AND u.status='active' ORDER BY c.display_name`).map((c) => ({ ...c, is_demo: !!c.is_demo })),
    ranges: [7, 30, 90, null],
  }));

  r.post('/api/clinician/request', REQ, ({ user, body, req, ip }) => {
    if (!setting('features.clinician_pathway')) throw httpError(503, 'unavailable', 'The clinician pathway is not available right now.');
    // Explicit consent must be literally `true`; checked before anything else is built or stored.
    if (body?.consent !== true) throw httpError(400, 'consent_required', 'Please give explicit consent before sharing your report with a clinician.', { consent: 'Explicit consent is required.' });
    const v = validate(body, {
      range_days: S.int({ nullable: true }),
      questions: S.arr(S.str({ min: 1, max: 300 }), { max: 10 }),
      comments: S.str({ max: 2000 }),
    });
    const range = v.range_days ?? null;
    if (![7, 30, 90, null].includes(range)) throw httpError(400, 'validation_error', 'Invalid range.', { range_days: 'Must be 7, 30, 90 or null.' });
    const target = get(`SELECT c.id, c.user_id, c.display_name FROM clinicians c JOIN users u ON u.id=c.user_id
      LEFT JOIN clinician_reports r ON r.clinician_id=c.id AND r.status IN ('requested','scheduled','in_consultation')
      WHERE c.active=1 AND u.status='active' GROUP BY c.id ORDER BY COUNT(r.id) ASC, c.created_at ASC LIMIT 1`);
    if (!target) throw httpError(503, 'no_clinician', 'No clinician is available at the moment. Please try again later.');
    const content = buildClinicianReport(user.id, range, { questions: v.questions || [], comments: v.comments || '' });
    const report = tx(() => {
      const consent = recordConsent(user.id, 'clinician_sharing', true, { range_days: range, clinician_id: target.id });
      const rep = insert('clinician_reports', { user_id: user.id, clinician_id: target.id, range_days: range, content: JSON.stringify(content), status: 'requested', consent_id: consent.id });
      const asg = get('SELECT id FROM clinician_assignments WHERE clinician_id=? AND user_id=?', target.id, user.id);
      if (asg) update('clinician_assignments', asg.id, { status: 'active' });
      else insert('clinician_assignments', { clinician_id: target.id, user_id: user.id, status: 'active' });
      return rep;
    });
    audit(req, 'clinician_report_shared', { targetType: 'clinician_report', targetId: report.id, subjectUserId: user.id, detail: { range_days: range } });
    try { notify(user.id, 'clinician', 'Your clinician request was sent', 'Your consented summary was shared. You can revoke access at any time.', '/clinician'); } catch (e) { console.error('notify:', e.message); }
    track('clinician_requested', { userId: user.id, ip, props: { range_days: range ?? 0 } });
    track('clinician_report_shared', { userId: user.id, ip });
    return reply(201, { report: publicReport(report) });
  });

  const ownReport = (id, userId) => {
    const rep = get('SELECT * FROM clinician_reports WHERE id=? AND user_id=?', id, userId);
    if (!rep) throw httpError(404, 'not_found', 'Report not found.');
    return rep;
  };
  r.get('/api/clinician/reports/:id', REQ, ({ user, params }) => {
    const rep = ownReport(params.id, user.id);
    const notes = all("SELECT id, kind, body, file_name, created_at FROM clinician_notes WHERE report_id=? AND visible_to_user=1 ORDER BY created_at, rowid", rep.id);
    return { report: publicReport(rep), content: asObj(rep.content), notes };
  });
  r.get('/api/clinician/reports/:id/documents/:noteId', REQ, ({ user, params, res }) => {
    const rep = ownReport(params.id, user.id);
    const note = get("SELECT * FROM clinician_notes WHERE id=? AND report_id=? AND kind='document' AND visible_to_user=1", params.noteId, rep.id);
    if (!note) throw httpError(404, 'not_found', 'File not found.');
    sendUpload(res, note, note.file_name);
    return undefined;
  });
  r.post('/api/clinician/reports/:id/revoke', REQ, ({ user, params, req }) => {
    const rep = ownReport(params.id, user.id);
    if (rep.status !== 'revoked') {
      tx(() => {
        update('clinician_reports', rep.id, { status: 'revoked', revoked_at: now() });
        recordConsent(user.id, 'clinician_sharing', false, { report_id: rep.id });
      });
      audit(req, 'clinician_share_revoked', { targetType: 'clinician_report', targetId: rep.id, subjectUserId: user.id });
    }
    return { report: publicReport(ownReport(params.id, user.id)) };
  });
}
