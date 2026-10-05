// SVARA — clinician portal + admin console (builder D).
import { api, state, navigate, toast, demoBadge, loading, errorBox, emptyState, lineChart, dimIcon, disclaimer } from './core.js';
import { e, set, lazy, A, dt, parse, rowsOf, field, toggle, statusChip, section, select, btn, busy, listOf, dirChip, dirWords, timeline } from './pages-app.js';

const rnd = (n) => (n == null || isNaN(n) ? '–' : Math.round(n));
const short = (v, n = 90) => {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? (x.label || x.name || '') : x)).join(', ');
  if (typeof v === 'object') return Object.entries(v).slice(0, 4).map(([k, x]) => `${k}: ${typeof x === 'object' ? '…' : x}`).join(' · ');
  const s = String(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const isDate = (k) => /(_at|^at|_on|day|scheduled_for)$/.test(k);

/* ───────────── CLINICIAN PORTAL ───────────── */
const STATUSES = ['requested', 'scheduled', 'in_consultation', 'completed', 'closed'];
async function proOverview() {
  return lazy(async (root) => {
    const o = await api('GET', '/api/pro/overview');
    const reports = o.reports || [];
    let filter = '';
    const tbl = e('div', { class: 'a-table-wrap' });
    const chips = e('div', { class: 'row a-chips', role: 'group', 'aria-label': 'Filter by status' });
    const draw = () => {
      const rows = reports.filter((r) => !filter || r.status === filter);
      set(chips, [['', 'All'], ...STATUSES.map((s) => [s, s.replace(/_/g, ' ')])].map(([v, l]) => e('button', { type: 'button', class: `chip${filter === v ? ' active' : ''}`, 'aria-pressed': String(filter === v), onclick: () => { filter = v; draw(); } }, l)));
      set(tbl, rows.length ? e('table', { class: 'table' }, e('thead', {}, e('tr', {}, ['Person', 'Status', 'Range', 'Shared', 'Scheduled', ''].map((t) => e('th', {}, t)))),
        e('tbody', {}, rows.map((r) => e('tr', {}, e('td', {}, r.user_name || 'Person'), e('td', {}, statusChip(r.status)), e('td', {}, r.range_days ? `${r.range_days} days` : 'Full history'), e('td', {}, dt(r.created_at)), e('td', {}, r.scheduled_for ? dt(r.scheduled_for, true) : '–'),
          e('td', {}, A(`/pro/report/${r.id}`, 'Open', 'btn btn-ghost btn-sm')))))) : emptyState('No reports here', 'Reports appear when someone chooses to share with you.'));
    };
    draw();
    const c = o.counts || {};
    set(root, e('div', { class: 'row a-between' }, e('div', {}, e('p', { class: 'eyebrow' }, 'CLINICIAN PORTAL'), e('h1', { class: 'h1' }, 'Consented reports')), o.demo || (state.user && state.user.is_demo) ? e('span', { class: 'badge-demo' }, 'DEMO clinician data') : null),
      e('p', { class: 'muted' }, 'Only reports people have chosen to share with you. Every view is recorded.'),
      e('div', { class: 'grid grid-3 a-stats' }, STATUSES.slice(0, 4).map((s) => e('div', { class: 'card stat' }, e('div', { class: 'h2' }, String(c[s] || 0)), e('div', { class: 'help' }, s.replace(/_/g, ' '))))),
      chips, tbl, disclaimer('Svara does not diagnose or prescribe.'));
  });
}

function dimBlock(d) {
  const series = d.series && d.series.length ? d.series.map((p, i) => ({ x: i, y: p.score ?? p.y })) : (d.baseline != null && d.current != null ? [{ x: 'Baseline', y: d.baseline }, { x: 'Now', y: d.current }] : []);
  return e('div', { class: 'card stack a-dim' }, e('div', { class: 'row a-between' }, e('strong', { class: 'a-dim-title' }, dimIcon(d.key), d.label || d.key), dirChip(d.direction)),
    e('div', { class: 'a-dim-line' }, d.baseline != null ? `${rnd(d.baseline)} → ${rnd(d.current)}` : rnd(d.current)),
    series.length > 1 ? e('div', { class: 'a-chart', role: 'img', 'aria-label': `${d.label} baseline to current` }, lineChart([{ label: d.label, points: series }], { w: 260, h: 80, baseline: d.baseline })) : null,
    e('p', { class: 'help' }, `Reported trend: ${dirWords(d.direction)}${d.change != null ? ` · change from baseline ${d.change > 0 ? '+' : ''}${rnd(d.change)}` : ''}`));
}
const ctxEntries = (o) => Object.entries(o || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${short(v)}`);

async function proReport(ctx) {
  const id = ctx.params.id;
  return lazy(async (root) => {
    const r = await api('GET', `/api/pro/reports/${id}`);
    const content = parse(r.content, {}) || {};
    const rep = r.report || {};
    let notes = r.notes || [];
    const notesBox = e('div', { class: 'stack' });
    const drawNotes = () => set(notesBox, notes.length ? notes.map((n) => e('div', { class: 'card stack a-note-item' }, e('div', { class: 'row a-between' }, e('span', {}, e('span', { class: 'pill' }, n.kind === 'next_step' ? 'recommended next step' : n.kind), ' ', e('span', { class: 'help' }, dt(n.created_at, true))), n.visible_to_user ? e('span', { class: 'pill' }, 'Visible to user') : e('span', { class: 'help' }, 'Private')),
      n.body ? e('p', {}, n.body) : null, n.file_name ? e('p', { class: 'help' }, `📎 ${n.file_name}`) : null)) : e('p', { class: 'muted' }, 'No notes yet.'));
    drawNotes();
    const reload = async () => { const x = await api('GET', `/api/pro/reports/${id}`); notes = x.notes || []; drawNotes(); };

    // status control
    let status = rep.status;
    const sel = select(STATUSES, status, (v) => { status = v; sched.hidden = v !== 'scheduled'; });
    const sIn = e('input', { class: 'input', type: 'datetime-local', 'aria-label': 'Scheduled date and time' });
    if (rep.scheduled_for) { try { sIn.value = new Date(new Date(rep.scheduled_for).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); } catch { /* ignore */ } }
    const sched = e('div', {}, field('Consultation date', sIn));
    sched.hidden = status !== 'scheduled';
    const tl = e('div', {}, timeline(rep.status));
    const upd = btn('Update status', () => busy(upd, async () => {
      const body = { status };
      if (status === 'scheduled') { if (!sIn.value) { toast('Choose a date first.', 'error'); return; } body.scheduled_for = new Date(sIn.value).toISOString(); }
      await api('POST', `/api/pro/reports/${id}/status`, body); rep.status = status; set(tl, timeline(status)); toast('Status updated.');
    }));

    // notes form
    const kind = select([['note', 'Professional note'], ['decision', 'Decision'], ['next_step', 'Recommended next step']], 'note', () => {});
    const body = e('textarea', { class: 'textarea', rows: '4', maxlength: '2000', 'aria-label': 'Note text' });
    const vis = toggle('Visible to user', false, () => {});
    const visInput = vis.querySelector('input');
    const add = btn('Save', () => busy(add, async () => {
      if (!body.value.trim()) { toast('Write something first.', 'error'); return; }
      await api('POST', `/api/pro/reports/${id}/notes`, { kind: kind.value, body: body.value.trim(), visible_to_user: visInput.checked });
      body.value = ''; await reload(); toast('Saved.');
    }));
    const file = e('input', { type: 'file', class: 'input', accept: '.pdf,.png,.jpg,.jpeg,.txt', 'aria-label': 'Documentation file' });
    const up = btn('Upload', () => busy(up, async () => {
      const f = file.files[0]; if (!f) { toast('Choose a file.', 'error'); return; }
      if (f.size > 2 * 1024 * 1024) { toast('File must be 2MB or smaller.', 'error'); return; }
      const ext = f.name.split('.').pop().toLowerCase();
      const mime = f.type || { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain' }[ext];
      if (!mime) { toast('Use a pdf, png, jpg or txt file.', 'error'); return; }
      const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(f); });
      await api('POST', `/api/pro/reports/${id}/upload`, { file_name: f.name, mime, content_base64: b64 }); file.value = ''; await reload(); toast('Uploaded.');
    }), 'btn btn-ghost');

    const dims = content.dimensions || [];
    const lc = content.lifestyle_context;
    set(root,
      e('div', { class: 'row a-between' }, A('/pro', '← All reports', 'btn btn-ghost btn-sm'), r.demo ? e('span', { class: 'badge-demo' }, 'DEMO clinician data') : null),
      e('p', { class: 'eyebrow' }, content.title || 'SVARA CLINICIAN REPORT'),
      e('h1', { class: 'h1' }, (r.user && r.user.name) || 'Person'),
      e('p', { class: 'muted' }, `${r.user && r.user.age_range ? r.user.age_range + ' · ' : ''}${content.range_days ? 'Last ' + content.range_days + ' days' : 'Full history'} · shared ${dt(rep.created_at || content.generated_at)}`),
      e('div', { class: 'callout', role: 'note' }, 'Summary prepared from user-reported data. Professional judgement and authority rest with the clinician. Svara does not diagnose or prescribe.'),
      section('GOALS', (content.goals || []).length ? e('div', { class: 'row a-chips' }, content.goals.map((g) => e('span', { class: 'pill' }, typeof g === 'string' ? g.replace(/_/g, ' ') : g.label))) : e('p', { class: 'muted' }, 'None set.')),
      section('REPORTED DIMENSIONS', dims.length ? e('div', { class: 'grid grid-3' }, dims.map(dimBlock)) : e('p', { class: 'muted' }, 'No dimension data in range.')),
      section('RECENT CHANGES', (content.recent_changes || []).length ? listOf(content.recent_changes) : e('p', { class: 'muted' }, 'None noted.')),
      section('PATTERNS REPORTED', (content.patterns || []).length ? listOf(content.patterns) : e('p', { class: 'muted' }, 'None noted.')),
      section('USER COMMENTS', e('p', {}, short(content.user_comments, 2000) || 'No comments added.')),
      section('LIFESTYLE CONTEXT', ctxEntries(lc).length ? listOf(ctxEntries(lc)) : e('p', { class: 'muted' }, 'Not provided.')),
      section('QUESTIONS TO DISCUSS', (content.questions_to_discuss || []).length ? listOf(content.questions_to_discuss) : e('p', { class: 'muted' }, 'None added.')),
      section('CONSULTATION STATUS', e('div', { class: 'card stack' }, tl, field('Set status', sel), sched, upd)),
      section('ADD PROFESSIONAL NOTES', e('div', { class: 'card stack' }, field('Type', kind), field('Text', body), vis, add,
        e('hr', { class: 'hr' }), field('Upload documentation', file, { tag: 'Optional', help: 'PDF, PNG, JPG or TXT, up to 2MB.' }), up)),
      section('NOTES TIMELINE', notesBox),
      disclaimer(content.disclaimer));
  });
}

/* ───────────── ADMIN: generic resource table ───────────── */
function dataTable(rows, cols) {
  if (!rows.length) return e('p', { class: 'muted' }, 'Nothing to show.');
  cols = cols || Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object').slice(0, 7);
  return e('div', { class: 'a-table-wrap' }, e('table', { class: 'table' }, e('thead', {}, e('tr', {}, cols.map((c) => e('th', {}, (c.label || c.key || c).toString().replace(/_/g, ' '))))),
    e('tbody', {}, rows.map((r) => e('tr', {}, cols.map((c) => { const k = c.key || c; const v = r[k]; return e('td', {}, isDate(k) && v ? dt(v, true) : short(v)); }))))));
}
function formFields(defs, values = {}) {
  const inputs = {};
  const nodes = defs.map((f) => {
    let ctl;
    if (f.type === 'select') { ctl = select(f.options, values[f.key] ?? f.options[0], () => {}); }
    else if (f.type === 'textarea') { ctl = e('textarea', { class: 'textarea', rows: '3' }); ctl.value = values[f.key] ?? ''; }
    else if (f.type === 'bool') { ctl = select([['1', 'Yes'], ['0', 'No']], values[f.key] ? '1' : '0', () => {}); }
    else { ctl = e('input', { class: 'input', type: f.type || 'text' }); ctl.value = values[f.key] ?? ''; }
    inputs[f.key] = ctl;
    return field(f.label || f.key, ctl);
  });
  const read = () => Object.fromEntries(defs.map((f) => {
    let v = inputs[f.key].value;
    if (f.type === 'number') v = v === '' ? null : Number(v); else if (f.type === 'bool') v = v === '1' ? 1 : 0;
    return [f.key, v];
  }));
  return { nodes, read };
}
const errText = (err) => {
  const f = err && err.fields ? Object.values(err.fields).join('; ') : '';
  return `${err.message || 'Failed'}${f ? ' — ' + f : ''}`;
};
function claimResult(r) {
  if (!r) return null;
  const v = r.violations || [];
  return e('div', { class: v.length ? 'callout' : 'card-soft', role: 'status' }, v.length ? [e('strong', {}, `${v.length} possible claim issue${v.length > 1 ? 's' : ''}`), e('ul', { class: 'list' }, v.map((x) => e('li', {}, `“${x.excerpt}” — ${x.label}${x.reason ? ': ' + x.reason : ''}`)))] : e('strong', {}, '✓ No restricted claims found.'));
}

/**
 * Reusable admin table. opts: {resource, cols, filters:[keys], edit:[fieldDefs], create:[fieldDefs], createPath, toggleKey, textOf(row)->string (claim check)}
 */
function resourceTable(opts) {
  const box = e('div', { class: 'stack' });
  let rows = []; const flt = {}; let editing = null; let showCreate = false; let checked = {};
  const path = `/api/admin/resources/${opts.resource}`;
  const load = async () => {
    set(box, loading());
    try { rows = rowsOf(await api('GET', path)); } catch (err) { return set(box, errorBox(err)); }
    draw();
  };
  const patch = async (row, data) => { try { await api('PATCH', `${path}/${row.id}`, data); Object.assign(row, data); toast('Saved.'); return true; } catch (err) { toast(errText(err), 'error'); return false; } };
  function draw() {
    const view = rows.filter((r) => Object.entries(flt).every(([k, v]) => !v || String(r[k]) === v));
    const filters = (opts.filters || []).map((k) => {
      const vals = [...new Set(rows.map((r) => r[k]).filter((x) => x != null))].sort();
      return e('label', { class: 'a-filter' }, e('span', { class: 'help' }, k), select([['', 'All'], ...vals.map((x) => [String(x), String(x)])], flt[k] || '', (v) => { flt[k] = v; draw(); }, { 'aria-label': `Filter by ${k}` }));
    });
    const cols = opts.cols;
    const head = e('tr', {}, cols.map((c) => e('th', {}, c.label || c.key.replace(/_/g, ' '))), opts.toggleKey ? e('th', {}, 'Active') : null, e('th', {}, ''));
    const body = view.flatMap((r) => {
      const tr = e('tr', {}, cols.map((c) => e('td', {}, c.render ? c.render(r) : isDate(c.key) && r[c.key] ? dt(r[c.key], true) : short(r[c.key], c.max || 70))),
        opts.toggleKey ? e('td', {}, toggle(`Active: ${short(r[cols[0].key], 30)}`, !!r[opts.toggleKey], async (v, el) => { if (!(await patch(r, { [opts.toggleKey]: v ? 1 : 0 }))) el.checked = !v; })) : null,
        e('td', {}, e('div', { class: 'row' }, opts.edit ? btn(editing === r.id ? 'Close' : 'Edit', () => { editing = editing === r.id ? null : r.id; draw(); }, 'btn btn-ghost btn-sm') : null,
          opts.textOf ? (() => { const b = btn('Check claims', () => busy(b, async () => { checked[r.id] = await api('POST', '/api/admin/claims/check', { text: opts.textOf(r) }); editing = editing; draw(); }), 'btn btn-ghost btn-sm'); return b; })() : null)));
      const out = [tr];
      if (checked[r.id]) out.push(e('tr', {}, e('td', { colSpan: cols.length + 2 }, claimResult(checked[r.id]))));
      if (editing === r.id && opts.edit) {
        const ff = formFields(opts.edit, r);
        const save = btn('Save changes', () => busy(save, async () => { const d = ff.read(); if (await patch(r, d)) { editing = null; draw(); } }));
        out.push(e('tr', {}, e('td', { colSpan: cols.length + 2 }, e('div', { class: 'card stack' }, ...ff.nodes, save))));
      }
      return out;
    });
    let createBox = null;
    if (opts.create) {
      if (!showCreate) createBox = btn('+ Add new', () => { showCreate = true; draw(); }, 'btn btn-ghost btn-sm');
      else {
        const ff = formFields(opts.create);
        const go = btn('Create', () => busy(go, async () => {
          try { await api('POST', opts.createPath || path, ff.read()); toast('Created.'); showCreate = false; await load(); } catch (err) { toast(errText(err), 'error'); }
        }));
        createBox = e('div', { class: 'card stack' }, e('strong', {}, 'New'), ...ff.nodes, e('div', { class: 'row' }, go, btn('Cancel', () => { showCreate = false; draw(); }, 'btn btn-ghost')));
      }
    }
    set(box, e('div', { class: 'row a-between' }, e('div', { class: 'row' }, filters), e('span', { class: 'help' }, `${view.length} of ${rows.length}`)), createBox,
      view.length ? e('div', { class: 'a-table-wrap' }, e('table', { class: 'table' }, e('thead', {}, head), e('tbody', {}, body))) : emptyState('Nothing here', 'No rows match.'));
  }
  load();
  return box;
}

/* ───────────── ADMIN tabs ───────────── */
const DIMS = ['sleep', 'energy', 'mood', 'relaxation', 'motivation', 'focus', 'recovery', 'social_connection', 'stress', 'overall_wellbeing'];
const tabOverview = () => lazy(async (root) => {
  const o = await api('GET', '/api/admin/overview');
  const c = o.counts || o;
  const flat = []; const walk = (o, pre) => Object.entries(o || {}).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${pre}${k} `); else if (!Array.isArray(v)) flat.push([pre + k, v]); });
  walk(c, '');
  set(root, e('div', { class: 'grid grid-3 a-stats' }, flat.map(([k, v]) => e('div', { class: 'card stat' }, e('div', { class: 'h2' }, String(v)), e('div', { class: 'help' }, k.replace(/_/g, ' '))))));
}, 'stack');

