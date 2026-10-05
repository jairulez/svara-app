// SVARA core: DOM helpers, API client, state, router, shell, toasts, charts.
// No innerHTML anywhere: all content goes through text nodes / DOM APIs.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'defs', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'ellipse', 'clipPath', 'tspan']);

export const DIMS = [
  { key: 'sleep', label: 'Sleep' },
  { key: 'energy', label: 'Energy' },
  { key: 'mood', label: 'Mood' },
  { key: 'relaxation', label: 'Relaxation' },
  { key: 'motivation', label: 'Motivation' },
  { key: 'focus', label: 'Focus' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'social_connection', label: 'Social connection' },
  { key: 'stress', label: 'Stress ease' },
  { key: 'overall_wellbeing', label: 'Overall wellbeing' },
];
export const PRIMARY = DIMS.slice(0, 8);
export const dimLabel = (k) => (DIMS.find((d) => d.key === k) || { label: String(k) }).label;

/* ---------------- hyperscript ---------------- */
function appendChild(el, c) {
  if (c == null || c === false || c === true) return;
  if (Array.isArray(c)) return c.forEach((x) => appendChild(el, x));
  if (c instanceof Node) return el.appendChild(c);
  el.appendChild(document.createTextNode(String(c)));
}
export function h(tag, attrs, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs); attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') throw new Error('html attribute is not allowed');
    if (k === 'class' || k === 'className') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' && !isSvg) el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required' || k === 'hidden') { if (v) el.setAttribute(k, ''); if (!isSvg) el[k] = !!v; }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  children.forEach((c) => appendChild(el, c));
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* ---------------- state + api ---------------- */
export const state = { user: null, profile: null, csrf: null, config: null, unread: 0 };

export async function api(method, path, body) {
  const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (method !== 'GET' && state.csrf) opts.headers['X-CSRF-Token'] = state.csrf;
  let res;
  try { res = await fetch(path, opts); }
  catch { throw { status: 0, message: 'We could not reach the server. Please check your connection and try again.' }; }
  if (res.status === 204) return null;
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const e = (data && data.error) || {};
    throw { status: res.status, code: e.code, message: e.message || `Something went wrong (${res.status}).`, fields: e.fields || null };
  }
  return data;
}

export async function refreshMe() {
  try {
    const me = await api('GET', '/api/auth/me');
    state.user = me && me.user ? me.user : null;
    state.profile = me && me.user ? me.profile || null : null;
    state.csrf = me && me.user ? me.csrf || null : null;
  } catch { state.user = null; state.profile = null; state.csrf = null; }
  return state.user;
}
export async function loadConfig() {
  try { state.config = await api('GET', '/api/config'); } catch { state.config = state.config || { demoMode: true, commerceEnabled: false, authProviders: {} }; }
  return state.config;
}
export function setSession(res) {
  if (res && res.user) { state.user = res.user; if (res.csrf) state.csrf = res.csrf; }
}

export function track(name, props) {
  try { api('POST', '/api/events', props ? { name, props } : { name }).catch(() => {}); } catch { /* ignore */ }
}

/* ---------------- formatting ---------------- */
export const fmt = {
  date(d, opts) {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString(undefined, opts || { month: 'short', day: 'numeric', year: 'numeric' });
  },
  relDay(d) {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return '';
    const a = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const n = new Date(); const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const diff = Math.round((b - a) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return `${diff} days ago`;
    if (diff === -1) return 'Tomorrow';
    return fmt.date(dt, { month: 'short', day: 'numeric' });
  },
  pct(n) { return n == null || isNaN(n) ? '–' : `${Math.round(n)}%`; },
};

/* ---------------- theme ---------------- */
function currentTheme() {
  const a = document.documentElement.getAttribute('data-theme');
  if (a) return a;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('svara.theme', next); } catch { /* ignore */ }
  renderNav();
}

