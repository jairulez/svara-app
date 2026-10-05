import { all, get, run, insert, j, today, now, uuid } from '../lib/db.js';
import { DIMENSIONS, toScore } from './scoring.js';
import { classify, logEvent } from './safety.js';
import { addDays, mean, sd, clamp, round, round1, httpError, direction, isDay, truncate } from './util.js';

export const WINDOWS = [7, 14, 30, 90, 365];

/** Map dimension → [{day,score}] sorted ascending, from `fromDay` on. */
export function loadSeries(userId, fromDay) {
  const m = new Map();
  for (const r of all('SELECT dimension, day, score FROM wellness_scores WHERE user_id=? AND day>=? ORDER BY day', userId, fromDay)) {
    if (!m.has(r.dimension)) m.set(r.dimension, []);
    m.get(r.dimension).push({ day: r.day, score: r.score });
  }
  return m;
}

/** Baseline per dimension: mean of `baseline` check-ins, else of `assessment` check-ins. */
export function loadBaselines(userId) {
  const out = {};
  const rows = all("SELECT dimension, kind, AVG(score) s FROM check_ins WHERE user_id=? AND kind IN ('baseline','assessment') GROUP BY dimension, kind", userId);
  for (const r of rows) if (r.kind === 'baseline' || out[r.dimension] === undefined) out[r.dimension] = r.s;
  // a baseline row must beat an assessment row regardless of iteration order
  for (const r of rows) if (r.kind === 'baseline') out[r.dimension] = r.s;
  return out;
}

export function baselineStatus(userId) {
  const days = get("SELECT COUNT(DISTINCT day) n FROM check_ins WHERE user_id=? AND kind='baseline'", userId).n;
  return { days_completed: Math.min(days, 7), target: 7, complete: days >= 7 };
}

/** Record one check-in answer and refresh the rolled-up wellness_scores row for that dimension/day. */
export function recordCheckIn(userId, { question_id, raw_value, note, kind, day } = {}) {
  const q = get('SELECT id, dimension, reverse, active FROM questions WHERE id=?', question_id);
  if (!q || !q.active) throw httpError(400, 'Unknown question.');
  const score = toScore(raw_value, !!q.reverse); // validates 1–5
  const d = day ?? today();
  if (!isDay(d)) throw httpError(400, 'Invalid day.');
  let k = kind;
  if (!['assessment', 'baseline', 'daily'].includes(k)) {
    const st = baselineStatus(userId);
    const todayIsBaseline = get("SELECT 1 x FROM check_ins WHERE user_id=? AND kind='baseline' AND day=?", userId, d);
    k = !st.complete || todayIsBaseline ? 'baseline' : 'daily';
  }
  const cleanNote = note ? truncate(String(note).trim(), 500) : null;
  if (cleanNote) {
    const c = classify(cleanNote);
    if (c.category !== 'NORMAL_WELLNESS') logEvent({ userId, category: c.category, rule_label: c.rule_label, source: 'checkin_note', text: cleanNote, action: 'flagged' });
  }
  const row = insert('check_ins', { user_id: userId, question_id: q.id, dimension: q.dimension, kind: k, raw_value: Number(raw_value), score, note: cleanNote, day: d });
  const agg = get('SELECT AVG(score) s, COUNT(*) n FROM check_ins WHERE user_id=? AND dimension=? AND day=?', userId, q.dimension, d);
  const t = now();
  run(`INSERT INTO wellness_scores (id,user_id,dimension,day,score,samples,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,dimension,day) DO UPDATE SET score=excluded.score, samples=excluded.samples, updated_at=excluded.updated_at`,
  uuid(), userId, q.dimension, d, agg.s, agg.n, t, t);
  return row;
}