const tabUsers = () => resourceTable({ resource: 'users', filters: ['role', 'status'], cols: [{ key: 'email' }, { key: 'role' }, { key: 'status' }, { key: 'is_demo', label: 'demo' }, { key: 'created_at', label: 'created' }],
  edit: [{ key: 'role', type: 'select', options: ['USER', 'CLINICIAN', 'ADMIN'] }, { key: 'status', type: 'select', options: ['active', 'disabled'] }] });
const tabClinicians = () => resourceTable({ resource: 'clinicians', createPath: '/api/admin/clinicians', toggleKey: 'active',
  cols: [{ key: 'display_name', label: 'name' }, { key: 'specialty' }, { key: 'licence_reference', label: 'licence' }, { key: 'is_demo', label: 'demo' }],
  create: [{ key: 'display_name', label: 'Display name' }, { key: 'email', type: 'email' }, { key: 'password', type: 'password', label: 'Initial password' }, { key: 'specialty' }, { key: 'licence_reference', label: 'Licence reference' }] });
const tabProducts = () => e('div', { class: 'stack' }, e('div', { class: 'callout' }, 'Products are demo records. Every product is checked against claim rules and approved-claim lists before it can be displayed.'),
  resourceTable({ resource: 'products', toggleKey: 'active', filters: ['regulatory_status'], textOf: (r) => [r.name, r.description, ...(parse(r.approved_claims, []) || [])].join('. '),
    cols: [{ key: 'name' }, { key: 'category' }, { key: 'regulatory_status', label: 'regulatory' }, { key: 'licence_reference', label: 'licence' }, { key: 'regulatory_category', label: 'reg. category' }, { key: 'is_demo', label: 'demo' }],
    edit: [{ key: 'description', type: 'textarea' }, { key: 'regulatory_status', type: 'select', options: ['DEMO_NOT_APPROVED', 'PENDING', 'APPROVED', 'REJECTED'] }, { key: 'regulatory_category' }, { key: 'licence_reference' }, { key: 'required_disclaimer', type: 'textarea' }] }));
