import { all, get, run, j, today, now, uuid } from '../lib/db.js';
import { DIMENSIONS } from './scoring.js';
import { loadSeries, loadBaselines, getRhythm, detectPatterns } from './trends.js';
import { getProfile, getGoalKeys } from './memory.js';
import { routineForDimension } from './discovery.js';
import { GOALS } from './goals.js';
import { guardOutput } from './claims.js';
import { addDays, mondayOf, mean, sd, round, round1, direction, clamp, truncate } from './util.js';

const DISCLAIMER = 'This summary reflects your reported information and is not medical advice or a diagnosis.';
const CLINICIAN_DISCLAIMER = 'This report summarises information reported by the person and is not medical advice or a diagnosis. It is intended to support a conversation with a qualified clinician.';
const lc = (s) => s.toLowerCase();
const window = (series, from, to) => series.filter((p) => p.day >= from && p.day <= to).map((p) => p.score);

function buildWeekContent(userId, weekStart) {
  const end = [addDays(weekStart, 6), today()].sort()[0];
  const start = addDays(end, -6);
  const pStart = addDays(start, -7); const pEnd = addDays(start, -1);
  const series = loadSeries(userId, pStart);
  const arrows = [];
  const moves = [];
  for (const d of DIMENSIONS.filter((x) => x.in_snapshot)) {
    const s = series.get(d.key) || [];
    const cur = window(s, start, end); const prev = window(s, pStart, pEnd);
    if (!cur.length) continue;
    const delta = prev.length ? mean(cur) - mean(prev) : 0;
    arrows.push({ dimension: d.key, label: d.label, direction: prev.length ? direction(delta) : 'steady', delta: round(delta), current: round(mean(cur)), has_previous: prev.length > 0 });
    moves.push({ d, delta, cur: mean(cur), hasPrev: prev.length > 0 });
  }
  const dataDays = get("SELECT COUNT(DISTINCT day) n FROM check_ins WHERE user_id=? AND kind IN ('baseline','daily') AND day>=? AND day<=?", userId, start, end).n;

  const reported = [];
  const withPrev = moves.filter((m) => m.hasPrev);
  for (const m of withPrev.filter((x) => x.delta >= 5).sort((a, b) => b.delta - a.delta).slice(0, 2)) reported.push(`You reported ${lc(m.d.label)} higher than the week before (about ${Math.round(m.delta)} points).`);
  for (const m of withPrev.filter((x) => x.delta <= -5).sort((a, b) => a.delta - b.delta).slice(0, 2)) reported.push(`You reported ${lc(m.d.label)} lower than the week before (about ${Math.abs(Math.round(m.delta))} points).`);
  const steady = withPrev.find((x) => Math.abs(x.delta) < 5);
  if (steady) reported.push(`Your ${lc(steady.d.label)} looked steady compared with the week before.`);
  if (!withPrev.length) for (const m of [...moves].sort((a, b) => b.cur - a.cur).slice(0, 3)) reported.push(`Your ${lc(m.d.label)} averaged around ${Math.round(m.cur)} this week.`);
  const pat = detectPatterns(userId)[0];
  if (pat) reported.push(pat.text);

  const ups = withPrev.filter((x) => x.delta >= 5).sort((a, b) => b.delta - a.delta);
  const downs = withPrev.filter((x) => x.delta <= -5).sort((a, b) => a.delta - b.delta);
  let reflection;
  if (dataDays < 3) reflection = `You checked in on ${dataDays} ${dataDays === 1 ? 'day' : 'days'} this week, which is a little light to draw much from. A few more check-ins will make next week's reflection more useful, and that's completely fine.`;
  else if (ups.length || downs.length) {
    const bits = [];
    if (ups[0]) bits.push(`${lc(ups[0].d.label)} a little higher`);
    if (downs[0]) bits.push(`${lc(downs[0].d.label)} a little lower`);
    reflection = `This week you reported ${bits.join(' and ')} than the week before. These are your own reports, and they can shift for many everyday reasons, so treat them as something to notice rather than conclude.`;
  } else reflection = 'Your reports this week looked fairly steady compared with the week before. Steady weeks are useful too, because they show what your usual rhythm feels like.';

  const focus = [...moves].sort((a, b) => a.cur - b.cur)[0];
  const routine = focus ? routineForDimension(focus.d.key) : null;
  const next = focus && routine
    ? `Next week, you could try ${routine.name} on a few days and notice whether ${lc(focus.d.label)} feels different in your check-ins.`
    : 'Next week, a few quick check-ins, even one question a day, will help build your picture.';

  const g = (t, fb) => guardOutput(t, { fallback: fb }).text;
  return {
    title: 'YOUR WEEK IN SVARA', week_start: weekStart, week_end: addDays(weekStart, 6), arrows,
    reported: reported.slice(0, 6).map((t) => g(t, 'Your reports are summarised in the arrows above.')),
    reflection: g(reflection, 'Here is a quiet look at what you reported this week.'),
    next_week: g(next, 'Next week, keep checking in when it suits you.'), disclaimer: DISCLAIMER, data_days: dataDays,
  };
}

