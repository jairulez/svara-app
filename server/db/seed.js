import crypto from 'node:crypto';
import { db, all, get, run, insert, tx, now, today, DEFAULT_SETTINGS } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { DIMENSIONS, toScore } from '../engine/scoring.js';
import { checkContent, checkProduct, checkText } from '../engine/claims.js';
import { buildClinicianReport, generateWeeklyReportFor } from '../engine/reports.js';
import { addDays, mondayOf, clamp, mean } from '../engine/util.js';
import { SAFETY_RULES, CLAIM_RULES } from './seed-data/rules.js';
import { QUESTION_ROWS } from './seed-data/questions.js';
import { ROUTINES } from './seed-data/routines.js';
import { ARTICLES } from './seed-data/content.js';
import { PRODUCTS } from './seed-data/products.js';

const enc = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? +v : v === undefined ? null : v);

/** Idempotent upsert by primary key id (keeps created_at, refreshes everything else). */
function upsert(table, row) {
  const t = now();
  const r = { created_at: t, updated_at: t, ...row };
  const cols = Object.keys(r);
  const sets = cols.filter((c) => c !== 'id' && c !== 'created_at').map((c) => `${c}=excluded.${c}`).join(',');
  db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${sets}`).run(...cols.map((c) => enc(r[c])));
}

// =====================================================================================
// Reference data
// =====================================================================================
export function seedReference() {
  tx(() => {
    for (const d of DIMENSIONS) upsert('wellness_dimensions', { id: `dim_${d.key}`, key: d.key, label: d.label, description: d.description, in_snapshot: d.in_snapshot, sort_order: d.sort_order, active: 1 });
    for (const q of QUESTION_ROWS) upsert('questions', q);
    for (const r of ROUTINES) upsert('routines', r);
    for (const r of CLAIM_RULES) upsert('claim_rules', { ...r, active: 1 });
    for (const r of SAFETY_RULES) upsert('safety_rules', { ...r, active: 1 });
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) run('INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES (?,?,?)', k, JSON.stringify(v), now());
    for (const a of ARTICLES) upsert('content', { id: `c_${a.slug}`, slug: a.slug, title: a.title, category: a.category, summary: a.summary, body: a.body, read_minutes: a.read_minutes, status: 'published', claim_check: '{}', active: 1 });
    for (const p of PRODUCTS) {
      upsert('products', p);
      run('DELETE FROM product_claims WHERE product_id=?', p.id);
      for (const c of p.approved_claims) insert('product_claims', { product_id: p.id, claim: c, claim_type: 'approved' });
      for (const c of p.restricted_claims) insert('product_claims', { product_id: p.id, claim: c, claim_type: 'restricted' });
      upsert('product_batches', { id: `pb_${p.id}`, product_id: p.id, batch_code: 'DEMO-0001', manufactured_on: null, expires_on: null, lab_report_url: null });
      upsert('product_regulatory_metadata', { id: `prm_${p.id}`, product_id: p.id, jurisdiction: 'IN', authority: null, category: p.regulatory_category, status: 'DEMO_NOT_APPROVED', reference: null, valid_until: null, notes: 'Illustrative demo record. No real approval or licence exists.' });
    }
  });
  assertSeedCompliance();
  return { dimensions: DIMENSIONS.length, questions: QUESTION_ROWS.length, routines: ROUTINES.length, content: ARTICLES.length, products: PRODUCTS.length };
}

/** Everything seeded must pass our own claim checker, and demo products must carry no fabricated approvals. */
function assertSeedCompliance() {
  const problems = [];
  for (const row of all('SELECT * FROM content')) {
    const r = checkContent(row);
    if (!r.ok) problems.push(`content "${row.slug}": ${r.violations.map((v) => `${v.label} ("${v.excerpt}")`).join('; ')}`);
  }
  for (const row of all('SELECT * FROM products')) {
    const r = checkProduct(row);
    if (!r.ok) problems.push(`product "${row.id}": ${r.violations.map((v) => `${v.label} ("${v.excerpt}")`).join('; ')}`);
    if (row.is_demo && (row.regulatory_status !== 'DEMO_NOT_APPROVED' || row.licence_reference !== null)) problems.push(`product "${row.id}": demo products must be DEMO_NOT_APPROVED with no licence`);
  }
  for (const row of all('SELECT id, name, steps, safety_notes FROM routines')) {
    const r = checkText([row.name, row.steps, row.safety_notes].join(' '));
    if (!r.ok) problems.push(`routine "${row.id}": ${r.violations.map((v) => v.label).join('; ')}`);
  }
  for (const row of all('SELECT id, question FROM questions')) {
    const r = checkText(row.question);
    if (!r.ok) problems.push(`question "${row.id}": ${r.violations.map((v) => v.label).join('; ')}`);
  }
  if (problems.length) throw new Error(`Seed compliance check failed:\n- ${problems.join('\n- ')}`);
}

// =====================================================================================
// Demo data (deterministic: seeded PRNG)
// =====================================================================================
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PASSWORD = 'SvaraDemo!2025';
const WEEKEND = { mood: 3, relaxation: 5, energy: 2, recovery: 3 };
const EXERCISE = { energy: 10, mood: 6, sleep: 4, recovery: 5, stress: 5, motivation: 6 };
const LATE_PREV = { sleep: -14 };

const PERSONAS = [
  { key: 'A', email: 'maya@svara.demo', name: 'Maya Rao', age: '25-34', seed: 1101, goals: ['relaxation', 'night_routine'],
    base: { sleep: 62, energy: 80, mood: 66, relaxation: 40, motivation: 62, focus: 64, recovery: 56, social_connection: 60, stress: 46, overall_wellbeing: 62 },
    sd: { default: 8 }, heavyP: 0.45, exerciseP: 0.35, lateP: 0.5, miss: 0.08, trend: { relaxation: { from: 45, delta: 26 } },
    heavy: { relaxation: -20, stress: -16, energy: -4, focus: -4, recovery: -6, sleep: -4, mood: -4 },
    routines: ['r_evening_wind_down', 'r_breathing_break', 'r_workday_reset', 'r_digital_sunset'], routineP: 0.3, routineLateP: 0.55,
    lifestyle: { activity_level: 'moderate', work_pattern: 'Desk-based, often long hours', sleep_schedule: 'Around 11:30pm to 7am', lifestyle: 'Busy professional' } },
  { key: 'B', email: 'arjun@svara.demo', name: 'Arjun Mehta', age: '35-44', seed: 2202, goals: ['motivation', 'focus'],
    base: { sleep: 82, energy: 66, mood: 70, relaxation: 66, motivation: 55, focus: 64, recovery: 68, social_connection: 66, stress: 64, overall_wellbeing: 70 },
    sd: { default: 7, motivation: 20 }, heavyP: 0.25, exerciseP: 0.5, lateP: 0.3, miss: 0.1, trend: {},
    heavy: { relaxation: -10, stress: -10, focus: -6, motivation: -8 },
    routines: ['r_morning_reset', 'r_movement_break', 'r_workday_reset'], routineP: 0.25, routineLateP: 0.25,
    lifestyle: { activity_level: 'active', work_pattern: 'Hybrid, flexible hours', sleep_schedule: 'Around 10:30pm to 6:30am', lifestyle: 'Freelance consultant' } },
  { key: 'C', email: 'neha@svara.demo', name: 'Neha Iyer', age: '25-34', seed: 3303, goals: ['night_routine', 'recovery', 'relaxation'],
    base: { sleep: 52, energy: 55, mood: 56, relaxation: 48, motivation: 56, focus: 52, recovery: 46, social_connection: 52, stress: 30, overall_wellbeing: 48 },
    sd: { default: 9, sleep: 13 }, heavyP: 0.55, exerciseP: 0.25, lateP: 0.55, miss: 0.18, trend: {},
    heavy: { relaxation: -14, stress: -16, energy: -8, focus: -6, recovery: -8, sleep: -8, mood: -6 },
    routines: ['r_sleep_consistency', 'r_evening_wind_down', 'r_breathing_break'], routineP: 0.2, routineLateP: 0.2,
    lifestyle: { activity_level: 'light', work_pattern: 'Shift-based with deadlines', sleep_schedule: 'Varies, roughly midnight to 7am', lifestyle: 'Product manager' } },
  { key: 'D', email: 'rohan@svara.demo', name: 'Rohan Shah', age: '35-44', seed: 4404, goals: ['energy', 'social'],
    base: { sleep: 68, energy: 66, mood: 68, relaxation: 64, motivation: 65, focus: 66, recovery: 64, social_connection: 68, stress: 62, overall_wellbeing: 67 },
    sd: { default: 6 }, heavyP: 0.25, exerciseP: 0.45, lateP: 0.3, miss: 0.1, trend: {},
    heavy: { relaxation: -6, stress: -6 },
    routines: ['r_morning_reset', 'r_weekend_recovery', 'r_screen_free_evening'], routineP: 0.2, routineLateP: 0.2,
    lifestyle: { activity_level: 'moderate', work_pattern: 'Regular office hours', sleep_schedule: 'Around 11pm to 6:45am', lifestyle: 'Teacher' } },
];

const stamp = (day, rnd) => `${day}T${String(7 + Math.floor(rnd() * 14)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00.000Z`;
const consentRow = (userId, type, granted, at) => insert('consents', { user_id: userId, type, granted: granted ? 1 : 0, version: '2025-01', detail: '{}', created_at: at, updated_at: at });

function wipeDemo() {
  const ids = all('SELECT id FROM users WHERE is_demo=1').map((r) => r.id);
  const clin = all('SELECT c.id FROM clinicians c JOIN users u ON u.id=c.user_id WHERE u.is_demo=1').map((r) => r.id);
  const inList = (a) => a.map(() => '?').join(',') || "''";
  tx(() => {
    run(`DELETE FROM clinician_notes WHERE user_id IN (${inList(ids)}) OR clinician_id IN (${inList(clin)})`, ...ids, ...clin);
    run(`DELETE FROM clinician_reports WHERE user_id IN (${inList(ids)}) OR clinician_id IN (${inList(clin)})`, ...ids, ...clin);
    run(`DELETE FROM clinician_assignments WHERE user_id IN (${inList(ids)}) OR clinician_id IN (${inList(clin)})`, ...ids, ...clin);
    for (const id of ids) run('DELETE FROM users WHERE id=?', id); // cascades profiles, check-ins, goals, notifications, conversations, …
    run(`DELETE FROM analytics_events WHERE props LIKE '%"seed":true%'`);
    run(`DELETE FROM audit_logs WHERE detail LIKE '%"seed":true%'`);
    run(`DELETE FROM safety_events WHERE excerpt LIKE '[demo sample]%'`);
  });
}

export function seedDemo({ reset = false } = {}) {
  if (reset) wipeDemo();
  else if (get('SELECT 1 x FROM users WHERE is_demo=1')) return { skipped: true };
  const T = today();
  const startDay = addDays(T, -90);
  const dailyByDim = {};
  for (const q of all("SELECT id, dimension, reverse FROM questions WHERE pool='daily' ORDER BY id")) (dailyByDim[q.dimension] ||= []).push(q);
  const assessmentQs = all("SELECT id, dimension, reverse FROM questions WHERE pool='assessment' ORDER BY id");
  const dimKeys = DIMENSIONS.map((d) => d.key);
  const hashes = new Map();
  const pw = (email) => { if (!hashes.has(email)) hashes.set(email, hashPassword(PASSWORD)); return hashes.get(email); };
  const mkUser = (email, role, at) => insert('users', { email, password_hash: pw(email), role, status: 'active', is_demo: 1, auth_provider: 'password', created_at: at, updated_at: at });
  const mkProfile = (u, name, age, lifestyle, preferences, at) => insert('user_profiles', { user_id: u.id, name, age_range: age, timezone: 'Asia/Kolkata', lifestyle, preferences, onboarding_completed: 1, created_at: at, updated_at: at });

  const users = {};
  const result = tx(() => {
    // ---------------- staff ----------------
    const admin = mkUser('admin@svara.demo', 'ADMIN', `${startDay}T08:00:00.000Z`);
    mkProfile(admin, 'Demo Admin', null, {}, {}, `${startDay}T08:00:00.000Z`);
    const cu = mkUser('clinician@svara.demo', 'CLINICIAN', `${startDay}T08:00:00.000Z`);
    mkProfile(cu, 'Dr. Demo Clinician', null, {}, {}, `${startDay}T08:00:00.000Z`);
    const clinician = insert('clinicians', { user_id: cu.id, display_name: 'Dr. Demo Clinician', specialty: 'Lifestyle and wellness (demo)', licence_reference: null, bio: 'A fictional demo clinician used to illustrate the SVARA clinician pathway. Not a real person.', is_demo: 1, active: 1 });

    // ---------------- personas ----------------
    for (const p of PERSONAS) {
      const rnd = mulberry32(p.seed);
      const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * Math.cos(2 * Math.PI * rnd());
      const created = `${addDays(T, -90)}T07:30:00.000Z`;
      const u = mkUser(p.email, 'USER', created);
      users[p.key] = u;
      mkProfile(u, p.name, p.age, p.lifestyle, {
        checkin_frequency: 'daily', questions_per_day: 2, focus_areas: p.goals.slice(0, 2).map((g) => GOAL_DIM[g]).filter(Boolean), max_sensitivity: 'medium',
        notifications: { daily: true, weekly: true, reports: true },
      }, created);
      for (const g of p.goals) insert('wellness_goals', { user_id: u.id, goal_key: g, active: 1, created_at: created, updated_at: created });
      for (const [type, granted] of [['terms', 1], ['privacy', 1], ['ai_processing', 1], ['analytics', 1], ['marketing', 0]]) consentRow(u.id, type, granted, created);

      const scoreAcc = new Map(); // `${dim}|${day}` -> scores[]
      const addCheckIn = (q, day, kind, raw) => {
        const at = stamp(day, rnd);
        const score = toScore(raw, !!q.reverse);
        insert('check_ins', { user_id: u.id, question_id: q.id, dimension: q.dimension, kind, raw_value: raw, score, note: null, day, created_at: at, updated_at: at });
        const k = `${q.dimension}|${day}`;
        if (!scoreAcc.has(k)) scoreAcc.set(k, []);
        scoreAcc.get(k).push(score);
      };
      const rawFor = (q, level) => { const s = Math.round(clamp(level, 3, 97) / 25); return q.reverse ? 5 - s : s + 1; };

      let prevLate = false;
      const N = 90;
      for (let i = 0; i < N; i++) {
        const day = addDays(startDay, i); // 90 days ending yesterday, so demo users can still check in today
        const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
        const weekend = dow === 0 || dow === 6;
        const r = rnd();
        const workload = weekend ? (r < 0.08 ? 'heavy' : r < 0.35 ? 'moderate' : 'light') : (r < p.heavyP ? 'heavy' : r < p.heavyP + 0.4 ? 'moderate' : 'light');
        const exercised = rnd() < p.exerciseP;
        const late = rnd() < p.lateP;
        const skip = i >= 7 && i < N - 3 && rnd() < p.miss;
        const level = (dim) => {
          let v = p.base[dim];
          const tr = p.trend[dim];
          if (tr && i >= tr.from) v += (tr.delta * (i - tr.from)) / (N - 1 - tr.from);
          if (weekend) v += WEEKEND[dim] || 0;
          const h = p.heavy[dim] || 0;
          if (workload === 'heavy') v += h; else if (workload === 'light') v -= h * 0.3;
          if (exercised) v += EXERCISE[dim] || 0;
          if (prevLate) v += LATE_PREV[dim] || 0;
          return v + gauss() * (p.sd[dim] ?? p.sd.default);
        };
        const levels = Object.fromEntries(dimKeys.map((d) => [d, level(d)]));
        if (!skip) {
          const at = stamp(day, rnd);
          insert('daily_context', { user_id: u.id, day, workload, exercised: exercised ? 1 : 0, late_screens: late ? 1 : 0, note: null, created_at: at, updated_at: at });
          if (i === 0) for (const q of assessmentQs) addCheckIn(q, day, 'assessment', rawFor(q, levels[q.dimension]));
          const baseline = i < 7;
          const per = baseline ? 5 : 4;
          const start = baseline ? (i * 5) % 10 : (i * 4 + 3) % 10;
          for (let k = 0; k < per; k++) {
            const dim = dimKeys[(start + k) % 10];
            const list = dailyByDim[dim];
            addCheckIn(list[(i + k) % list.length], day, baseline ? 'baseline' : 'daily', rawFor(list[(i + k) % list.length], levels[dim]));
          }
          // routine activity
          if (rnd() < (i >= 55 ? p.routineLateP : p.routineP)) {
            const rid = p.routines[Math.floor(rnd() * p.routines.length)];
            const s = rnd();
            const status = s < 0.8 ? 'completed' : s < 0.9 ? 'started' : 'skipped';
            const st = stamp(day, rnd);
            insert('routine_activity', { user_id: u.id, routine_id: rid, status, day, started_at: status === 'skipped' ? null : st, completed_at: status === 'completed' ? st : null, created_at: st, updated_at: st });
          }
        }
        prevLate = late;
      }
      for (const [k, arr] of scoreAcc) {
        const [dimension, day] = k.split('|');
        const at = `${day}T20:00:00.000Z`;
        insert('wellness_scores', { user_id: u.id, dimension, day, score: mean(arr), samples: arr.length, created_at: at, updated_at: at });
      }
      // baseline milestone + a prompt
      insert('notifications', { user_id: u.id, type: 'baseline_complete', title: "You've completed your 7-day baseline.", body: 'Your My Rhythm view now compares each day with your own starting point.', link: '/home', read_at: `${addDays(startDay, 9)}T09:00:00.000Z`, created_at: `${addDays(startDay, 8)}T09:00:00.000Z`, updated_at: `${addDays(startDay, 8)}T09:00:00.000Z` });
      insert('notifications', { user_id: u.id, type: 'daily_prompt', title: 'One question for you today.', body: 'A quick check-in takes less than a minute.', link: '/checkin' });
    }

    // ---------------- clinician pathway ----------------
    const maya = users.A; const arjun = users.B;
    for (const u of [users.C, users.D]) consentRow(u.id, 'clinician_sharing', false, `${addDays(T, -60)}T09:00:00.000Z`);
    const mayaConsentAt = `${addDays(T, -12)}T10:00:00.000Z`;
    const mc = consentRow(maya.id, 'clinician_sharing', true, mayaConsentAt);
    const ac = consentRow(arjun.id, 'clinician_sharing', true, `${addDays(T, -2)}T18:00:00.000Z`);
    insert('clinician_assignments', { clinician_id: clinician.id, user_id: maya.id, status: 'active' });
    insert('clinician_assignments', { clinician_id: clinician.id, user_id: arjun.id, status: 'active' });
    const mayaReport = insert('clinician_reports', {
      user_id: maya.id, clinician_id: clinician.id, range_days: 30, status: 'closed', scheduled_for: `${addDays(T, -9)}T11:00:00.000Z`, consent_id: mc.id, revoked_at: null,
      content: JSON.stringify(buildClinicianReport(maya.id, 30, { questions: ['Is there anything in my reported rhythm that would benefit from a professional assessment?', 'Are there everyday habits worth paying closer attention to in the evenings?'], comments: 'Evenings feel hard to switch off from on busy workdays. I would like to understand my rhythm better.' })),
      created_at: mayaConsentAt, updated_at: `${addDays(T, -8)}T12:00:00.000Z`,
    });
    const noteAt = (d) => `${addDays(T, -d)}T12:00:00.000Z`;
    insert('clinician_notes', { report_id: mayaReport.id, clinician_id: clinician.id, user_id: maya.id, kind: 'note', body: 'Thank you for sharing your rhythm summary. Evenings on heavy workload days stand out in your reports, and your recent relaxation reports look a little higher.', visible_to_user: 1, created_at: noteAt(9), updated_at: noteAt(9) });
    insert('clinician_notes', { report_id: mayaReport.id, clinician_id: clinician.id, user_id: maya.id, kind: 'decision', body: 'Consultation completed. Continue your evening routine and keep noting workload; no further follow-up needed unless you would like one.', visible_to_user: 1, created_at: noteAt(8), updated_at: noteAt(8) });
    insert('clinician_notes', { report_id: mayaReport.id, clinician_id: clinician.id, user_id: maya.id, kind: 'next_step', body: 'Keep tracking your evenings for a few more weeks. [product-pathway] You may view general product information in SVARA if you are curious; please check with a pharmacist before trying anything new.', visible_to_user: 1, created_at: noteAt(8), updated_at: noteAt(8) });
    insert('clinician_reports', {
      user_id: arjun.id, clinician_id: clinician.id, range_days: 30, status: 'requested', scheduled_for: null, consent_id: ac.id, revoked_at: null,
      content: JSON.stringify(buildClinicianReport(arjun.id, 30, { questions: ['Why does my motivation vary so much from day to day?'], comments: 'Sleep is good but motivation swings a lot. I would like a professional view on whether I should look at anything else.' })),
      created_at: `${addDays(T, -2)}T18:00:00.000Z`, updated_at: `${addDays(T, -2)}T18:00:00.000Z`,
    });
    insert('notifications', { user_id: maya.id, type: 'clinician_note', title: 'Your clinician added a note.', body: 'You can read it on the Clinician page.', link: '/clinician', read_at: noteAt(7), created_at: noteAt(8), updated_at: noteAt(8) });
    insert('notifications', { user_id: arjun.id, type: 'clinician_request', title: 'Your clinician request was received.', body: 'A clinician will review the summary you chose to share.', link: '/clinician', created_at: `${addDays(T, -2)}T18:01:00.000Z`, updated_at: `${addDays(T, -2)}T18:01:00.000Z` });
    for (const a of [
      { id: maya.id, role: 'USER', action: 'clinician.report_shared', at: mayaConsentAt, subj: maya.id },
      { id: cu.id, role: 'CLINICIAN', action: 'clinician.view_report', at: noteAt(9), subj: maya.id },
      { id: cu.id, role: 'CLINICIAN', action: 'clinician.view_report', at: noteAt(8), subj: maya.id },
      { id: arjun.id, role: 'USER', action: 'clinician.report_shared', at: `${addDays(T, -2)}T18:00:00.000Z`, subj: arjun.id },
    ]) insert('audit_logs', { actor_id: a.id, actor_role: a.role, action: a.action, target_type: 'clinician_report', target_id: null, subject_user_id: a.subj, ip_hash: null, detail: '{"seed":true}', created_at: a.at, updated_at: a.at });

    // ---------------- misc demo data for admin views ----------------
    const rnd = mulberry32(9009);
    const funnel = [['landing_view', 120], ['wellness_check_started', 70], ['wellness_check_completed', 52], ['account_created', 18], ['baseline_completed', 7], ['check_in_completed', 140], ['dashboard_viewed', 90], ['weekly_report_viewed', 24], ['routine_completed', 30], ['clinician_requested', 5]];
    for (const [name, n] of funnel) {
      for (let i = 0; i < n; i++) {
        const at = `${addDays(T, -Math.floor(rnd() * 14))}T${String(Math.floor(rnd() * 24)).padStart(2, '0')}:00:00.000Z`;
        insert('analytics_events', { name, anon_id: crypto.createHash('sha256').update(`seed${name}${Math.floor(rnd() * 40)}`).digest('hex').slice(0, 20), props: '{"seed":true}', created_at: at, updated_at: at });
      }
    }
    insert('safety_events', { user_id: null, category: 'MEDICAL_QUESTION', rule_label: 'Medical or diagnostic question', source: 'guide', excerpt: '[demo sample] question asking for an assessment of symptoms', action: 'templated_reply' });
    insert('safety_events', { user_id: null, category: 'PRODUCT_DOSAGE', rule_label: 'Product dosage question', source: 'guide', excerpt: '[demo sample] question about how much of a product to use', action: 'templated_reply' });
    return { users: { admin: admin.email, clinician: cu.email, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) } };
  });

  // weekly reports for the last two completed weeks (engine-generated, so they match the data)
  const thisMonday = mondayOf(T);
  for (const u of Object.values(users)) {
    for (const ws of [addDays(thisMonday, -14), addDays(thisMonday, -7)]) generateWeeklyReportFor(u.id, ws, { force: true });
    insert('notifications', { user_id: u.id, type: 'weekly_ready', title: 'YOUR WEEK IN SVARA is ready.', body: 'A short, calm look back at what you reported this week.', link: '/weekly' });
  }
  return result;
}

const GOAL_DIM = { night_routine: 'sleep', relaxation: 'relaxation', energy: 'energy', focus: 'focus', recovery: 'recovery', mood: 'mood', motivation: 'motivation', social: 'social_connection' };