const tabClaims = () => {
  const ta = e('textarea', { class: 'textarea', rows: '4', 'aria-label': 'Text to check', placeholder: 'Paste copy to test against the claim rules…' });
  const out = e('div', { 'aria-live': 'polite' });
  const go = btn('Check text', () => busy(go, async () => { if (!ta.value.trim()) return; set(out, claimResult(await api('POST', '/api/admin/claims/check', { text: ta.value }))); }));
  return e('div', { class: 'stack' }, e('div', { class: 'card stack' }, e('strong', {}, 'Claim tester'), ta, go, out),
    resourceTable({ resource: 'claim_rules', toggleKey: 'active', cols: [{ key: 'label' }, { key: 'pattern', max: 50 }, { key: 'severity' }, { key: 'reason' }],
      edit: [{ key: 'label' }, { key: 'pattern' }, { key: 'severity', type: 'select', options: ['block', 'warn'] }, { key: 'reason', type: 'textarea' }],
      create: [{ key: 'label' }, { key: 'pattern', label: 'Pattern (regex)' }, { key: 'severity', type: 'select', options: ['block', 'warn'] }, { key: 'reason' }] }));
};
const tabQuestions = () => resourceTable({ resource: 'questions', toggleKey: 'active', filters: ['dimension', 'pool'], cols: [{ key: 'pool' }, { key: 'dimension' }, { key: 'question', max: 80 }, { key: 'response_type', label: 'type' }, { key: 'sensitivity_level', label: 'sensitivity' }] });
const tabRoutines = () => resourceTable({ resource: 'routines', toggleKey: 'active', cols: [{ key: 'name' }, { key: 'goal' }, { key: 'duration_min', label: 'min' }, { key: 'frequency' }], edit: [{ key: 'safety_notes', type: 'textarea' }, { key: 'duration_min', type: 'number', label: 'Duration (min)' }] });
const tabContent = () => resourceTable({ resource: 'content', toggleKey: 'active', filters: ['status', 'category'], textOf: (r) => `${r.title}. ${r.summary || ''} ${r.body || ''}`,
  cols: [{ key: 'title' }, { key: 'category' }, { key: 'status' }, { key: 'claim_check', label: 'claim check', render: (r) => { const c = parse(r.claim_check, {}) || {}; const n = (c.violations || []).length; return n ? `${n} flag${n > 1 ? 's' : ''}` : c.ok === false ? 'flagged' : 'clear'; } }],
  edit: [{ key: 'status', type: 'select', options: ['draft', 'published', 'blocked'] }, { key: 'summary', type: 'textarea' }],
  create: [{ key: 'slug' }, { key: 'title' }, { key: 'category' }, { key: 'summary', type: 'textarea' }, { key: 'body', type: 'textarea' }, { key: 'status', type: 'select', options: ['draft', 'published'] }] });