/* ---------------- icons ---------------- */
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  guide: 'M4 5h16v11H9l-5 4V5z',
  compass: 'M12 3a9 9 0 100 18 9 9 0 000-18zM15.5 8.5l-2 5-5 2 2-5 5-2z',
  routine: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  weekly: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 21h15',
  clinician: 'M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10zM12 9v5M9.5 11.5h5',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM9 12l2.2 2.2L15.5 10',
  bell: 'M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16zM10 21h4',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  logout: 'M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 8l-4 4 4 4M6 12h10',
  menu: 'M4 7h16M4 12h16M4 17h16',
  x: 'M6 6l12 12M18 6L6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
  chevron: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a6 6 0 013.5 6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2.2.3-1.5-1.5L16.6 4l-3-1-1 2h-1.2l-1-2-3 1 .3 2.2L5.2 7.7 3 8l-1 3 2 1v1.2l-2 1 1 3 2.2-.3 1.5 1.5L5.4 20l3 1 1-2h1.2l1 2 3-1-.3-2.2 1.5-1.5L19 16l1-3-2-1z',
  trend: 'M3 17l6-6 4 4 8-9M15 6h6v6',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 100 18 9 9 0 000-18z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  wave: 'M3 9c3-4 6-4 9 0s6 4 9 0M3 16c3-4 6-4 9 0s6 4 9 0',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
};
export function icon(name, opts = {}) {
  const d = ICONS[name] || ICONS.sparkle;
  return h('svg', { viewBox: '0 0 24 24', width: opts.size || 20, height: opts.size || 20, fill: 'none', stroke: 'currentColor', 'stroke-width': opts.stroke || 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: opts.class },
    h('path', { d }));
}
const DIM_ICONS = {
  sleep: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5zM16 4v3M14.5 5.5h3',
  energy: 'M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z',
  mood: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8.5 14c1 1.6 2.2 2.3 3.5 2.3s2.5-.7 3.5-2.3M9 9.5h.01M15 9.5h.01',
  relaxation: 'M3 9c3-4 6-4 9 0s6 4 9 0M3 15c3-4 6-4 9 0s6 4 9 0',
  motivation: 'M12 3v18M12 3l-5 5M12 3l5 5M6 21h12',
  focus: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11.5a.5.5 0 100 1 .5.5 0 000-1z',
  recovery: 'M20 11a8 8 0 00-14-4M4 5v3h3M4 13a8 8 0 0014 4M20 19v-3h-3',
  social_connection: 'M8 11a3 3 0 100-6 3 3 0 000 6zM16 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2.5 19a5.5 5.5 0 0111 0M14 18.5a4.5 4.5 0 017.5-2.5',
  stress: 'M4 8h10M18 8h2M4 16h2M10 16h10M16 6v4M8 14v4',
  overall_wellbeing: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v10M7 12h10',
};
export function dimIcon(key, opts = {}) {
  const d = DIM_ICONS[key] || DIM_ICONS.overall_wellbeing;
  return h('svg', { viewBox: '0 0 24 24', width: opts.size || 22, height: opts.size || 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: opts.class || 'dim-ic' }, h('path', { d }));
}

