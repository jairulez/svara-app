import { all, get, j, today } from '../lib/db.js';
import { getRhythm, detectPatterns, baselineStatus } from './trends.js';
import { addDays } from './util.js';
import { productEligibility } from './eligibility.js';

// ---- shared profile helpers ----
export const getProfile = (userId) => {
  const p = get('SELECT * FROM user_profiles WHERE user_id=?', userId);
  return p ? { ...p, lifestyle: j(p.lifestyle, {}), preferences: j(p.preferences, {}) } : null;
};
export const getPrefs = (userId) => getProfile(userId)?.preferences || {};
export const displayName = (userId) => (getProfile(userId)?.name || '').trim().split(/\s+/)[0] || 'there';
export const getGoalKeys = (userId) => all('SELECT goal_key FROM wellness_goals WHERE user_id=? AND active=1 ORDER BY created_at', userId).map((r) => r.goal_key);
/** Latest consent row per type wins. */
export const hasConsent = (userId, type) => {
  const r = get('SELECT granted FROM consents WHERE user_id=? AND type=? ORDER BY created_at DESC, rowid DESC LIMIT 1', userId, type);
  return !!r?.granted;
};

const PURPOSE_SLICES = {
  chat: ['PROFILE', 'GOALS', 'WELLNESS_HISTORY', 'ROUTINES', 'CONVERSATION_MEMORY'],
  summary: ['GOALS', 'WELLNESS_HISTORY'],
  routine: ['GOALS', 'WELLNESS_HISTORY', 'ROUTINES', 'PREFERENCES'],
  report: ['PROFILE', 'GOALS', 'WELLNESS_HISTORY', 'ROUTINES'],
  clinician: ['PROFILE', 'GOALS', 'WELLNESS_HISTORY', 'CLINICIAN_CONTEXT'],
  product: ['GOALS', 'CLINICIAN_CONTEXT', 'PRODUCT_CONTEXT'],
  question: ['GOALS', 'PREFERENCES', 'WELLNESS_HISTORY'],
};

/** Return ONLY the slices relevant to `purpose`. No email, no raw notes, no other users' data. */
export function buildContext(userId, purpose, { conversationId } = {}) {
  const want = new Set(PURPOSE_SLICES[purpose] || PURPOSE_SLICES.chat);
  const ctx = {};
  if (want.has('PROFILE')) {
    const p = getProfile(userId);
    ctx.PROFILE = { first_name: displayName(userId), age_range: p?.age_range || null, lifestyle: p?.lifestyle || {} };
  }
  if (want.has('GOALS')) ctx.GOALS = getGoalKeys(userId);
  if (want.has('PREFERENCES')) {
    const pr = getPrefs(userId);
    ctx.PREFERENCES = { questions_per_day: pr.questions_per_day ?? 1, max_sensitivity: pr.max_sensitivity ?? 'medium', focus_areas: pr.focus_areas ?? [] };
  }
  if (want.has('WELLNESS_HISTORY')) {
    ctx.WELLNESS_HISTORY = {
      baseline: baselineStatus(userId),
      rhythm: getRhythm(userId).filter((d) => d.has_data).map((d) => ({ key: d.key, label: d.label, current: d.current, baseline: d.baseline, delta7: d.delta7, direction: d.direction })),
      patterns: detectPatterns(userId).slice(0, 3).map((p) => p.text),
    };
  }
  if (want.has('ROUTINES')) {
    ctx.ROUTINES = all(`SELECT r.name, ra.status, ra.day FROM routine_activity ra JOIN routines r ON r.id=ra.routine_id
                        WHERE ra.user_id=? AND ra.day>=? ORDER BY ra.day DESC LIMIT 10`, userId, addDays(today(), -7));
  }
  if (want.has('CLINICIAN_CONTEXT')) {
    const r = get("SELECT status, range_days, created_at FROM clinician_reports WHERE user_id=? AND status!='revoked' ORDER BY created_at DESC LIMIT 1", userId);
    ctx.CLINICIAN_CONTEXT = r ? { latest_report_status: r.status, range_days: r.range_days, requested_on: r.created_at.slice(0, 10) } : { latest_report_status: null };
  }
  if (want.has('PRODUCT_CONTEXT')) {
    const e = productEligibility(userId);
    ctx.PRODUCT_CONTEXT = { eligible: e.eligible };
  }
  if (want.has('CONVERSATION_MEMORY')) {
    const c = conversationId ? get('SELECT summary FROM ai_conversations WHERE id=? AND user_id=?', conversationId, userId) : null;
    ctx.CONVERSATION_MEMORY = c?.summary || '';
  }
  return ctx;
}