function settingsPanel() {
  return lazy(async (root) => {
    const res = await api('GET', '/api/admin/settings');
    let s = res.settings || res;
    if (Array.isArray(s)) s = Object.fromEntries(s.map((x) => [x.key, x.value]));
    const cur = { ...s };
    const orig = {};
    const rowsN = Object.entries(s).map(([k, v]) => {
      orig[k] = v;
      const isBool = typeof v === 'boolean' || v === 'true' || v === 'false' || v === 0 || v === 1 && /enabled|_on$/.test(k);
      if (isBool) return toggle(k.replace(/[._]/g, ' '), v === true || v === 'true' || v === 1, (c) => { cur[k] = typeof v === 'boolean' ? c : typeof v === 'number' ? (c ? 1 : 0) : String(c); });
      const num = v !== '' && !isNaN(Number(v));
      const i = e('input', { class: 'input', type: num ? 'number' : 'text', step: 'any', oninput: (ev) => { cur[k] = num ? (typeof v === 'number' ? Number(ev.target.value) : ev.target.value) : ev.target.value; } });
      i.value = v ?? '';
      return field(k.replace(/[._]/g, ' '), i);
    });
    const save = btn('Save settings', () => busy(save, async () => { await api('PUT', '/api/admin/settings', cur); toast('Settings saved.'); }));
    set(root, e('div', { class: 'card stack' }, ...rowsN, save));
  }, 'stack');
}
const tabAI = () => e('div', { class: 'stack' }, section('AI CONFIGURATION', settingsPanel()),
  section('SAFETY RULES', resourceTable({ resource: 'safety_rules', toggleKey: 'active', filters: ['category'], cols: [{ key: 'category' }, { key: 'label' }, { key: 'pattern', max: 60 }],
    edit: [{ key: 'label' }, { key: 'pattern' }] })),
  section('SAFETY EVENTS', lazy(async (root) => {
    const ev = rowsOf(await api('GET', '/api/admin/safety-events'));
    set(root, ev.length ? dataTable(ev, ['created_at', 'category', 'rule_label', 'source', 'action', 'excerpt']) : e('p', { class: 'muted' }, 'No safety events recorded.'));
  }, 'stack')));