/* ---------------- brand bits ---------------- */
export function logo(size = 36) {
  const id = 'lg' + Math.random().toString(36).slice(2, 7);
  const wave = (y, stroke, op) => h('path', { d: `M13 ${y}c6-7 12-7 19 0s13 7 19 0`, stroke, opacity: op });
  return h('svg', { viewBox: '0 0 64 64', width: size, height: size, role: 'img', 'aria-label': 'SVARA logo', class: 'logo' },
    h('defs', null, h('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 }, h('stop', { offset: 0, 'stop-color': '#8FAA9B' }), h('stop', { offset: 1, 'stop-color': '#4E6B5C' }))),
    h('circle', { cx: 32, cy: 32, r: 30, fill: `url(#${id})` }),
    h('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-width': 3.2 }, wave(24, '#F7F4EE', '.95'), wave(33, '#F7F4EE', '.7'), wave(42, '#E8CDB0', '.95')));
}
export const DISCLAIMER_TEXT = 'SVARA is a wellness tool, not a medical service. It does not diagnose, treat or prescribe, and is not a substitute for advice from a qualified clinician. If you are worried about your health, please speak with a qualified clinician. If you are in crisis or need urgent help, contact your local emergency services.';
export function disclaimer(text) { return h('p', { class: 'disclaimer' }, text || DISCLAIMER_TEXT); }
export function demoBadge(text) { return h('span', { class: 'badge-demo' }, text || 'DEMO — NOT FOR SALE'); }
export function loading(text) { return h('div', { class: 'loading', role: 'status' }, h('div', { class: 'spinner' }), h('span', null, text || 'Just a moment…')); }
export function errorBox(err) {
  const msg = (err && err.message) || 'Something went wrong. Please try again.';
  return h('div', { class: 'error-box', role: 'alert' }, h('p', { class: 'h3' }, 'That didn’t go as planned'), h('p', { class: 'muted' }, msg));
}
export function emptyState(title, text, cta) {
  return h('div', { class: 'empty' }, h('h3', { class: 'h3' }, title), text ? h('p', null, text) : null,
    cta ? (cta instanceof Node ? cta : h('a', { class: 'btn btn-primary', href: cta.href || '/' }, cta.label || 'Continue')) : null);
}

/* ---------------- toasts ---------------- */
export function toast(msg, type = 'info') {
  const root = document.getElementById('toast'); if (!root) return;
  const t = h('div', { class: `toast ${type}` }, msg);
  root.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, type === 'error' ? 6000 : 3800);
}

/* ---------------- safe markdown-lite ---------------- */
function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(h('strong', null, m[1].slice(2, -2)));
    else {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(m[2]);
      const url = mm[2];
      if (/^\/(?!\/)/.test(url)) out.push(h('a', { href: url }, mm[1]));
      else if (/^https:\/\//.test(url)) out.push(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, mm[1]));
      else out.push(mm[1]);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function markdown(str) {
  const root = h('div', { class: 'prose' });
  const lines = String(str || '').replace(/\r/g, '').split('\n');
  let para = [], list = null;
  const flushP = () => { if (para.length) { root.appendChild(h('p', null, inline(para.join(' ')))); para = []; } };
  const flushL = () => { if (list) { root.appendChild(list); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushP(); flushL(); }
    else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flushP(); flushL(); root.appendChild(h(m[1].length === 1 ? 'h2' : m[1].length === 2 ? 'h2' : 'h3', null, inline(m[2]))); }
    else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) { flushP(); if (!list) list = h('ul'); list.appendChild(h('li', null, inline(m[1]))); }
    else { flushL(); para.push(line.trim()); }
  }
  flushP(); flushL();
  return root;
}

