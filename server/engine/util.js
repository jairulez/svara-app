// Small shared helpers for the engine (pure, no DB access).
export const httpError = (status, message) => Object.assign(new Error(message), { status });

export const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
export const mondayOf = (day) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
};
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round = (x) => (x === null || x === undefined ? null : Math.round(x));
export const round1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
export const arr = (v) => (Array.isArray(v) ? v : []);
export const truncate = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
export const direction = (delta, threshold = 5) => (delta >= threshold ? 'up' : delta <= -threshold ? 'down' : 'steady');