const tabAnalytics = () => lazy(async (root) => {
  const a = await api('GET', '/api/admin/analytics');
  const f = a.funnel || []; const max = Math.max(1, ...f.map((x) => x.count));
  const daily = (a.daily || []).map((d, i) => ({ x: i, y: d.events }));
  set(root,
    e('div', { class: 'grid grid-3 a-stats' }, Object.entries(a.totals || {}).filter(([, v]) => typeof v !== 'object').map(([k, v]) => e('div', { class: 'card stat' }, e('div', { class: 'h2' }, String(v)), e('div', { class: 'help' }, k.replace(/_/g, ' '))))),
    section('FUNNEL', f.length ? e('div', { class: 'card stack' }, f.map((x) => e('div', { class: 'a-funnel' }, e('span', { class: 'a-funnel-label' }, x.name.replace(/_/g, ' ')), e('div', { class: 'a-bar', role: 'img', 'aria-label': `${x.name} ${x.count}` }, e('span', { style: { width: `${(x.count / max) * 100}%` } })), e('strong', {}, String(x.count))))) : e('p', { class: 'muted' }, 'No events yet.')),
    section('DAILY EVENTS', daily.length > 1 ? e('div', { class: 'card a-chart', role: 'img', 'aria-label': 'Daily events' }, lineChart([{ label: 'Events', points: daily }], { w: 640, h: 180 })) : e('p', { class: 'muted' }, 'Not enough days yet.')),
    e('p', { class: 'help' }, 'Aggregate counts only. No names, answers or personal information.'));
}, 'stack');