export function recordContext(userId, day, ctx = {}) {
  const d = day ?? today();
  if (!isDay(d)) throw httpError(400, 'Invalid day.');
  if (ctx.workload != null && !['light', 'moderate', 'heavy'].includes(ctx.workload)) throw httpError(400, 'Invalid workload value.');
  const bool = (v) => (v === undefined || v === null ? null : v ? 1 : 0);
  const existing = get('SELECT * FROM daily_context WHERE user_id=? AND day=?', userId, d);
  const next = {
    workload: ctx.workload ?? existing?.workload ?? null,
    exercised: ctx.exercised !== undefined ? bool(ctx.exercised) : existing?.exercised ?? null,
    late_screens: ctx.late_screens !== undefined ? bool(ctx.late_screens) : existing?.late_screens ?? null,
    note: ctx.note !== undefined ? truncate(ctx.note || '', 300) || null : existing?.note ?? null,
  };
  const t = now();
  run(`INSERT INTO daily_context (id,user_id,day,workload,exercised,late_screens,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,day) DO UPDATE SET workload=excluded.workload, exercised=excluded.exercised, late_screens=excluded.late_screens, note=excluded.note, updated_at=excluded.updated_at`,
  uuid(), userId, d, next.workload, next.exercised, next.late_screens, next.note, t, t);
  return get('SELECT * FROM daily_context WHERE user_id=? AND day=?', userId, d);
}

const stdev30 = (series, t) => sd(series.filter((p) => p.day >= addDays(t, -29)).map((p) => p.score));
const consistencyOf = (v, n) => (n < 3 ? null : round(clamp(100 - v * 2.5, 0, 100)));

/** "My Rhythm": per-dimension current vs baseline, direction and sparkline series. Sparse-data safe. */
export function getRhythm(userId) {
  const t = today();
  const series = loadSeries(userId, addDays(t, -60));
  const base = loadBaselines(userId);
  return DIMENSIONS.map((d) => {
    const s = series.get(d.key) || [];
    const last7 = s.filter((p) => p.day >= addDays(t, -6) && p.day <= t).map((p) => p.score);
    const prev7 = s.filter((p) => p.day >= addDays(t, -13) && p.day <= addDays(t, -7)).map((p) => p.score);
    const has = s.length > 0;
    const curRaw = last7.length ? mean(last7) : has ? s[s.length - 1].score : null;
    const delta = last7.length && prev7.length ? mean(last7) - mean(prev7) : 0;
    const v30 = stdev30(s, t);
    const n30 = s.filter((p) => p.day >= addDays(t, -29)).length;
    return {
      key: d.key, label: d.label, description: d.description, primary: !!d.in_snapshot, has_data: has,
      current: round(curRaw), baseline: base[d.key] === undefined ? null : round(base[d.key]),
      delta7: round(delta), direction: direction(delta), variability: round1(v30), consistency: consistencyOf(v30, n30),
      series7: s.filter((p) => p.day >= addDays(t, -6)).map((p) => ({ day: p.day, score: round(p.score) })),
      series30: s.filter((p) => p.day >= addDays(t, -29)).map((p) => ({ day: p.day, score: round(p.score) })),
    };
  });
}

export function getTrends(userId, windowDays = 30) {
  const w = WINDOWS.includes(Number(windowDays)) ? Number(windowDays) : 30;
  const t = today();
  const from = addDays(t, -(w - 1));
  const series = loadSeries(userId, from);
  const base = loadBaselines(userId);
  const stamp = now();
  const dimensions = DIMENSIONS.map((d) => {
    const s = (series.get(d.key) || []).filter((p) => p.day <= t);
    const recent = s.filter((p) => p.day >= addDays(t, -Math.min(w, 7) + 1)).map((p) => p.score);
    const cur = recent.length ? mean(recent) : s.length ? s[s.length - 1].score : null;
    const b = base[d.key] === undefined ? null : base[d.key];
    let change = 0;
    if (cur !== null && b !== null) change = cur - b;
    else if (s.length >= 4) { const h = Math.floor(s.length / 2); change = mean(s.slice(h).map((p) => p.score)) - mean(s.slice(0, h).map((p) => p.score)); }
    const v = sd(s.map((p) => p.score));
    const out = {
      key: d.key, label: d.label, current: round(cur), baseline: round(b), change: round(change), variability: round1(v),
      consistency: consistencyOf(v, s.length), direction: direction(change), series: s.map((p) => ({ day: p.day, score: round(p.score) })),
    };
    run(`INSERT INTO trend_snapshots (id,user_id,dimension,window_days,current_score,baseline_score,change,variability,consistency,direction,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,dimension,window_days) DO UPDATE SET current_score=excluded.current_score,
         baseline_score=excluded.baseline_score, change=excluded.change, variability=excluded.variability, consistency=excluded.consistency,
         direction=excluded.direction, updated_at=excluded.updated_at`,
    uuid(), userId, d.key, w, out.current, out.baseline, out.change, out.variability, out.consistency, out.direction, stamp, stamp);
    return out;
  });
  return { window_days: w, dimensions };
}