export function generateWeeklyReportFor(userId, weekStart, { force = false } = {}) {
  const existing = get('SELECT * FROM weekly_reports WHERE user_id=? AND week_start=?', userId, weekStart);
  const fresh = existing && (weekStart < mondayOf(today()) || existing.updated_at.slice(0, 10) === today());
  if (existing && fresh && !force) return { id: existing.id, week_start: weekStart, content: j(existing.content, {}) };
  const content = buildWeekContent(userId, weekStart);
  const t = now();
  if (existing) {
    run('UPDATE weekly_reports SET content=?, updated_at=? WHERE id=?', JSON.stringify(content), t, existing.id);
    return { id: existing.id, week_start: weekStart, content };
  }
  const id = uuid();
  run('INSERT INTO weekly_reports (id,user_id,week_start,content,created_at,updated_at) VALUES (?,?,?,?,?,?)', id, userId, weekStart, JSON.stringify(content), t, t);
  return { id, week_start: weekStart, content };
}

export const generateWeeklyReport = (userId, { force = false } = {}) => generateWeeklyReportFor(userId, mondayOf(today()), { force });

/** Consent-time snapshot for a clinician. Observational only: no diagnosis, no prescribing language. */
export function buildClinicianReport(userId, rangeDays = null, { questions = [], comments = '' } = {}) {
  const t = today();
  const range = rangeDays ? Number(rangeDays) : null;
  const from = range ? addDays(t, -(range - 1)) : '1970-01-01';
  const series = loadSeries(userId, from);
  const base = loadBaselines(userId);
  const dimensions = DIMENSIONS.map((d) => {
    const s = series.get(d.key) || [];
    const recent = s.filter((p) => p.day >= addDays(t, -6)).map((p) => p.score);
    const cur = recent.length ? mean(recent) : s.length ? s[s.length - 1].score : null;
    const b = base[d.key] ?? null;
    const change = cur !== null && b !== null ? cur - b : 0;
    const v = sd(s.map((p) => p.score));
    return { key: d.key, label: d.label, current: round(cur), baseline: round(b), change: round(change), direction: direction(change), variability: round1(v), consistency: s.length >= 3 ? round(clamp(100 - v * 2.5, 0, 100)) : null };
  });
  const profile = getProfile(userId);
  const ctx = all('SELECT workload, exercised, late_screens FROM daily_context WHERE user_id=? AND day>=?', userId, from);
  const lifestyle_context = {
    ...(profile?.lifestyle || {}),
    days_with_context: ctx.length,
    heavy_workload_days: ctx.filter((c) => c.workload === 'heavy').length,
    exercise_days: ctx.filter((c) => c.exercised === 1).length,
    late_screen_days: ctx.filter((c) => c.late_screens === 1).length,
  };
  const rhythm = getRhythm(userId);
  const recent_changes = rhythm.filter((r) => r.has_data && r.delta7 !== 0 && Math.abs(r.delta7) >= 5)
    .map((r) => `${r.label}: reported ${r.delta7 > 0 ? 'higher' : 'lower'} over the last 7 days compared with the 7 days before (about ${Math.abs(r.delta7)} points).`);
  const goals = getGoalKeys(userId).map((k) => GOALS.find((g) => g.key === k)?.label).filter(Boolean);
  const userQs = (Array.isArray(questions) ? questions : []).map((q) => truncate(String(q).trim(), 300)).filter(Boolean).slice(0, 10);
  const defaults = ['Is there anything in my reported rhythm that would benefit from a professional assessment?', 'Are there everyday habits worth paying closer attention to?'];
  return {
    title: 'SVARA CLINICIAN REPORT', generated_at: now(), range_days: range, goals, lifestyle_context, dimensions,
    recent_changes, patterns: detectPatterns(userId).map((p) => p.text), user_comments: truncate(String(comments || '').trim(), 1000),
    questions_to_discuss: [...userQs, ...defaults.slice(0, Math.max(0, 3 - userQs.length))], disclaimer: CLINICIAN_DISCLAIMER,
  };
}

/** One calm sentence after a check-in (used by POST /api/checkin). */
export function reflectOnCheckIn(userId) {
  const rhythm = getRhythm(userId).filter((r) => r.has_data);
  if (!rhythm.length) return 'Thanks for checking in. Each answer adds to your picture.';
  const up = rhythm.filter((r) => r.delta7 >= 5).sort((a, b) => b.delta7 - a.delta7)[0];
  const down = rhythm.filter((r) => r.delta7 <= -5).sort((a, b) => a.delta7 - b.delta7)[0];
  if (up) return `Thanks for checking in. You've reported ${lc(up.label)} higher this past week than the week before.`;
  if (down) return `Thanks for checking in. You've reported ${lc(down.label)} a little lower this past week, and noticing that is useful in itself.`;
  return 'Thanks for checking in. Your reports have been fairly steady lately.';
}
