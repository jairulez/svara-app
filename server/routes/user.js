import { all, get, run, insert, update, j, now, today, setting, tx } from '../lib/db.js';
import { audit } from '../lib/auth.js';
import { httpError, reply } from '../lib/http.js';
import { S, validate } from '../lib/validate.js';
import { getRhythm, getTrends, detectPatterns, baselineStatus, recordCheckIn, recordContext } from '../engine/trends.js';
import { selectQuestions, answeredTodayCount, dailyQuota } from '../engine/questions.js';
import { generateWeeklyReport, reflectOnCheckIn } from '../engine/reports.js';
import { respondAsync } from '../engine/guide.js';
import { findRhythm, GOALS } from '../engine/discovery.js';
import { ensureDailyPrompt, checkBaselineMilestone } from '../engine/notifications.js';
import { DIMENSIONS } from '../engine/scoring.js';
import { getProfile, latestConsents, recordConsent, track, asObj, GOAL_KEYS } from './_shared.js';
import { shapeRoutine } from './public.js';

const REQ = { role: 'USER' };
const DIM_KEYS = DIMENSIONS.map((d) => d.key);

function periodFor(tz) {
  let hour;
  try { hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz || 'UTC' }).format(new Date())) % 24; }
  catch { hour = new Date().getUTCHours(); }
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

const profileShape = {
  name: S.str({ max: 80 }),
  age_range: S.str({ max: 20 }),
  timezone: S.str({ max: 64, pattern: /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/, patternMessage: 'Use an IANA timezone like Asia/Kolkata.' }),
  lifestyle: S.obj({ activity_level: S.str({ max: 40 }), work_pattern: S.str({ max: 40 }), sleep_schedule: S.str({ max: 40 }), lifestyle: S.str({ max: 120 }) }),
  preferences: S.obj({
    checkin_frequency: S.str({ max: 30 }),
    questions_per_day: S.int({ min: 1, max: 3 }),
    focus_areas: S.arr(S.enum(DIM_KEYS), { max: 10 }),
    max_sensitivity: S.enum(['low', 'medium', 'high']),
    notifications: S.obj({ daily: S.bool(), weekly: S.bool(), reports: S.bool() }),
  }),
  goals: S.arr(S.enum(GOAL_KEYS), { max: 8 }),
  consents: S.obj({ ai_processing: S.bool(), analytics: S.bool(), marketing: S.bool() }),
  onboarding_completed: S.bool(),
};

