import { all, get, j } from '../lib/db.js';
import { getRhythm, detectPatterns } from './trends.js';
import { listDisplayableProducts } from './claims.js';
import { productEligibility } from './eligibility.js';
import { GOALS, DIM_CATEGORY, GOAL_ROUTINE, DIM_ROUTINE } from './goals.js';
import { dimLabel } from './scoring.js';
import { httpError } from './util.js';

export { GOALS, productEligibility };

export const parseRoutine = (r) => (r ? { ...r, steps: j(r.steps, []), dimensions: j(r.dimensions, []), source_metadata: j(r.source_metadata, {}), active: !!r.active } : null);
export const routineById = (id) => parseRoutine(get('SELECT * FROM routines WHERE id=? AND active=1', id));
export const routineForGoal = (goalKey) => routineById(GOAL_ROUTINE[goalKey]);
export const routineForDimension = (dim) => routineById(DIM_ROUTINE[dim]);

export function articlesForCategories(categories, limit = 3) {
  const cats = [...new Set(categories)];
  if (!cats.length) return [];
  return all(`SELECT title, slug, category, summary FROM content WHERE status='published' AND active=1 AND category IN (${cats.map(() => '?').join(',')}) ORDER BY title LIMIT ?`, ...cats, limit);
}

const PRODUCT_CATEGORY_HINT = { night_routine: /tea|blend/i, relaxation: /tea|blend/i, recovery: /balm/i, energy: /oil/i };

/** "Find my rhythm": a goal-centred, observational snapshot with education first and the clinician pathway always visible. */
export function findRhythm(userId, goalKey) {
  const goal = GOALS.find((g) => g.key === goalKey);
  if (!goal) throw httpError(400, 'Unknown goal.');
  const rhythm = getRhythm(userId);
  const snapshot = goal.dimensions.map((k) => rhythm.find((r) => r.key === k)).filter(Boolean)
    .map((r) => ({ key: r.key, label: r.label, current: r.current, baseline: r.baseline, direction: r.direction, has_data: r.has_data }));

  const observations = [];
  for (const s of snapshot) {
    if (!s.has_data) { observations.push(`There isn't enough ${s.label.toLowerCase()} data yet. A few check-ins will start to show your pattern.`); continue; }
    if (s.baseline !== null) {
      const d = s.current - s.baseline;
      if (Math.abs(d) >= 5) observations.push(`You've reported ${s.label.toLowerCase()} ${d > 0 ? 'higher' : 'lower'} than your starting baseline (around ${Math.abs(d)} points).`);
      else observations.push(`Your ${s.label.toLowerCase()} has stayed close to your baseline.`);
    } else observations.push(`Your recent ${s.label.toLowerCase()} averages around ${s.current}.`);
  }
  for (const p of detectPatterns(userId).filter((p) => goal.dimensions.includes(p.dimension)).slice(0, 2)) observations.push(p.text);

  const withData = snapshot.filter((s) => s.has_data).sort((a, b) => a.current - b.current);
  const focusDim = (withData[0] || snapshot[0])?.key || goal.dimensions[0];
  const resources = articlesForCategories([...goal.dimensions.map((d) => DIM_CATEGORY[d]), 'Wellness science'], 3);

  const eligibility = productEligibility(userId);
  let products = [];
  if (eligibility.eligible) {
    const hint = PRODUCT_CATEGORY_HINT[goalKey];
    const list = listDisplayableProducts();
    products = hint ? list.filter((p) => hint.test(`${p.name} ${p.category}`)) : list.slice(0, 2);
  }
  return {
    goal: { key: goal.key, label: goal.label, emoji: goal.emoji },
    snapshot, observations, resources,
    routine: routineForGoal(goalKey),
    tracking_goal: { dimension: focusDim, label: dimLabel(focusDim), text: `Notice how ${dimLabel(focusDim).toLowerCase()} feels over the next 7 days and see how it compares with your baseline.` },
    clinician_cta: { text: 'If something here feels persistent or worrying, a clinician is the right person to talk to. You can share a summary of your rhythm with them, only if you choose to.' },
    products,
  };
}