const tabAudit = () => lazy(async (root) => {
  const rows = rowsOf(await api('GET', '/api/admin/audit?limit=200'));
  set(root, dataTable(rows, ['created_at', 'actor_role', 'action', 'target_type', 'target_id']));
}, 'stack');
const tabIntegrations = () => lazy(async (root) => {
  const rows = rowsOf(await api('GET', '/api/admin/integrations'));
  set(root, e('div', { class: 'callout' }, 'Placeholders only — nothing external is connected in this preview.'), rows.length ? dataTable(rows) : e('p', { class: 'muted' }, 'No integrations registered.'));
}, 'stack');

const TABS = [['overview', 'Overview', tabOverview], ['users', 'Users', tabUsers], ['clinicians', 'Clinicians', tabClinicians], ['products', 'Products', tabProducts], ['claims', 'Claims', tabClaims],
  ['questions', 'Questions', tabQuestions], ['routines', 'Routines', tabRoutines], ['content', 'Content', tabContent], ['ai', 'AI & Safety', tabAI], ['analytics', 'Analytics', tabAnalytics],
  ['audit', 'Audit logs', tabAudit], ['integrations', 'Integrations', tabIntegrations]];

async function adminPage(ctx) {
  const key = (ctx.params && ctx.params.tab) || 'overview';
  const tab = TABS.find((t) => t[0] === key) || TABS[0];
  const root = e('div', { class: 'container stack a-page fade-in' });
  set(root, e('p', { class: 'eyebrow' }, 'ADMIN'), e('h1', { class: 'h1' }, tab[1]),
    e('nav', { class: 'tabs a-admin-tabs', 'aria-label': 'Admin sections' }, TABS.map(([k, l]) => e('a', { href: `/admin/${k}`, class: `tab${k === tab[0] ? ' active' : ''}`, 'aria-current': k === tab[0] ? 'page' : null, onclick: (ev) => { ev.preventDefault(); navigate(`/admin/${k}`); } }, l))),
    tab[2]());
  return root;
}

export const routes = [
  { path: '/pro', role: 'CLINICIAN', title: 'Clinician portal', render: proOverview },
  { path: '/pro/report/:id', role: 'CLINICIAN', title: 'Report', render: proReport },
  { path: '/admin', role: 'ADMIN', title: 'Admin', render: adminPage },
  { path: '/admin/:tab', role: 'ADMIN', title: 'Admin', render: adminPage },
];
