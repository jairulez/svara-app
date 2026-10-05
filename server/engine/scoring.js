import { all } from '../lib/db.js';
import { httpError } from './util.js';

export const DIMENSIONS = [
  { key: 'sleep', label: 'Sleep', description: 'How rested and refreshed you feel when you wake up.', in_snapshot: 1, sort_order: 1 },
  { key: 'energy', label: 'Energy', description: 'How energetic and steady your energy feels through the day.', in_snapshot: 1, sort_order: 2 },
  { key: 'mood', label: 'Mood', description: 'How your everyday mood feels, without judging it.', in_snapshot: 1, sort_order: 3 },
  { key: 'relaxation', label: 'Relaxation', description: 'How easy it is to unwind and switch off.', in_snapshot: 1, sort_order: 4 },
  { key: 'motivation', label: 'Motivation', description: 'How much drive you feel to get started and keep going.', in_snapshot: 1, sort_order: 5 },
  { key: 'focus', label: 'Focus', description: 'How easy it is to concentrate and stay with a task.', in_snapshot: 1, sort_order: 6 },
  { key: 'recovery', label: 'Recovery', description: 'How well your body and mind bounce back after effort.', in_snapshot: 1, sort_order: 7 },
  { key: 'social_connection', label: 'Social connection', description: 'How connected and supported you feel around other people.', in_snapshot: 1, sort_order: 8 },
  { key: 'stress', label: 'Stress ease', description: 'How manageable things feel. Higher means less mental overload.', in_snapshot: 0, sort_order: 9 },
  { key: 'overall_wellbeing', label: 'Overall wellbeing', description: 'How satisfied you feel with your day overall.', in_snapshot: 0, sort_order: 10 },
];
export const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key);
export const dimLabel = (key) => DIMENSIONS.find((d) => d.key === key)?.label || key;

/** Raw 1–5 answer → 0–100 score, higher = feels better. `reverse` inverts (a high answer means a worse state). */
export function toScore(raw, reverse = false) {
  const r = Number(raw);
  if (!Number.isInteger(r) || r < 1 || r > 5) throw httpError(400, 'Answer value must be a whole number from 1 to 5.');
  const s = (r - 1) * 25;
  return reverse ? 100 - s : s;
}

/** Public assessment scoring: per-dimension averages only. There is intentionally no composite score. */
export function scoreAssessment(answers) {
  if (!Array.isArray(answers) || answers.length === 0) throw httpError(400, 'Please answer at least one question.');
  if (answers.length > 50) throw httpError(400, 'Too many answers.');
  const pool = new Map(all("SELECT id, dimension, reverse FROM questions WHERE pool='assessment' AND active=1").map((q) => [q.id, q]));
  const byQ = new Map();
  for (const a of answers) {
    const q = pool.get(a?.question_id);
    if (!q) throw httpError(400, 'Unknown assessment question.');
    byQ.set(q.id, toScore(a.value, !!q.reverse)); // last answer wins per question
  }
  const buckets = {};
  for (const [id, score] of byQ) (buckets[pool.get(id).dimension] ||= []).push(score);
  const scores = {};
  for (const key of DIMENSION_KEYS) if (buckets[key]) scores[key] = Math.round(buckets[key].reduce((s, x) => s + x, 0) / buckets[key].length);
  return { scores, answered: byQ.size };
}
