import crypto from 'node:crypto';
import { all, get, j, setting, today } from '../lib/db.js';
import { DIMENSIONS, dimLabel } from './scoring.js';
import { getRhythm, baselineStatus } from './trends.js';
import { getPrefs, getGoalKeys } from './memory.js';
import { GOALS } from './goals.js';
import { addDays, daysBetween, clamp } from './util.js';

const SENS = { low: 0, medium: 1, high: 2 };
const jitter = (...parts) => parseInt(crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 6), 16) / 0xffffff;

/** Questions answered today as check-ins (assessment answers at signup do not count). */
export function answeredTodayCount(userId) {
  return get("SELECT COUNT(DISTINCT question_id) n FROM check_ins WHERE user_id=? AND day=? AND kind IN ('baseline','daily')", userId, today()).n;
}

/** How many questions the user should see per day: preference, capped by admin setting; ≥3 during the 7-day baseline. */
export function dailyQuota(userId) {
  const pref = Number(getPrefs(userId).questions_per_day) || 1;
  const cap = Number(setting('ai.max_questions_per_day')) || 3;
  const q = clamp(Math.round(pref), 1, cap);
  return baselineStatus(userId).complete ? q : Math.max(q, Math.min(3, cap));
}

const shape = (q) => ({ id: q.id, dimension: q.dimension, question: q.question, response_type: q.response_type, options: j(q.options, []), reverse: !!q.reverse });

/**
 * Pick today's question(s) from the approved library only. Never repeats a question inside its allowed_frequency_days,
 * respects the user's max sensitivity and the `ai.question_selection_enabled` setting (off → plain rotation).
 */
export function selectQuestions(userId, { count } = {}) {
  const t = today();
  const answeredToday = answeredTodayCount(userId);
  const remaining = Math.max(0, dailyQuota(userId) - answeredToday);
  const n = Math.max(0, Math.min(count ?? dailyQuota(userId), remaining));
  if (n === 0) return { questions: [], reasons: [] };

  const prefs = getPrefs(userId);
  const maxSens = SENS[prefs.max_sensitivity] ?? SENS.medium;
  const last = new Map(all('SELECT question_id, MAX(day) d FROM check_ins WHERE user_id=? AND question_id IS NOT NULL GROUP BY question_id', userId).map((r) => [r.question_id, r.d]));
  const todays = new Set(all('SELECT question_id FROM check_ins WHERE user_id=? AND day=?', userId, t).map((r) => r.question_id));

  const candidates = all('SELECT * FROM questions WHERE active=1 ORDER BY id').filter((q) => {
    if (todays.has(q.id)) return false;
    if ((SENS[q.sensitivity_level] ?? 0) > maxSens) return false;
    const l = last.get(q.id);
    return !l || daysBetween(l, t) >= Math.max(1, q.allowed_frequency_days);
  });

  const smart = setting('ai.question_selection_enabled') !== false;
  const rhythm = new Map(getRhythm(userId).map((r) => [r.key, r]));
  const goalDims = new Set(getGoalKeys(userId).flatMap((g) => GOALS.find((x) => x.key === g)?.dimensions || []));
  const focus = new Set(prefs.focus_areas || []);
  const recentDims = new Set(all('SELECT DISTINCT dimension FROM check_ins WHERE user_id=? AND day>=?', userId, addDays(t, -2)).map((r) => r.dimension));

  const scored = candidates.map((q) => {
    const l = last.get(q.id);
    const since = l ? daysBetween(l, t) : 60;
    let score = Math.min(since, 60) / 10 + (l ? 0 : 1.5); // staleness first
    const why = [];
    if (smart) {
      const r = rhythm.get(q.dimension);
      if (goalDims.has(q.dimension)) { score += 3; why.push(`you're focusing on ${dimLabel(q.dimension).toLowerCase()}`); }
      if (focus.has(q.dimension)) score += 2;
      if (!r?.has_data) { score += 5; why.push(`we don't have a ${dimLabel(q.dimension).toLowerCase()} reading yet`); }
      else if (!r.series7.length) { score += 4; why.push(`you haven't checked in on ${dimLabel(q.dimension).toLowerCase()} this past week`); }
      if (r?.delta7 <= -5) { score += 2; why.push(`your ${dimLabel(q.dimension).toLowerCase()} has dipped a little recently`); }
      if (recentDims.has(q.dimension)) score -= 1.5;
      score += jitter(userId, t, q.id) * 0.5;
    } else {
      score += jitter(userId, q.id) * 0.01; // stable rotation by staleness
    }
    return { q, score, why };
  }).sort((a, b) => b.score - a.score);

  const picked = []; const usedDims = new Set();
  for (const s of scored) { if (picked.length >= n) break; if (!usedDims.has(s.q.dimension)) { picked.push(s); usedDims.add(s.q.dimension); } }
  for (const s of scored) { if (picked.length >= n) break; if (!picked.includes(s)) picked.push(s); }

  const reasons = picked.map((s) => (s.why.length ? `Chosen because ${s.why[0]}.` : smart ? `A gentle check on ${dimLabel(s.q.dimension).toLowerCase()} to keep your rhythm balanced.` : 'Part of your regular rotation.'));
  return { questions: picked.map((s) => shape(s.q)), reasons };
}

export const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key);