export default function register(r) {
  r.get('/api/profile', REQ, ({ user }) => getProfile(user.id));

  r.put('/api/profile', REQ, ({ user, body, ip, req }) => {
    const v = validate(body, profileShape);
    const cur = get('SELECT * FROM user_profiles WHERE user_id=?', user.id);
    tx(() => {
      const patch = {};
      for (const k of ['name', 'age_range', 'timezone']) if (v[k] !== undefined) patch[k] = v[k];
      if (v.lifestyle) patch.lifestyle = JSON.stringify({ ...j(cur?.lifestyle, {}), ...v.lifestyle });
      if (v.preferences) {
        const old = j(cur?.preferences, {});
        patch.preferences = JSON.stringify({ ...old, ...v.preferences, notifications: { ...(old.notifications || {}), ...(v.preferences.notifications || {}) } });
      }
      if (v.onboarding_completed !== undefined) patch.onboarding_completed = v.onboarding_completed ? 1 : 0;
      if (cur) { if (Object.keys(patch).length) update('user_profiles', cur.id, patch); }
      else insert('user_profiles', { user_id: user.id, ...patch });
      if (v.goals) {
        const existing = new Map(all('SELECT id, goal_key FROM wellness_goals WHERE user_id=?', user.id).map((g) => [g.goal_key, g.id]));
        for (const key of GOAL_KEYS) {
          const want = v.goals.includes(key);
          if (existing.has(key)) update('wellness_goals', existing.get(key), { active: want ? 1 : 0 });
          else if (want) insert('wellness_goals', { user_id: user.id, goal_key: key, active: 1 });
        }
      }
    });
    if (v.consents) {
      const cur2 = latestConsents(user.id);
      for (const [t, g] of Object.entries(v.consents)) {
        if ((cur2[t]?.granted ?? null) !== g) { recordConsent(user.id, t, g, { source: 'profile' }); audit(req, 'consent_change', { targetType: 'consent', targetId: t, subjectUserId: user.id, detail: { granted: g } }); }
      }
    }
    return getProfile(user.id);
  });

  r.get('/api/dashboard', REQ, ({ user, ip }) => {
    track('dashboard_viewed', { userId: user.id, ip });
    const p = getProfile(user.id);
    try { ensureDailyPrompt(user.id); } catch (e) { console.error('daily prompt:', e.message); }
    const rhythm = getRhythm(user.id);
    const baseline = baselineStatus(user.id);
    const reported = [];
    for (const d of rhythm) {
      if (!d.primary || !d.has_data || d.direction === 'steady' || typeof d.delta7 !== 'number') continue;
      reported.push(`You've reported ${d.label} as ${d.direction === 'up' ? 'higher' : 'lower'} than your usual over the last 7 days (${d.delta7 > 0 ? '+' : ''}${Math.round(d.delta7)}).`);
    }
    const withData = rhythm.filter((d) => d.has_data && d.primary);
    const focus = [...withData].sort((a, b) => (a.delta7 ?? 0) - (b.delta7 ?? 0) || (a.current ?? 100) - (b.current ?? 100))[0];
    const routines = all('SELECT * FROM routines WHERE active=1 ORDER BY name').map(shapeRoutine);
    const pick = (focus && routines.find((x) => x.dimensions.includes(focus.key))) || routines[0];
    const try_this = pick ? {
      routine_id: pick.id, title: pick.name,
      text: focus ? `You've reported ${focus.label} as an area to look after. ${pick.name} takes about ${pick.duration_min} minutes, if it feels useful.` : `${pick.name} takes about ${pick.duration_min} minutes, if it feels useful.`,
    } : null;
    const done = get("SELECT COUNT(*) n FROM check_ins WHERE user_id=? AND day=? AND kind IN ('baseline','daily')", user.id, today()).n > 0;
    const unread = get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', user.id).n;
    return {
      name: p.name || '', greeting_period: periodFor(p.timezone), rhythm, baseline, reported,
      patterns: detectPatterns(user.id), try_this, checked_in_today: done, unread_notifications: unread,
    };
  });

  r.get('/api/trends', REQ, ({ user, query }) => {
    const { window } = validate(query, { window: S.int({ coerce: true, default: 30 }) });
    if (![7, 14, 30, 90, 365].includes(window)) throw httpError(400, 'validation_error', 'Invalid window.', { window: 'Must be one of 7, 14, 30, 90, 365.' });
    return getTrends(user.id, window);
  });

  r.get('/api/checkin/next', REQ, ({ user }) => {
    const cap = dailyQuota(user.id);
    const answered = answeredTodayCount(user.id);
    const remaining = Math.max(0, cap - answered);
    const baseline = baselineStatus(user.id);
    if (!remaining) return { questions: [], intro: 'You\'re all set for today.', done_today: true, remaining: 0, baseline };
    const sel = selectQuestions(user.id, { count: remaining });
    return { questions: sel.questions, reasons: sel.reasons, intro: remaining === 1 ? 'One question for you.' : 'A few questions for you.', done_today: false, remaining, baseline };
  });

  r.post('/api/checkin', REQ, ({ user, body, ip }) => {
    const v = validate(body, {
      answers: S.arr(S.obj({ question_id: S.str({ required: true, max: 64 }), value: S.int({ required: true, min: 1, max: 5 }), note: S.str({ max: 500 }) }), { required: true, min: 1, max: 3 }),
      context: S.obj({ workload: S.enum(['light', 'moderate', 'heavy']), exercised: S.bool(), late_screens: S.bool() }),
    });
    const maxPerDay = Math.max(3, Number(setting('ai.max_questions_per_day')) || 3);
    if (answeredTodayCount(user.id) + v.answers.length > maxPerDay) throw httpError(429, 'daily_limit', 'You\'ve already checked in as much as planned for today. Come back tomorrow.');
    const qs = new Map();
    for (const a of v.answers) {
      const q = get('SELECT id, question, options, active FROM questions WHERE id=?', a.question_id);
      if (!q || !q.active) throw httpError(400, 'invalid_question', 'That question is not available.', { answers: 'Unknown question.' });
      qs.set(a.question_id, q);
    }
    const before = baselineStatus(user.id);
    const kind = before.complete ? 'daily' : 'baseline';
    const day = today();
    let saved = 0;
    for (const a of v.answers) {
      recordCheckIn(user.id, { question_id: a.question_id, raw_value: a.value, note: a.note || null, kind, day });
      saved++;
    }
    if (v.context) recordContext(user.id, day, v.context);
    try { checkBaselineMilestone(user.id); } catch (e) { console.error('milestone:', e.message); }
    const after = baselineStatus(user.id);
    track('check_in_completed', { userId: user.id, ip });
    if (!before.complete && after.complete) track('baseline_completed', { userId: user.id, ip });
    let reflection;
    try { reflection = reflectOnCheckIn(user.id); } catch { reflection = 'Thanks for checking in. Each answer adds to your picture.'; }
    return { saved, reflection, baseline: after };
  });

  // ---- Guide ----
  r.get('/api/guide/conversations', REQ, ({ user }) => ({
    conversations: all('SELECT id, title, created_at, updated_at FROM ai_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 50', user.id),
  }));
  r.get('/api/guide/conversations/:id', REQ, ({ user, params }) => {
    const c = get('SELECT id, title FROM ai_conversations WHERE id=? AND user_id=?', params.id, user.id);
    if (!c) throw httpError(404, 'not_found', 'Conversation not found.');
    return { conversation: c, messages: all('SELECT id, role, content, safety_category, created_at FROM ai_messages WHERE conversation_id=? ORDER BY created_at, rowid', c.id) };
  });
  r.post('/api/guide/message', { ...REQ, bucket: 'heavy' }, async ({ user, body }) => {
    const v = validate(body, { conversationId: S.str({ max: 64 }), message: S.str({ required: true, min: 1, max: 2000 }) });
    if (v.conversationId && !get('SELECT 1 x FROM ai_conversations WHERE id=? AND user_id=?', v.conversationId, user.id)) throw httpError(404, 'not_found', 'Conversation not found.');
    return respondAsync(user.id, { conversationId: v.conversationId, message: v.message });
  });
  r.delete('/api/guide/conversations/:id', REQ, ({ user, params }) => {
    const c = get('SELECT id FROM ai_conversations WHERE id=? AND user_id=?', params.id, user.id);
    if (!c) throw httpError(404, 'not_found', 'Conversation not found.');
    tx(() => { run('DELETE FROM ai_messages WHERE conversation_id=?', c.id); run('DELETE FROM ai_conversations WHERE id=?', c.id); });
    return { ok: true };
  });

  // ---- Find My Rhythm ----
  r.get('/api/rhythm/find', REQ, ({ user, query }) => {
    const { goal } = validate(query, { goal: S.enum(GOAL_KEYS, { required: true }) });
    return findRhythm(user.id, goal);
  });
  r.get('/api/rhythm/goals', REQ, ({ user }) => ({ goals: GOALS, active: getProfile(user.id).goals }));
  r.post('/api/rhythm/goal', REQ, ({ user, body }) => {
    const v = validate(body, { goal_key: S.enum(GOAL_KEYS, { required: true }), active: S.bool({ required: true }) });
    const ex = get('SELECT id FROM wellness_goals WHERE user_id=? AND goal_key=?', user.id, v.goal_key);
    if (ex) update('wellness_goals', ex.id, { active: v.active ? 1 : 0 });
    else insert('wellness_goals', { user_id: user.id, goal_key: v.goal_key, active: v.active ? 1 : 0 });
    return { goals: GOALS, active: getProfile(user.id).goals };
  });

  // ---- Routines ----
  r.get('/api/routines/activity', REQ, ({ user }) => {
    const activity = all(`SELECT a.id, a.routine_id, r.name routine_name, a.status, a.day, a.started_at, a.completed_at
                          FROM routine_activity a JOIN routines r ON r.id=a.routine_id WHERE a.user_id=? ORDER BY a.created_at DESC LIMIT 60`, user.id);
    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const completed_7d = get("SELECT COUNT(*) n FROM routine_activity WHERE user_id=? AND status='completed' AND day>=?", user.id, since).n;
    return { activity, completed_7d, streakless: true };
  });
  const routineOr404 = (id) => { const x = get('SELECT id FROM routines WHERE id=? AND active=1', id); if (!x) throw httpError(404, 'not_found', 'Routine not found.'); return x; };
  r.post('/api/routines/:id/start', REQ, ({ user, params, ip }) => {
    routineOr404(params.id);
    const row = insert('routine_activity', { user_id: user.id, routine_id: params.id, status: 'started', day: today(), started_at: now() });
    track('routine_started', { userId: user.id, ip });
    return reply(201, { activity: row });
  });
  r.post('/api/routines/:id/complete', REQ, ({ user, params, ip }) => {
    routineOr404(params.id);
    const open = get("SELECT id FROM routine_activity WHERE user_id=? AND routine_id=? AND status='started' ORDER BY created_at DESC LIMIT 1", user.id, params.id);
    let row;
    if (open) { update('routine_activity', open.id, { status: 'completed', completed_at: now() }); row = get('SELECT * FROM routine_activity WHERE id=?', open.id); }
    else row = insert('routine_activity', { user_id: user.id, routine_id: params.id, status: 'completed', day: today(), started_at: now(), completed_at: now() });
    track('routine_completed', { userId: user.id, ip });
    return { activity: row };
  });

  // ---- Weekly ----
  const shapeReport = (rep) => ({ id: rep.id, week_start: rep.week_start, content: asObj(rep.content) });
  r.get('/api/weekly', REQ, ({ user, ip }) => {
    const rep = generateWeeklyReport(user.id, { force: false });
    if (rep?.id) run('UPDATE weekly_reports SET viewed_at=COALESCE(viewed_at, ?) WHERE id=? AND user_id=?', now(), rep.id, user.id);
    track('weekly_report_viewed', { userId: user.id, ip });
    return { report: shapeReport(rep) };
  });
  r.get('/api/weekly/list', REQ, ({ user }) => ({
    reports: all('SELECT id, week_start, viewed_at, created_at FROM weekly_reports WHERE user_id=? ORDER BY week_start DESC LIMIT 52', user.id),
  }));
  r.get('/api/weekly/:id', REQ, ({ user, params }) => {
    const rep = get('SELECT id, week_start, content FROM weekly_reports WHERE id=? AND user_id=?', params.id, user.id);
    if (!rep) throw httpError(404, 'not_found', 'Report not found.');
    return { report: shapeReport(rep) };
  });

  // ---- Notifications ----
  r.get('/api/notifications', REQ, ({ user }) => ({
    notifications: all('SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50', user.id),
  }));
  r.post('/api/notifications/read-all', REQ, ({ user }) => { run('UPDATE notifications SET read_at=?, updated_at=? WHERE user_id=? AND read_at IS NULL', now(), now(), user.id); return { ok: true }; });
  r.post('/api/notifications/:id/read', REQ, ({ user, params }) => {
    const n = get('SELECT id FROM notifications WHERE id=? AND user_id=?', params.id, user.id);
    if (!n) throw httpError(404, 'not_found', 'Notification not found.');
    run('UPDATE notifications SET read_at=COALESCE(read_at, ?), updated_at=? WHERE id=?', now(), now(), n.id);
    return { ok: true };
  });
}