/* ---------------- animation helpers ---------------- */
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function countUp(el, to, ms = 1100) {
  to = Math.round(Number(to) || 0);
  if (reduced()) { el.textContent = String(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = '0';
  requestAnimationFrame(step);
}
export function reveal(root = document) {
  const els = $$('.reveal:not(.in)', root);
  if (!('IntersectionObserver' in window) || reduced()) return els.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach((e) => io.observe(e));
}

/* ---------------- charts ---------------- */
const CVARS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'];
export const dimColor = (i) => `var(${CVARS[i % CVARS.length]})`;
function normScores(scores, keys) {
  // accepts {key:number}, [{key,current|score|value}], or array of numbers
  const map = {};
  if (Array.isArray(scores)) {
    scores.forEach((s, i) => {
      if (typeof s === 'number') map[(keys || PRIMARY.map((d) => d.key))[i]] = s;
      else if (s && s.key) { const v = s.current ?? s.score ?? s.value; if (v != null) map[s.key] = v; else if (s.has_data === false) map[s.key] = null; }
    });
  } else Object.assign(map, scores || {});
  return map;
}
function polar(cx, cy, r, deg) { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

export function rhythmRings(scores, { size = 280, keys, animate = true } = {}) {
  const map = normScores(scores);
  const list = (keys ? keys.map((k) => ({ key: k, label: dimLabel(k) })) : PRIMARY).filter((d) => d.key in map || !keys);
  const c = size / 2, sweep = 270;
  const n = list.length || 1;
  const outer = c - 6, inner = size * 0.2;
  const gap = n > 1 ? (outer - inner) / (n - 1) : 0;
  const sw = Math.max(4, Math.min(11, gap * 0.62));
  const desc = list.map((d) => `${d.label} ${map[d.key] == null ? 'no data' : Math.round(map[d.key])}`).join(', ');
  const vh = Math.round(c + 0.72 * outer + sw / 2 + 6);
  const svg = h('svg', { viewBox: `0 0 ${size} ${vh}`, width: size, height: vh, class: 'chart rings', role: 'img', 'aria-label': `My Rhythm rings: ${desc}` },
    h('title', null, 'My Rhythm'));
  const arcs = [];
  list.forEach((d, i) => {
    const r = outer - i * gap;
    const [x0, y0] = polar(c, c, r, 225), [x1, y1] = polar(c, c, r, 225 + sweep);
    const path = `M${x0} ${y0} A${r} ${r} 0 1 1 ${x1} ${y1}`;
    const len = (sweep / 360) * 2 * Math.PI * r;
    const v = map[d.key] == null ? 0 : Math.max(0, Math.min(100, map[d.key]));
    svg.appendChild(h('path', { d: path, class: 'ring-track', 'stroke-width': sw, 'stroke-linecap': 'round' }));
    const arc = h('path', { d: path, class: 'ring-arc', 'stroke-width': sw, style: { stroke: dimColor(i) }, 'stroke-dasharray': len, 'stroke-dashoffset': animate && !reduced() ? len : len * (1 - v / 100) },
      h('title', null, `${d.label}: ${map[d.key] == null ? 'no data yet' : Math.round(v)}`));
    svg.appendChild(arc); arcs.push([arc, len, v]);
  });
  if (animate && !reduced()) requestAnimationFrame(() => requestAnimationFrame(() => arcs.forEach(([a, len, v], i) => { a.style.transitionDelay = `${i * 70}ms`; a.setAttribute('stroke-dashoffset', len * (1 - v / 100)); })));
  return svg;
}

export function radar(scores, { size = 320, keys } = {}) {
  const map = normScores(scores);
  const list = keys ? keys.map((k) => ({ key: k, label: dimLabel(k) })) : PRIMARY;
  const n = list.length, c = size / 2, R = size / 2 - 66;
  const svg = h('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'chart radar', style: { overflow: 'visible', maxWidth: '100%', height: 'auto' }, role: 'img', 'aria-label': 'Radar of your reported dimensions: ' + list.map((d) => `${d.label} ${map[d.key] == null ? 'no data' : Math.round(map[d.key])}`).join(', ') });
  [25, 50, 75, 100].forEach((p) => {
    const pts = list.map((_, i) => polar(c, c, R * p / 100, (360 / n) * i).join(',')).join(' ');
    svg.appendChild(h('polygon', { points: pts, class: 'grid-line', 'stroke-width': 1, 'stroke-dasharray': p === 100 ? '' : '2 4' }));
  });
  list.forEach((d, i) => {
    const [x, y] = polar(c, c, R, (360 / n) * i);
    svg.appendChild(h('line', { x1: c, y1: c, x2: x, y2: y, class: 'grid-line', 'stroke-width': 1 }));
    const [lx, ly] = polar(c, c, R + 24, (360 / n) * i);
    const anchor = lx < c - 8 ? 'end' : lx > c + 8 ? 'start' : 'middle';
    svg.appendChild(h('text', { x: lx, y: ly + 3, 'text-anchor': anchor, 'font-size': 11 }, d.label.replace('Social connection', 'Social')));
  });
  const pts = list.map((d, i) => polar(c, c, R * Math.max(0, Math.min(100, map[d.key] || 0)) / 100, (360 / n) * i));
  const poly = h('polygon', { points: pts.map((p) => p.join(',')).join(' '), style: { fill: 'var(--c1)', stroke: 'var(--c6)', transition: 'opacity .8s' }, 'fill-opacity': .22, 'stroke-width': 2, 'stroke-linejoin': 'round' });
  svg.appendChild(poly);
  pts.forEach((p, i) => svg.appendChild(h('circle', { cx: p[0], cy: p[1], r: 3.5, style: { fill: 'var(--c6)' } }, h('title', null, `${list[i].label}: ${map[list[i].key] == null ? 'no data' : Math.round(map[list[i].key])}`))));
  return svg;
}

export function sparkline(values, { w = 120, h: ht = 36, color = 'var(--c1)', fill = true } = {}) {
  const vals = (values || []).map((v) => (v && typeof v === 'object' ? (v.score ?? v.y ?? v.value) : v)).filter((v) => v != null && !isNaN(v));
  const svg = h('svg', { viewBox: `0 0 ${w} ${ht}`, width: w, height: ht, class: 'chart spark', role: 'img', 'aria-label': vals.length ? `Trend over ${vals.length} days, from ${Math.round(vals[0])} to ${Math.round(vals[vals.length - 1])}` : 'No trend data yet' });
  if (vals.length < 2) { svg.appendChild(h('line', { x1: 2, y1: ht / 2, x2: w - 2, y2: ht / 2, class: 'grid-line', 'stroke-dasharray': '2 4' })); return svg; }
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 12) { const mid = (max + min) / 2; min = mid - 6; max = mid + 6; }
  const pad = 3;
  const pts = vals.map((v, i) => [pad + (i / (vals.length - 1)) * (w - pad * 2), ht - pad - ((v - min) / (max - min || 1)) * (ht - pad * 2)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  if (fill) svg.appendChild(h('path', { d: `${d} L${pts[pts.length - 1][0]} ${ht} L${pts[0][0]} ${ht} Z`, style: { fill: color }, opacity: .12 }));
  svg.appendChild(h('path', { d, fill: 'none', style: { stroke: color }, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  const last = pts[pts.length - 1];
  svg.appendChild(h('circle', { cx: last[0], cy: last[1], r: 2.6, style: { fill: color } }));
  return svg;
}

export function lineChart(series, { w = 640, h: ht = 260, baseline, yMin = 0, yMax = 100 } = {}) {
  const padL = 34, padR = 12, padT = 12, padB = 26;
  const all = (series || []).flatMap((s) => s.points || []);
  const xs = Array.from(new Set(all.map((p) => String(p.x)))).sort();
  const svg = h('svg', { viewBox: `0 0 ${w} ${ht}`, class: 'chart line', role: 'img', style: { width: '100%', height: 'auto', maxWidth: w + 'px' }, 'aria-label': 'Line chart: ' + (series || []).map((s) => s.label).join(', ') });
  const X = (x) => padL + (xs.length <= 1 ? 0.5 : xs.indexOf(String(x)) / (xs.length - 1)) * (w - padL - padR);
  const Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (ht - padT - padB);
  [0, 25, 50, 75, 100].forEach((t) => {
    svg.appendChild(h('line', { x1: padL, x2: w - padR, y1: Y(t), y2: Y(t), class: 'grid-line', 'stroke-width': 1, 'stroke-dasharray': t === 0 ? '' : '2 4' }));
    svg.appendChild(h('text', { x: padL - 8, y: Y(t) + 3, 'text-anchor': 'end', class: 'axis-label' }, String(t)));
  });
  if (xs.length) [0, Math.floor((xs.length - 1) / 2), xs.length - 1].filter((v, i, a) => a.indexOf(v) === i).forEach((i) => {
    const lab = /^\d{4}-\d{2}-\d{2}/.test(xs[i]) ? fmt.date(xs[i] + (xs[i].length === 10 ? 'T12:00:00' : ''), { month: 'short', day: 'numeric' }) : xs[i];
    svg.appendChild(h('text', { x: X(xs[i]), y: ht - 7, 'text-anchor': i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle', class: 'axis-label' }, lab));
  });
  if (baseline != null) {
    svg.appendChild(h('line', { x1: padL, x2: w - padR, y1: Y(baseline), y2: Y(baseline), style: { stroke: 'var(--accent-2)' }, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }, h('title', null, `Baseline ${Math.round(baseline)}`)));
    svg.appendChild(h('text', { x: w - padR, y: Y(baseline) - 5, 'text-anchor': 'end', class: 'axis-label', style: { fill: 'var(--accent-2)' } }, 'Baseline'));
  }
  (series || []).forEach((s, si) => {
    const pts = (s.points || []).filter((p) => p.y != null).map((p) => [X(p.x), Y(p.y)]);
    if (!pts.length) return;
    const col = s.color || dimColor(si);
    svg.appendChild(h('path', { d: pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), fill: 'none', style: { stroke: col }, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, h('title', null, s.label)));
    if (pts.length < 40) pts.forEach((p, i) => svg.appendChild(h('circle', { cx: p[0], cy: p[1], r: 2.8, style: { fill: col } }, h('title', null, `${s.label}: ${Math.round(s.points.filter((q) => q.y != null)[i].y)}`))));
  });
  return svg;
}

export function bar(value, { label, color } = {}) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const fill = h('i', color ? { style: { background: color } } : null);
  const el = h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v), 'aria-label': label || 'Score' }, fill);
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = v + '%'; }));
  return el;
}

/* ---------------- router + shell ---------------- */
let ROUTES = [];
let compiled = [];
let renderToken = 0;
let drawerOpen = false;

export function roleHome(role) { return role === 'CLINICIAN' ? '/pro' : role === 'ADMIN' ? '/admin' : '/home'; }

function compile(routes) {
  return routes.map((r) => {
    const keys = [];
    const re = new RegExp('^' + r.path.replace(/\/+$/, '').replace(/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    return { ...r, re, keys };
  });
}
function match(pathname) {
  for (const r of compiled) {
    const m = r.re.exec(pathname === '' ? '/' : pathname);
    if (m) { const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); return { route: r, params }; }
  }
  return null;
}
export function navigate(path, { replace = false } = {}) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) { location.href = path; return Promise.resolve(); }
  const target = url.pathname + url.search + url.hash;
  if (target !== location.pathname + location.search + location.hash) history[replace ? 'replaceState' : 'pushState']({}, '', target);
  return render();
}
export async function requireRole(role) {
  if (!state.user) { await navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true }); return false; }
  if (role && state.user.role !== role) { await navigate(roleHome(state.user.role), { replace: true }); return false; }
  return true;
}

async function render() {
  const token = ++renderToken;
  closeDrawer(true);
  const m = match(location.pathname);
  const view = document.getElementById('view');
  const query = Object.fromEntries(new URLSearchParams(location.search));
  if (!m) {
    document.title = 'Not found — SVARA';
    clear(view).appendChild(h('div', { class: 'container page' }, emptyState('We couldn’t find that page', 'It may have moved, or the link might be mistyped.', { href: '/', label: 'Back to SVARA' })));
    renderNav(); renderFooter(); return;
  }
  const { route, params } = m;
  if (route.role) {
    if (!state.user) await refreshMe();
    if (!state.user) return void navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true });
    if (state.user.role !== route.role) return void navigate(roleHome(state.user.role), { replace: true });
  }
  document.body.classList.toggle('has-tabbar', !!(state.user && state.user.role === 'USER' && route.role === 'USER'));
  renderNav(); renderFooter();
  clear(view).appendChild(loading());
  const title = typeof route.title === 'function' ? route.title({ params, query }) : route.title;
  document.title = title ? `${title} — SVARA` : 'SVARA — Your inner rhythm, understood.';
  let node;
  try { node = await route.render({ params, query, navigate }); }
  catch (e) { node = h('div', { class: 'container page' }, errorBox(e)); }
  if (token !== renderToken) return;
  clear(view);
  if (node) view.appendChild(node);
  window.scrollTo(0, location.hash ? 0 : 0);
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  reveal(view);
  const hd = view.querySelector('h1');
  if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: true }); } else view.focus({ preventScroll: true });
  if (state.user && state.user.role === 'USER') loadUnread();
}

