import { get, insert, today } from '../lib/db.js';
import { getPrefs } from './memory.js';
import { baselineStatus } from './trends.js';
import { answeredTodayCount } from './questions.js';
import { addDays, mondayOf } from './util.js';

export function notify(userId, type, title, body = null, link = null) {
  return insert('notifications', { user_id: userId, type, title, body, link });
}

const allowed = (userId, key) => getPrefs(userId).notifications?.[key] !== false;

/** At most one daily prompt per day; skipped when switched off or already checked in today. */
export function ensureDailyPrompt(userId) {
  if (!allowed(userId, 'daily')) return null;
  const t = today();
  if (get("SELECT 1 x FROM notifications WHERE user_id=? AND type='daily_prompt' AND substr(created_at,1,10)=?", userId, t)) return null;
  if (answeredTodayCount(userId) > 0) return null;
  return notify(userId, 'daily_prompt', 'One question for you today.', 'A quick check-in takes less than a minute.', '/checkin');
}

export function checkBaselineMilestone(userId) {
  if (!baselineStatus(userId).complete) return null;
  if (get("SELECT 1 x FROM notifications WHERE user_id=? AND type='baseline_complete'", userId)) return null;
  return notify(userId, 'baseline_complete', "You've completed your 7-day baseline.", 'Your My Rhythm view now compares each day with your own starting point.', '/home');
}

export function weeklyReady(userId, weekStart = null) {
  if (!allowed(userId, 'weekly')) return null;
  const ws = weekStart || mondayOf(today());
  if (get("SELECT 1 x FROM notifications WHERE user_id=? AND type='weekly_ready' AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?", userId, ws, addDays(ws, 6))) return null;
  return notify(userId, 'weekly_ready', 'YOUR WEEK IN SVARA is ready.', 'A short, calm look back at what you reported this week.', '/weekly');
}
