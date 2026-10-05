import { all, get, run, insert, update, tx, j, now, DEFAULT_SETTINGS, setting, setSetting } from '../lib/db.js';
import { audit, hashPassword, passwordProblem } from '../lib/auth.js';
import { httpError, reply } from '../lib/http.js';
import { S, validate } from '../lib/validate.js';
import { checkText, checkProduct, checkContent } from '../engine/claims.js';
import { DIMENSIONS } from '../engine/scoring.js';
import * as integrations from '../integrations/index.js';

const REQ = { role: 'ADMIN' };
const str = (max, o = {}) => S.str({ max, ...o });
const strList = (maxItems = 20, maxLen = 300) => S.arr(S.str({ min: 1, max: maxLen }), { max: maxItems });
const regexOk = (p) => { try { new RegExp(p, 'i'); return true; } catch { return false; } };

/** Per-resource whitelist: only `fields` can ever be written. `json` columns are stored as JSON text. */
const RESOURCES = {
  users: {
    table: 'users', create: false, order: 'created_at DESC',
    select: `SELECT u.id, u.email, u.role, u.status, u.is_demo, u.auth_provider, u.created_at, p.name FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 500`,
    fields: { role: S.enum(['USER', 'CLINICIAN', 'ADMIN']), status: S.enum(['active', 'disabled']) },
  },
  clinicians: {
    table: 'clinicians', create: false,
    select: `SELECT c.id, c.user_id, c.display_name, c.specialty, c.licence_reference, c.bio, c.is_demo, c.active, c.created_at, u.email FROM clinicians c JOIN users u ON u.id=c.user_id ORDER BY c.display_name`,
    fields: { display_name: str(120, { min: 1 }), specialty: str(120), licence_reference: str(120), bio: str(1000), active: S.bool() },
  },
  products: {
    table: 'products', create: true, claim: 'product', json: ['ingredients', 'approved_claims', 'restricted_claims'],
    fields: {
      name: str(160, { min: 1 }), category: str(80), manufacturer: str(160), ingredients: strList(40, 120), formulation: str(120), description: str(2000),
      regulatory_category: str(120), regulatory_status: S.enum(['DEMO_NOT_APPROVED', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']), licence_reference: str(160),
      approved_claims: strList(20, 300), restricted_claims: strList(20, 300), required_disclaimer: str(600), lab_report_url: str(300), batch_information: str(300),
      price: S.num({ min: 0, max: 1e7 }), currency: str(3, { pattern: /^[A-Z]{3}$/ }), stock: S.int({ min: 0, max: 1e6 }), is_demo: S.bool(), active: S.bool(),
    },
    required: ['name'],
  },
  questions: {
    table: 'questions', create: true, json: ['options'],
    fields: {
      pool: S.enum(['assessment', 'daily']), dimension: S.enum(DIMENSIONS.map((d) => d.key)), question: str(300, { min: 5 }),
      response_type: S.enum(['scale5', 'slider', 'emoji', 'choice']), options: S.arr(S.str({ min: 1, max: 60 }), { min: 5, max: 5 }), reverse: S.bool(),
      sensitivity_level: S.enum(['low', 'medium', 'high']), allowed_frequency_days: S.int({ min: 1, max: 90 }), active: S.bool(), safety_category: str(60),
    },
    required: ['pool', 'dimension', 'question', 'response_type', 'options'],
  },
  routines: {
    table: 'routines', create: true, json: ['steps', 'source_metadata', 'dimensions'],
    fields: {
      name: str(120, { min: 1 }), goal: str(80, { min: 1 }), duration_min: S.int({ min: 1, max: 240 }), steps: strList(20, 300), frequency: str(80), source_metadata: S.json(),
      safety_notes: str(600), dimensions: S.arr(S.enum(DIMENSIONS.map((d) => d.key)), { max: 10 }), active: S.bool(),
    },
    required: ['name', 'goal', 'duration_min', 'steps', 'frequency'],
  },
  content: {
    table: 'content', create: true, claim: 'content',
    fields: {
      slug: str(80, { min: 3, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, patternMessage: 'Lowercase letters, numbers and hyphens.' }), title: str(160, { min: 1 }), category: str(60, { min: 1 }),
      summary: str(400), body: str(30000, { min: 1 }), read_minutes: S.int({ min: 1, max: 120 }), status: S.enum(['draft', 'published', 'blocked']), active: S.bool(),
    },
    required: ['slug', 'title', 'category', 'body'],
  },
  claim_rules: {
    table: 'claim_rules', create: true,
    fields: { label: str(120, { min: 1 }), pattern: str(300, { min: 1 }), severity: S.enum(['block', 'warn']), reason: str(300), active: S.bool() },
    required: ['label', 'pattern'], validatePatch: (v) => { if (v.pattern !== undefined && !regexOk(v.pattern)) throw httpError(400, 'validation_error', 'Invalid pattern.', { pattern: 'Not a valid regular expression.' }); },
  },
  safety_rules: {
    table: 'safety_rules', create: true,
    fields: { category: S.enum(['EMERGENCY', 'POTENTIAL_CRISIS', 'ADVERSE_REACTION', 'PRODUCT_DOSAGE', 'MEDICATION_QUESTION', 'MEDICAL_QUESTION']), label: str(120, { min: 1 }), pattern: str(300, { min: 1 }), active: S.bool() },
    required: ['category', 'label', 'pattern'], validatePatch: (v) => { if (v.pattern !== undefined && !regexOk(v.pattern)) throw httpError(400, 'validation_error', 'Invalid pattern.', { pattern: 'Not a valid regular expression.' }); },
  },
  dimensions: {
    table: 'wellness_dimensions', create: true,
    fields: { key: str(40, { min: 2, pattern: /^[a-z][a-z0-9_]*$/ }), label: str(60, { min: 1 }), description: str(300), in_snapshot: S.bool(), sort_order: S.int({ min: 0, max: 1000 }), active: S.bool() },
    required: ['key', 'label'], immutable: ['key'],
  },
};

function resourceOr404(name) {
  const res = Object.prototype.hasOwnProperty.call(RESOURCES, name) ? RESOURCES[name] : null;
  if (!res) throw httpError(404, 'not_found', 'Unknown resource.');
  return res;
}
const outRow = (res, row) => {
  const o = { ...row };
  for (const c of res.json || []) o[c] = j(o[c], c === 'source_metadata' ? {} : []);
  if (res.table === 'content') o.claim_check = j(o.claim_check, {});
  return o;
};
const toDb = (res, v) => {
  const o = { ...v };
  for (const k of Object.keys(o)) if (typeof o[k] === 'boolean') o[k] = o[k] ? 1 : 0;
  return o;
};
const dbShaped = (res, row) => { const o = { ...row }; for (const c of res.json || []) if (typeof o[c] !== 'string') o[c] = JSON.stringify(o[c] ?? []); return o; };

function guardClaims(res, merged) {
  if (res.claim === 'product') {
    const r = checkProduct(dbShaped(res, merged));
    if (r && r.ok === false) return r;
  }
  return null;
}
function claimFail(r) {
  const e = httpError(422, 'claims_blocked', 'This copy contains claims that are not allowed. Please revise it.');
  e.violations = r.violations || [];
  return e;
}

export default function register(r) {
  r.get('/api/admin/overview', REQ, () => {
    const n = (sql, ...p) => get(sql, ...p).n;
    const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
    return {
      users: { total: n('SELECT COUNT(*) n FROM users'), by_role: Object.fromEntries(all('SELECT role, COUNT(*) n FROM users GROUP BY role').map((x) => [x.role, x.n])), disabled: n("SELECT COUNT(*) n FROM users WHERE status='disabled'") },
      active_users_7d: n('SELECT COUNT(DISTINCT user_id) n FROM check_ins WHERE created_at>=?', since7),
      check_ins: n('SELECT COUNT(*) n FROM check_ins'),
      clinician_reports: Object.fromEntries(all('SELECT status, COUNT(*) n FROM clinician_reports GROUP BY status').map((x) => [x.status, x.n])),
      content: { total: n('SELECT COUNT(*) n FROM content'), published: n("SELECT COUNT(*) n FROM content WHERE status='published' AND active=1"), blocked: n("SELECT COUNT(*) n FROM content WHERE status='blocked'") },
      products: { total: n('SELECT COUNT(*) n FROM products'), active: n('SELECT COUNT(*) n FROM products WHERE active=1') },
      questions: n('SELECT COUNT(*) n FROM questions WHERE active=1'),
      safety_events_7d: n('SELECT COUNT(*) n FROM safety_events WHERE created_at>=?', since7),
      audit_entries: n('SELECT COUNT(*) n FROM audit_logs'),
    };
  });

  r.get('/api/admin/resources/:resource', REQ, ({ params }) => {
    const res = resourceOr404(params.resource);
    const rows = res.select ? all(res.select) : all(`SELECT * FROM ${res.table} ORDER BY ${res.order || 'created_at DESC'} LIMIT 500`);
    return { resource: params.resource, rows: rows.map((x) => outRow(res, x)) };
  });

  r.post('/api/admin/resources/:resource', REQ, ({ params, body, req }) => {
    const res = resourceOr404(params.resource);
    if (!res.create) throw httpError(400, 'unsupported', params.resource === 'clinicians' ? 'Use POST /api/admin/clinicians to add a clinician.' : 'Creating records of this type is not supported.');
    const v = validate(body, res.fields);
    const missing = {}; for (const k of res.required || []) if (v[k] === undefined) missing[k] = 'Required.';
    if (Object.keys(missing).length) throw httpError(400, 'validation_error', 'Please check the highlighted fields.', missing);
    res.validatePatch?.(v);
    if (res.table === 'products') { v.is_demo ??= true; v.regulatory_status ??= 'DEMO_NOT_APPROVED'; }
    if (res.table === 'content') v.status ??= 'draft';
    if (res.claim === 'content') { const c = checkText([v.title, v.summary, v.body].filter(Boolean).join('\n\n')); if (c && c.ok === false) throw claimFail(c); }
    if (res.claim === 'product') { const c = guardClaims(res, v); if (c) throw claimFail(c); }
    if (res.table === 'questions') v.safety_category ??= 'general_wellness';
    if (res.table === 'products' && v.is_demo === false && !v.licence_reference) { /* allowed, but never displayable without licence per engine gate */ }
    let row;
    try { row = insert(res.table, toDb(res, v)); }
    catch (e) { if (/UNIQUE/i.test(e.message)) throw httpError(409, 'conflict', 'A record with that unique value already exists.'); throw e; }
    if (res.claim === 'content') { try { checkContent(get('SELECT * FROM content WHERE id=?', row.id)); } catch (e) { console.error('checkContent:', e.message); } }
    audit(req, 'admin_create', { targetType: params.resource, targetId: row.id });
    return reply(201, { row: outRow(res, get(`SELECT * FROM ${res.table} WHERE id=?`, row.id)) });
  });

  r.patch('/api/admin/resources/:resource/:id', REQ, ({ params, body, req, user }) => {
    const res = resourceOr404(params.resource);
    const cur = get(`SELECT * FROM ${res.table} WHERE id=?`, params.id);
    if (!cur) throw httpError(404, 'not_found', 'Record not found.');
    const shape = { ...res.fields }; for (const k of res.immutable || []) delete shape[k];
    const v = validate(body, shape);
    if (!Object.keys(v).length) throw httpError(400, 'validation_error', 'Nothing to update.');
    res.validatePatch?.(v);
    if (res.table === 'users' && params.id === user.id) throw httpError(400, 'forbidden_change', 'You cannot change your own role or status.');
    if (res.claim) {
      const merged = { ...outRow(res, cur), ...v };
      if (res.claim === 'content') { const c = checkText([merged.title, merged.summary, merged.body].filter(Boolean).join('\n\n')); if (c && c.ok === false) throw claimFail(c); }
      else { const c = guardClaims(res, merged); if (c) throw claimFail(c); }
    }
    tx(() => {
      update(res.table, params.id, toDb(res, v));
      if (res.table === 'users' && v.status === 'disabled') run('DELETE FROM sessions WHERE user_id=?', params.id);
      if (res.table === 'users' && v.role && v.role !== cur.role) run('DELETE FROM sessions WHERE user_id=?', params.id);
    });
    if (res.claim === 'content') { try { checkContent(get('SELECT * FROM content WHERE id=?', params.id)); } catch (e) { console.error('checkContent:', e.message); } }
    const changed = Object.fromEntries(Object.keys(v).filter((k) => !['body'].includes(k)).map((k) => [k, v[k]]));
    audit(req, res.table === 'users' && v.role ? 'admin_role_change' : 'admin_update', { targetType: params.resource, targetId: params.id, subjectUserId: res.table === 'users' ? params.id : undefined, detail: { fields: Object.keys(v), changed, from_role: res.table === 'users' ? cur.role : undefined } });
    return { row: outRow(res, get(`SELECT * FROM ${res.table} WHERE id=?`, params.id)) };
  });

  r.get('/api/admin/settings', REQ, () => ({ settings: Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, setting(k)])) }));
  r.put('/api/admin/settings', REQ, ({ body, req }) => {
    const input = body?.settings && typeof body.settings === 'object' ? body.settings : body;
    const changed = {};
    for (const [k, v] of Object.entries(input || {})) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) throw httpError(400, 'validation_error', 'Unknown setting.', { [k]: 'Unknown setting.' });
      const def = DEFAULT_SETTINGS[k];
      if (typeof def === 'boolean' && typeof v !== 'boolean') throw httpError(400, 'validation_error', 'Invalid value.', { [k]: 'Must be true or false.' });
      if (typeof def === 'number' && !(Number.isInteger(v) && v >= 0 && v <= 100)) throw httpError(400, 'validation_error', 'Invalid value.', { [k]: 'Must be a whole number from 0 to 100.' });
      changed[k] = v;
    }
    tx(() => { for (const [k, v] of Object.entries(changed)) setSetting(k, v); });
    audit(req, 'admin_settings_change', { targetType: 'settings', detail: changed });
    return { settings: Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, setting(k)])) };
  });

  r.get('/api/admin/analytics', REQ, () => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const FUNNEL = ['landing_view', 'wellness_check_started', 'wellness_check_completed', 'account_created', 'baseline_completed'];
    const counts = new Map(all('SELECT name, COUNT(DISTINCT COALESCE(anon_id, id)) n FROM analytics_events GROUP BY name').map((x) => [x.name, x.n]));
    return {
      totals: {
        events: get('SELECT COUNT(*) n FROM analytics_events').n,
        visitors: get('SELECT COUNT(DISTINCT anon_id) n FROM analytics_events').n,
        users: get("SELECT COUNT(*) n FROM users WHERE role='USER'").n,
        check_ins: get('SELECT COUNT(*) n FROM check_ins').n,
      },
      funnel: FUNNEL.map((name) => ({ name, count: counts.get(name) || 0 })),
      daily: all('SELECT substr(created_at,1,10) day, COUNT(*) events FROM analytics_events WHERE created_at>=? GROUP BY day ORDER BY day', since),
    };
  });

  r.get('/api/admin/audit', REQ, ({ query }) => {
    const { limit } = validate(query, { limit: S.int({ coerce: true, min: 1, max: 500, default: 100 }) });
    return { entries: all('SELECT id, actor_id, actor_role, action, target_type, target_id, subject_user_id, detail, created_at FROM audit_logs ORDER BY created_at DESC, rowid DESC LIMIT ?', limit).map((e) => ({ ...e, detail: j(e.detail, {}) })) };
  });
  r.get('/api/admin/safety-events', REQ, () => ({
    events: all('SELECT id, user_id, category, rule_label, source, excerpt, action, created_at FROM safety_events ORDER BY created_at DESC, rowid DESC LIMIT 200'),
  }));
  r.post('/api/admin/claims/check', REQ, ({ body }) => {
    const { text } = validate(body, { text: S.str({ required: true, min: 1, max: 20000 }) });
    return checkText(text);
  });
  r.get('/api/admin/integrations', REQ, () => ({ integrations: integrations.list() }));

  r.post('/api/admin/clinicians', REQ, ({ body, req }) => {
    const v = validate(body, {
      email: S.email({ required: true }), password: S.str({ required: true, max: 200, trim: false }),
      display_name: str(120, { required: true, min: 1 }), specialty: str(120), licence_reference: str(120),
    });
    const pw = passwordProblem(v.password); if (pw) throw httpError(400, 'validation_error', pw, { password: pw });
    if (get('SELECT 1 x FROM users WHERE email=?', v.email)) throw httpError(409, 'conflict', 'A user with that email already exists.', { email: 'Already in use.' });
    const out = tx(() => {
      const u = insert('users', { email: v.email, password_hash: hashPassword(v.password), role: 'CLINICIAN', status: 'active', is_demo: 0, auth_provider: 'password' });
      const c = insert('clinicians', { user_id: u.id, display_name: v.display_name, specialty: v.specialty || null, licence_reference: v.licence_reference || null, is_demo: 0, active: 1 });
      return { user: u, clinician: c };
    });
    audit(req, 'admin_create_clinician', { targetType: 'clinician', targetId: out.clinician.id, subjectUserId: out.user.id });
    return reply(201, { clinician: { id: out.clinician.id, user_id: out.user.id, email: v.email, display_name: v.display_name, specialty: v.specialty || null, licence_reference: v.licence_reference || null } });
  });
}