async function loadUnread() {
  try { const r = await api('GET', '/api/notifications'); state.unread = (r.notifications || []).filter((n) => !n.read && !n.read_at).length; updateBell(); } catch { /* ignore */ }
}
export function setUnread(n) { state.unread = n; updateBell(); }
function updateBell() {
  const b = document.getElementById('bell-count');
  if (b) { b.textContent = String(state.unread > 9 ? '9+' : state.unread); b.hidden = !state.unread; }
}

const NAV_USER = [
  ['/home', 'Home', 'home'], ['/checkin', 'Check-in', 'check'], ['/guide', 'Guide', 'guide'], ['/find', 'Find your rhythm', 'compass'],
  ['/routines', 'Routines', 'routine'], ['/weekly', 'Weekly', 'weekly'], ['/learn', 'Learn', 'book'], ['/clinician', 'Clinician', 'clinician'], ['/privacy', 'Privacy', 'shield'],
];
const TAB_USER = [['/home', 'Home', 'home'], ['/checkin', 'Check-in', 'check'], ['/guide', 'Guide', 'guide'], ['/find', 'Rhythm', 'compass'], ['/weekly', 'Weekly', 'weekly']];
function navItems() {
  const u = state.user;
  if (!u) return [['/learn', 'Learn', 'book'], ['/explore', 'Explore', 'compass'], ['/login', 'Log in', 'user']];
  if (u.role === 'CLINICIAN') return [['/pro', 'Portal', 'clinician']];
  if (u.role === 'ADMIN') return [['/admin', 'Admin', 'settings']];
  return NAV_USER;
}
const here = (p) => location.pathname === p || (p !== '/' && location.pathname.startsWith(p + '/'));

