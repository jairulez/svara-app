import { get, all, run, insert, j, now, today } from '../lib/db.js';
import { anonId, ipHash } from '../lib/auth.js';
import { httpError } from '../lib/http.js';

export const CONSENT_TYPES = ['terms', 'privacy', 'ai_processing', 'clinician_sharing', 'marketing', 'analytics'];
export const GOAL_KEYS = ['night_routine', 'relaxation', 'energy', 'focus', 'recovery', 'mood', 'motivation', 'social'];
export const DISCLAIMER = 'This information reflects what you report and is general wellness information. It is not medical advice or a diagnosis.';

/** Engine rows may carry JSON as string; normalise. */
export const asObj = (v, fb = {}) => (typeof v === 'string' ? j(v, fb) : v ?? fb);

export function latestConsents(userId) {
  const rows = all('SELECT type, granted, created_at FROM consents WHERE user_id=? ORDER BY created_at ASC, rowid ASC', userId);
  const out = {};
  for (const r of rows) out[r.type] = { granted: !!r.granted, updated_at: r.created_at };
  return out;
}
/** Records a NEW consent row (history is kept; latest wins). */
export function recordConsent(userId, type, granted, detail = {}) {
  return insert('consents', { user_id: userId, type, granted: granted ? 1 : 0, detail: JSON.stringify(detail) });
}
export function hasConsent(userId, type) { return !!latestConsents(userId)[type]?.granted; }

export const ANALYTICS_EVENTS = new Set(['landing_view', 'wellness_check_started', 'wellness_check_completed', 'account_created', 'baseline_completed', 'check_in_completed', 'dashboard_viewed', 'weekly_report_viewed', 'routine_started', 'routine_completed', 'clinician_requested', 'clinician_report_shared', 'product_viewed', 'purchase_intent']);
const PROP_KEYS = new Set(['page', 'source', 'goal', 'dimension', 'window', 'persona', 'count', 'range_days', 'category', 'step', 'variant', 'referrer_type']);
export function scrubProps(props) {
  const out = {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) return out;
  for (const [k, v] of Object.entries(props)) {
    if (!PROP_KEYS.has(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 40).replace(/[^\w .:/-]/g, '');
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}
/** Server-side analytics: whitelisted name, scrubbed props, hashed anonymous id only. */
export function track(name, { userId, ip, props } = {}) {
  try {
    if (!ANALYTICS_EVENTS.has(name)) return;
    if (userId && latestConsents(userId).analytics?.granted === false) return;
    insert('analytics_events', { name, anon_id: anonId(userId || `ip:${ipHash(ip)}`), props: JSON.stringify(scrubProps(props)) });
  } catch (e) { console.error('analytics error', e.message); }
}

export function getProfile(userId) {
  const p = get('SELECT * FROM user_profiles WHERE user_id=?', userId) || {};
  const life = j(p.lifestyle, {});
  const pref = j(p.preferences, {});
  const consents = latestConsents(userId);
  return {
    name: p.name || '',
    age_range: p.age_range || '',
    timezone: p.timezone || 'UTC',
    lifestyle: { activity_level: life.activity_level || '', work_pattern: life.work_pattern || '', sleep_schedule: life.sleep_schedule || '', lifestyle: life.lifestyle || '' },
    preferences: {
      checkin_frequency: pref.checkin_frequency || 'daily',
      questions_per_day: pref.questions_per_day || 1,
      focus_areas: pref.focus_areas || [],
      max_sensitivity: pref.max_sensitivity || 'medium',
      notifications: { daily: true, weekly: true, reports: true, ...(pref.notifications || {}) },
    },
    goals: all('SELECT goal_key FROM wellness_goals WHERE user_id=? AND active=1 ORDER BY created_at', userId).map((g) => g.goal_key),
    consents: { ai_processing: !!consents.ai_processing?.granted, analytics: consents.analytics ? !!consents.analytics.granted : false, marketing: !!consents.marketing?.granted },
    onboarding_completed: !!p.onboarding_completed,
  };
}

export const ownedOr404 = (row) => { if (!row) throw httpError(404, 'not_found', 'Not found.'); return row; };
export { today, now, run };