const PATTERN_DEFS = [
  { kind: 'workload', dims: { relaxation: 0, stress: 0, energy: 0, focus: 0, recovery: 0, mood: 0, sleep: 0 }, read: (c) => (c.workload ? c.workload === 'heavy' : null) },
  { kind: 'exercise', dims: { energy: 0, mood: 0, sleep: 0, recovery: 0, stress: 0, motivation: 0 }, read: (c) => (c.exercised === null ? null : !!c.exercised) },
  { kind: 'late_screens', dims: { sleep: 1, relaxation: 0, energy: 1 }, read: (c) => (c.late_screens === null ? null : !!c.late_screens) },
];

/** Observational comparisons between daily context and dimension scores. Needs n≥3 each side and a ≥8 point gap. */
export function detectPatterns(userId) {
  const t = today();
  const from = addDays(t, -120);
  const series = loadSeries(userId, from);
  const ctxRows = all('SELECT day, workload, exercised, late_screens FROM daily_context WHERE user_id=? AND day>=?', userId, from);
  if (ctxRows.length < 6) return [];
  const ctxByDay = new Map(ctxRows.map((c) => [c.day, c]));
  const label = (k) => DIMENSIONS.find((d) => d.key === k).label.toLowerCase();
  const found = [];
  for (const def of PATTERN_DEFS) {
    for (const [dim, lag] of Object.entries(def.dims)) {
      const yes = []; const no = [];
      for (const p of series.get(dim) || []) {
        const c = ctxByDay.get(lag ? addDays(p.day, -lag) : p.day);
        if (!c) continue;
        const flag = def.read(c);
        if (flag === null) continue;
        (flag ? yes : no).push(p.score);
      }
      if (yes.length < 3 || no.length < 3) continue;
      const gap = mean(yes) - mean(no);
      if (Math.abs(gap) < 8) continue;
      const n = yes.length + no.length;
      const pts = `${Math.round(Math.abs(gap))} points ${gap < 0 ? 'lower' : 'higher'}`;
      const dir = gap < 0 ? 'lower' : 'higher';
      let text;
      if (def.kind === 'workload') text = `You've reported ${dir} ${label(dim)} on days with a heavy workload (around ${pts}, across ${n} days).`;
      else if (def.kind === 'exercise') text = `You've reported ${dir} ${label(dim)} on days when you noted exercise (around ${pts}, across ${n} days).`;
      else text = lag ? `You've reported ${dir} ${label(dim)} on the day after late screen time (around ${pts}, across ${n} days).` : `You've reported ${dir} ${label(dim)} on days with late screen time (around ${pts}, across ${n} days).`;
      found.push({ id: `${def.kind}:${dim}`, dimension: dim, kind: def.kind, n, text, gap: Math.round(gap) });
    }
  }
  return found.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 8);
}

/** Pure helper: compare two score lists with the same rules as detectPatterns (exported for tests). */
export function comparePattern(yes, no, { minN = 3, minGap = 8 } = {}) {
  if (yes.length < minN || no.length < minN) return null;
  const gap = mean(yes) - mean(no);
  return Math.abs(gap) < minGap ? null : { gap: Math.round(gap), n: yes.length + no.length };
}