function closeDrawer(silent) {
  drawerOpen = false;
  const d = document.getElementById('drawer'); if (d) d.classList.remove('open');
  const b = document.getElementById('menu-btn'); if (b) b.setAttribute('aria-expanded', 'false');
  void silent;
}
export async function signOut() {
  try { await api('POST', '/api/auth/logout'); } catch { /* ignore */ }
  state.user = null; state.profile = null; state.csrf = null; state.unread = 0;
  toast('You’ve signed out. Take care.', 'success');
  navigate('/');
}

export function renderNav() {
  const root = document.getElementById('nav'); if (!root) return;
  clear(root);
  const u = state.user;
  const items = navItems();
  const link = (it) => h('a', { href: it[0], 'aria-current': here(it[0]) ? 'page' : null }, it[1]);
  const dark = currentTheme() === 'dark';
  if (u && u.is_demo) root.appendChild(h('div', { class: 'demo-bar' }, 'Demo mode — you’re exploring synthetic data, not a real person’s information.'));
  const themeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': dark ? 'Switch to light mode' : 'Switch to dark mode', onclick: toggleTheme }, icon(dark ? 'sun' : 'moon'));
  const actions = h('div', { class: 'nav-actions' });
  if (u && u.role === 'USER') {
    actions.appendChild(h('a', { class: 'icon-btn', href: '/notifications', 'aria-label': 'Notifications' }, icon('bell'), h('span', { class: 'bell-count', id: 'bell-count', hidden: !state.unread }, String(state.unread))));
  }
  actions.appendChild(themeBtn);
  if (u) actions.appendChild(h('button', { class: 'btn btn-ghost btn-sm hide-sm', type: 'button', onclick: signOut }, 'Sign out'));
  else actions.appendChild(h('a', { class: 'btn btn-primary btn-sm nav-cta', href: '/check' }, 'Discover My Rhythm'));
  actions.appendChild(h('button', { class: 'icon-btn menu-btn', id: 'menu-btn', type: 'button', 'aria-label': 'Menu', 'aria-expanded': 'false', 'aria-controls': 'drawer', onclick: () => { drawerOpen = !drawerOpen; $('#drawer').classList.toggle('open', drawerOpen); $('#menu-btn').setAttribute('aria-expanded', String(drawerOpen)); } }, icon('menu')));
  root.appendChild(h('div', { class: 'nav-inner' },
    h('a', { class: 'brand', href: u ? roleHome(u.role) : '/', 'aria-label': 'SVARA home' }, logo(34), h('span', null, 'SVARA')),
    h('nav', { class: 'nav-links', 'aria-label': 'Main' }, items.filter((i) => i[0] !== '/login' || !u).map(link)),
    actions));
  const drawer = h('nav', { class: 'drawer', id: 'drawer', 'aria-label': 'Mobile' },
    items.map((it) => h('a', { href: it[0], 'aria-current': here(it[0]) ? 'page' : null }, icon(it[2]), it[1])),
    u ? h('button', { class: 'link', type: 'button', onclick: signOut }, icon('logout'), 'Sign out') : h('a', { href: '/check' }, icon('sparkle'), 'Discover My Rhythm'));
  root.appendChild(drawer);
  const oldTab = document.getElementById('tabbar'); if (oldTab) oldTab.remove();
  if (u && u.role === 'USER' && document.body.classList.contains('has-tabbar')) {
    document.body.appendChild(h('nav', { class: 'tabbar', id: 'tabbar', 'aria-label': 'Primary' }, TAB_USER.map((it) => h('a', { href: it[0], 'aria-current': here(it[0]) ? 'page' : null }, icon(it[2]), it[1]))));
  }
}

function renderFooter() {
  const f = document.getElementById('footer'); if (!f) return;
  clear(f);
  f.appendChild(h('div', { class: 'container foot' },
    h('div', null,
      h('a', { class: 'brand', href: '/', 'aria-label': 'SVARA home' }, logo(30), h('span', null, 'SVARA')),
      h('p', { class: 'muted', style: { marginTop: '10px', marginBottom: 0 } }, 'Your inner rhythm, understood.')),
    h('div', null,
      h('div', { class: 'foot-links' },
        h('a', { href: '/learn' }, 'Learn'), h('a', { href: '/explore' }, 'Explore Svara'), h('a', { href: '/products' }, 'Demo products'), h('a', { href: '/check' }, 'Discover My Rhythm'),
        state.user && state.user.role === 'USER' ? h('a', { href: '/privacy' }, 'Privacy') : null),
      disclaimer())));
}

function interceptLinks(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('rel') === 'external') return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) {
    e.preventDefault();
    const t = document.getElementById(url.hash.slice(1));
    if (t) { t.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); history.replaceState({}, '', url.hash); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
    return;
  }
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}

export async function startRouter(routes) {
  ROUTES = routes; compiled = compile(routes);
  document.addEventListener('click', interceptLinks);
  window.addEventListener('popstate', () => render());
  await Promise.all([refreshMe(), loadConfig()]);
  await render();
}
export { ROUTES };
