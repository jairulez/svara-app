// SVARA — signed-in user pages (builder D). Vanilla ES modules, text nodes only.
import {
  h, api, state, navigate, toast, track, icon, disclaimer, demoBadge, loading, errorBox, emptyState,
  sparkline, lineChart, dimIcon, refreshMe,
} from './core.js';

/* ───────────── shared helpers (also used by pages-pro.js) ───────────── */
export const e = (tag, attrs, ...kids) =>
  h(tag, attrs || {}, ...kids.flat(Infinity).filter((x) => x != null && x !== false && x !== ''));
export const set = (root, ...kids) => root.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false));
export function lazy(fn, cls = 'container stack a-page fade-in') {
  const root = e('div', { class: cls }, loading());
  Promise.resolve().then(() => fn(root)).catch((err) => set(root, errorBox(err)));
  return root;
}
export const A = (href, text, cls) =>
  e('a', { href, class: cls, onclick: (ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return; ev.preventDefault(); navigate(href); } }, text);
export const dt = (s, withTime) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return withTime
    ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
export const parse = (v, fb) => { if (v == null) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } };
export const rowsOf = (res) => (Array.isArray(res) ? res : res && typeof res === 'object' ? (Object.values(res).find(Array.isArray) || []) : []);
let uid = 0;
export const nextId = (p = 'a') => `${p}-${++uid}`;
export const DIR = { up: ['↑', 'improving'], steady: ['→', 'steady'], down: ['↓', 'lower'] };
export const dirWords = (d) => (DIR[d] ? `${DIR[d][0]} ${DIR[d][1]}` : '→ steady');
export const dirChip = (d) => e('span', { class: `a-dir a-dir-${DIR[d] ? d : 'steady'}` }, dirWords(d));
const rnd = (n) => (n == null || isNaN(n) ? '–' : Math.round(n));

export function field(label, control, { help, tag, id } = {}) {
  const fid = id || nextId('f');
  if (control && control.setAttribute && !control.id) control.id = fid;
  return e('div', { class: 'field' },
    e('label', { class: 'label', for: control && control.id ? control.id : fid }, label,
      tag ? e('span', { class: `a-tag ${tag === 'Sensitive' ? 'a-tag-sens' : ''}` }, tag) : null),
    control, help ? e('div', { class: 'help' }, help) : null);
}
export function toggle(label, checked, onchange, help) {
  const id = nextId('t');
  const input = e('input', { type: 'checkbox', id, class: 'a-switch-input', onchange: (ev) => onchange && onchange(ev.target.checked, ev.target) });
  input.checked = !!checked;
  return e('div', { class: 'a-switch-row' },
    e('label', { class: 'a-switch', for: id }, input, e('span', { class: 'a-switch-track', 'aria-hidden': 'true' }),
      e('span', { class: 'a-switch-label' }, label)),
    help ? e('div', { class: 'help' }, help) : null);
}
export function statusChip(s) {
  const label = String(s || '').replace(/_/g, ' ');
  return e('span', { class: `pill a-status a-status-${String(s || '').replace(/[^a-z_]/gi, '')}` }, label);
}
export function section(title, ...kids) {
  return e('section', { class: 'stack a-section', 'aria-label': title }, e('h2', { class: 'eyebrow' }, title), ...kids);
}
export function select(options, value, onchange, attrs = {}) {
  const s = e('select', { class: 'select', onchange: (ev) => onchange && onchange(ev.target.value), ...attrs },
    options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return e('option', { value: v }, l); }));
  s.value = value ?? '';
  return s;
}
export function btn(text, onclick, cls = 'btn btn-primary', attrs = {}) {
  return e('button', { type: 'button', class: cls, onclick, ...attrs }, text);
}
/** Run an async action on a button, disabling it meanwhile and toasting errors. */
export async function busy(button, fn) {
  button.disabled = true;
  try { return await fn(); } catch (err) { toast(err.message || 'Something went wrong', 'error'); } finally { button.disabled = false; }
}
export function listOf(items, cls = 'list') {
  return e('ul', { class: cls }, (items || []).map((t) => e('li', {}, typeof t === 'string' ? t : (t.text || t.title || ''))));
}
const periodNow = () => { const hr = new Date().getHours(); return hr < 5 ? 'evening' : hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening'; };
const GOALS_FALLBACK = [
  ['night_routine', '🌙', 'Better night routine'], ['relaxation', '🧘', 'More relaxation'], ['energy', '⚡', 'More energy'],
  ['focus', '🎯', 'Better focus'], ['recovery', '🏃', 'Recovery'], ['mood', '🙂', 'Better everyday mood'],
  ['motivation', '🔥', 'Motivation'], ['social', '🤝', 'Social wellbeing'],
].map(([key, emoji, label]) => ({ key, emoji, label }));
const goalList = () => {
  const g = state.config && state.config.goals;
  return g && g.length && g[0].key ? g : GOALS_FALLBACK;
};
const DIM_LABELS = {
  sleep: 'Sleep', energy: 'Energy', mood: 'Mood', relaxation: 'Relaxation', motivation: 'Motivation', focus: 'Focus',
  recovery: 'Recovery', social_connection: 'Social connection', stress: 'Stress ease', overall_wellbeing: 'Overall wellbeing',
};
export const dimLabel = (k) => DIM_LABELS[k] || k;
const jsonOf = (v) => parse(v, v);

/* ───────────── answer inputs (check-in) ───────────── */
const EMOJI = ['😞', '🙁', '😐', '🙂', '😄'];
export function answerInput(q, initial, onPick) {
  const opts = q.options || [];
  const type = q.response_type;
  const wrap = e('div', { class: `a-answer a-answer-${type}`, role: type === 'slider' ? null : 'radiogroup', 'aria-label': q.question });
  let current = initial || null;
  const caption = e('div', { class: 'a-answer-caption help', 'aria-live': 'polite' }, current ? opts[current - 1] : '');
  const btns = [];
  const pick = (v) => {
    current = v;
    btns.forEach((b, i) => { b.classList.toggle('active', i + 1 === v); b.setAttribute('aria-checked', String(i + 1 === v)); });
    caption.textContent = opts[v - 1] || '';
    onPick(v);
  };
  if (type === 'slider') {
    const s = e('input', { type: 'range', min: '1', max: '5', step: '1', class: 'a-range', 'aria-label': q.question, 'aria-valuetext': opts[2] || '3' });
    s.value = String(current || 3);
    const fire = () => { current = Number(s.value); caption.textContent = opts[current - 1] || ''; s.setAttribute('aria-valuetext', opts[current - 1] || String(current)); onPick(current); };
    ['input', 'change', 'click', 'keyup'].forEach((ev) => s.addEventListener(ev, fire));
    wrap.append(e('div', { class: 'a-range-ends' }, e('span', {}, opts[0] || '1'), e('span', {}, opts[4] || '5')), s, caption);
    if (!current) caption.textContent = 'Move the slider to choose';
    return wrap;
  }
  const mk = (i) => {
    const label = opts[i] || String(i + 1);
    const face = type === 'emoji' ? EMOJI[i] : type === 'choice' ? label : String(i + 1);
    const b = e('button', { type: 'button', role: 'radio', 'aria-checked': String(current === i + 1), 'aria-label': label,
      class: `a-opt a-opt-${type}${current === i + 1 ? ' active' : ''}`, onclick: () => pick(i + 1) },
      e('span', { class: 'a-opt-face' }, face));
    btns.push(b);
    return b;
  };
  const row = e('div', { class: `a-opts a-opts-${type}` }, [0, 1, 2, 3, 4].map(mk));
  wrap.append(row);
  if (type === 'scale5' || type === 'emoji') wrap.append(e('div', { class: 'a-range-ends' }, e('span', {}, opts[0] || ''), e('span', {}, opts[4] || '')));
  if (type !== 'choice') wrap.append(caption);
  return wrap;
}

/* ───────────── ONBOARDING ───────────── */
async function onboardingPage() {
  return lazy(async (root) => {
    let existing = {};
    try { existing = await api('GET', '/api/profile'); } catch { /* start fresh */ }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const ex = existing.profile || existing || {};
    const life = ex.lifestyle || {};
    const pref = ex.preferences || {};
    const d = {
      name: ex.name || (state.profile && state.profile.name) || '', age_range: ex.age_range || '', timezone: ex.timezone && ex.timezone !== 'UTC' ? ex.timezone : tz,
      lifestyle: life.lifestyle || '', sleep_schedule: life.sleep_schedule || '', activity_level: life.activity_level || '', work_pattern: life.work_pattern || '',
      goals: ex.goals || [], checkin_frequency: pref.checkin_frequency || 'daily', questions_per_day: pref.questions_per_day || 1,
      focus_areas: pref.focus_areas || [], max_sensitivity: pref.max_sensitivity || 'medium',
      ai_processing: false, analytics: false, marketing: false, clinician_sharing: false,
    };
    const tzs = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [tz]);
    if (!tzs.includes(d.timezone)) tzs.unshift(d.timezone);
    const chipGroup = (items, selected, multi, onchange) => {
      const box = e('div', { class: 'row a-chips', role: 'group' });
      const draw = () => set(box, items.map(([v, l]) => e('button', { type: 'button', class: `chip${(multi ? selected.includes(v) : selected === v) ? ' active' : ''}`, 'aria-pressed': String(multi ? selected.includes(v) : selected === v),
        onclick: () => { selected = multi ? (selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]) : (selected === v ? '' : v); onchange(selected); draw(); } }, l)));
      draw();
      return box;
    };
    const steps = [
      () => [
        e('h1', { class: 'h1' }, 'Let’s get to know your rhythm.'),
        e('p', { class: 'lead' }, 'A few gentle questions so Svara can reflect what matters to you. Everything marked Optional can be skipped.'),
        field('What should we call you?', Object.assign(e('input', { class: 'input', autocomplete: 'given-name', maxlength: '60', oninput: (ev) => { d.name = ev.target.value; } }), { value: d.name }), { tag: 'Optional' }),
        field('Age range', select([['', 'Prefer not to say'], '18–24', '25–34', '35–44', '45–54', '55–64', '65+'], d.age_range, (v) => { d.age_range = v; }), { tag: 'Optional' }),
        field('Timezone', select(tzs, d.timezone, (v) => { d.timezone = v; }), { help: 'Used so your “day” starts and ends at the right time.' }),
      ],
      () => [
        e('h1', { class: 'h2' }, 'Your usual days'),
        e('p', { class: 'muted' }, 'This gives context to your patterns. None of it is required.'),
        field('Typical sleep schedule', select([['', 'Skip'], ['early', 'Early — in bed before 10pm'], ['standard', 'Standard — around 10pm to midnight'], ['late', 'Late — after midnight'], ['irregular', 'It varies a lot']], d.sleep_schedule, (v) => { d.sleep_schedule = v; }), { tag: 'Optional' }),
        field('Activity level', select([['', 'Skip'], ['low', 'Mostly seated'], ['light', 'Light movement most days'], ['moderate', 'Regularly active'], ['high', 'Very active']], d.activity_level, (v) => { d.activity_level = v; }), { tag: 'Optional' }),
        field('Work pattern', select([['', 'Skip'], ['office', 'Office / on-site'], ['remote', 'Remote or hybrid'], ['shift', 'Shift work'], ['student', 'Studying'], ['caregiving', 'Caregiving or at home'], ['other', 'Something else']], d.work_pattern, (v) => { d.work_pattern = v; }), { tag: 'Optional' }),
        field('Lifestyle, in a few words', Object.assign(e('input', { class: 'input', maxlength: '120', placeholder: 'e.g. busy weekdays, quieter weekends', oninput: (ev) => { d.lifestyle = ev.target.value; } }), { value: d.lifestyle }), { tag: 'Optional', help: 'Avoid sharing names or medical details.' }),
      ],
      () => [
        e('h1', { class: 'h2' }, 'What would you like to understand better?'),
        e('p', { class: 'muted' }, 'Pick any that feel relevant. You can change these whenever you like.'),
        e('div', { class: 'grid grid-2 a-goals' }, goalList().map((g) => {
          const b = e('button', { type: 'button', class: `card a-goal-pick${d.goals.includes(g.key) ? ' active' : ''}`, 'aria-pressed': String(d.goals.includes(g.key)),
            onclick: () => { d.goals = d.goals.includes(g.key) ? d.goals.filter((x) => x !== g.key) : [...d.goals, g.key]; b.classList.toggle('active'); b.setAttribute('aria-pressed', String(d.goals.includes(g.key))); } },
            e('span', { class: 'a-goal-emoji', 'aria-hidden': 'true' }, g.emoji), e('span', {}, g.label));
          return b;
        })),
        field('Areas you’d like to understand', chipGroup(Object.entries(DIM_LABELS).slice(0, 8), d.focus_areas, true, (v) => { d.focus_areas = v; }), { tag: 'Optional' }),
      ],
      () => [
        e('h1', { class: 'h2' }, 'How would you like to check in?'),
        field('Check-in frequency', chipGroup([['daily', 'Every day'], ['few_per_week', 'A few times a week'], ['weekly', 'Once a week']], d.checkin_frequency, false, (v) => { d.checkin_frequency = v || 'daily'; })),
        field('Questions per check-in', chipGroup([[1, '1 question'], [2, '2 questions'], [3, '3 questions']], d.questions_per_day, false, (v) => { d.questions_per_day = v || 1; }), { help: 'One is plenty. Fewer questions, gentler habit.' }),
        field('How personal can questions be?', select([['low', 'Keep it light — everyday topics only'], ['medium', 'Some personal questions are fine'], ['high', 'I’m comfortable with more personal questions']], d.max_sensitivity, (v) => { d.max_sensitivity = v; }),
          { tag: 'Sensitive', help: 'Questions about mood or stress are only asked if you allow them here.' }),
      ],
      () => [
        e('h1', { class: 'h2' }, 'Your choices about your information'),
        e('p', { class: 'muted' }, 'Nothing here is switched on for you. Change any of these at any time in My Privacy.'),
        e('div', { class: 'card stack' },
          toggle('Allow AI processing for Svara Guide', d.ai_processing, (v) => { d.ai_processing = v; }, 'Lets Svara Guide read the minimum of your reported data to answer your questions. It is not a doctor and never diagnoses.'),
          toggle('Allow sharing with a clinician', d.clinician_sharing, (v) => { d.clinician_sharing = v; }, 'Only when you choose. Nothing is ever shared unless you send a report yourself, and you can revoke access at any time.'),
          toggle('Help improve Svara (anonymous analytics)', d.analytics, (v) => { d.analytics = v; }, 'Counts of screens and actions, with no names or answers attached.'),
          toggle('Occasional wellness emails (marketing)', d.marketing, (v) => { d.marketing = v; }, 'Optional. We do not sell personal wellness information.')),
        e('p', { class: 'help' }, 'By continuing you confirm you’ve read our ', A('/privacy', 'privacy information'), '.'),
      ],
    ];
    let step = 0;
    const err = e('div', { class: 'help a-error', role: 'alert' });
    const draw = () => {
      const last = step === steps.length - 1;
      const nextBtn = btn(last ? 'Finish' : 'Continue', async () => {
        if (!last) { step++; draw(); window.scrollTo(0, 0); return; }
        await busy(nextBtn, async () => {
          const consents = { ai_processing: d.ai_processing, analytics: d.analytics, marketing: d.marketing };
          if (d.clinician_sharing) consents.clinician_sharing = true;
          await api('PUT', '/api/profile', {
            name: d.name || undefined, age_range: d.age_range || undefined, timezone: d.timezone,
            lifestyle: { activity_level: d.activity_level, work_pattern: d.work_pattern, sleep_schedule: d.sleep_schedule, lifestyle: d.lifestyle },
            preferences: { ...pref, checkin_frequency: d.checkin_frequency, questions_per_day: d.questions_per_day, focus_areas: d.focus_areas, max_sensitivity: d.max_sensitivity,
              notifications: pref.notifications || { daily: true, weekly: true, reports: true } },
            goals: d.goals, consents, onboarding_completed: true,
          });
          try { await refreshMe(); } catch { /* ignore */ }
          navigate('/home');
        });
      });
      set(root, e('div', { class: 'narrow stack a-wizard' },
        e('div', { class: 'a-dots', role: 'img', 'aria-label': `Step ${step + 1} of ${steps.length}` }, steps.map((_, i) => e('span', { class: i <= step ? 'on' : '' }))),
        e('div', { class: 'card stack' }, steps[step]()),
        err,
        e('div', { class: 'row a-between' },
          step > 0 ? btn('Back', () => { step--; draw(); }, 'btn btn-ghost') : e('span'),
          e('div', { class: 'row' }, !last && step > 0 ? btn('Skip', () => { step++; draw(); }, 'btn btn-ghost') : null, nextBtn)),
        disclaimer()));
    };
    draw();
  }, 'container stack a-page fade-in');
}

/* ───────────── HOME ───────────── */
function baselineBanner(b) {
  if (!b || b.complete) return null;
  const n = b.days_completed || 0, t = b.target || 7;
  return e('div', { class: 'card-soft a-baseline' },
    e('strong', {}, `Day ${Math.max(1, Math.min(n, t))} of ${t} — building your baseline`),
    e('div', { class: 'a-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(t), 'aria-valuenow': String(n) }, e('span', { style: { width: `${Math.min(100, (n / t) * 100)}%` } })),
    e('p', { class: 'help' }, `${n} of ${t} check-in days so far. Your baseline is simply your own starting point — there’s no right or wrong.`));
}
function dimCard(d, win) {
  const series = (win === 7 ? d.series7 : d.series30) || [];
  const vals = series.map((p) => p.score).filter((v) => v != null);
  return e('article', { class: `card a-dim${d.has_data ? '' : ' a-dim-empty'}`, 'aria-label': d.label },
    e('div', { class: 'row a-between' }, e('h3', { class: 'h3 a-dim-title' }, dimIcon(d.key), d.label), d.has_data ? dirChip(d.direction) : null),
    d.has_data
      ? [e('div', { class: 'a-dim-nums' },
        d.baseline != null ? e('span', { class: 'a-dim-line', 'aria-label': `Baseline ${rnd(d.baseline)}, now ${rnd(d.current)}` }, `${rnd(d.baseline)} → ${rnd(d.current)}`) : e('span', { class: 'a-dim-line' }, rnd(d.current)),
        e('span', { class: 'help' }, d.baseline != null ? 'baseline → now' : 'so far')),
      vals.length > 1 ? e('div', { class: 'a-spark', role: 'img', 'aria-label': `${win}-day reported pattern` }, sparkline(vals, { w: 220, h: 44 })) : e('p', { class: 'help' }, 'More check-ins will draw this line.')]
      : e('p', { class: 'help' }, 'Nothing reported yet. It will appear after a check-in.'));
}
async function homePage() {
  return lazy(async (root) => {
    const dsh = await api('GET', '/api/dashboard');
    track('dashboard_viewed');
    let win = 7;
    const rhythm = dsh.rhythm || [];
    const primary = rhythm.filter((r) => r.primary !== false).slice(0, 8);
    const also = rhythm.filter((r) => r.primary === false);
    const grid = e('div', { class: 'grid grid-2 a-rhythm-grid' });
    const alsoRow = e('div', { class: 'grid grid-2 a-also' });
    const tog = e('div', { class: 'tabs', role: 'group', 'aria-label': 'Sparkline window' });
    const drawGrid = () => {
      set(grid, primary.map((d) => dimCard(d, win)));
      set(alsoRow, also.map((d) => dimCard(d, win)));
      set(tog, [7, 30].map((w) => e('button', { type: 'button', class: `tab${w === win ? ' active' : ''}`, 'aria-pressed': String(w === win), onclick: () => { win = w; drawGrid(); } }, `${w} days`)));
    };
    drawGrid();
    const hasAny = rhythm.some((r) => r.has_data);
    const name = dsh.name || (state.profile && state.profile.name) || '';
    set(root,
      e('header', { class: 'stack' },
        e('h1', { class: 'h1' }, `Good ${periodNow()}${name ? ', ' + name : ''}.`),
        e('p', { class: 'lead' }, 'Here’s how your rhythm has been moving.'),
        state.user && state.user.is_demo ? demoBadge('DEMO account') : null),
      baselineBanner(dsh.baseline),
      e('section', { class: 'card-soft row a-between a-prompt' },
        e('div', {}, e('strong', {}, dsh.checked_in_today ? 'You’ve checked in today. That’s enough.' : 'One question for you today.'),
          e('p', { class: 'help' }, dsh.checked_in_today ? 'Come back whenever it suits you — no streaks, no pressure.' : 'Takes under a minute, and it’s fine to skip.')),
        A('/checkin', dsh.checked_in_today ? 'Check in again' : 'Start check-in', 'btn btn-primary btn-sm')),
      section('MY RHYTHM', e('div', { class: 'row a-between' }, e('p', { class: 'help' }, 'Higher always means feeling better. Based only on what you report.'), tog),
        hasAny ? grid : emptyState('Your rhythm will appear here', 'Once you answer a few check-in questions, each dimension will show its own gentle line.', A('/checkin', 'Start your first check-in', 'btn btn-primary')),
        also.length ? [e('h3', { class: 'h3 muted' }, 'Also tracked'), alsoRow] : null),
      section('WHAT YOU’VE REPORTED', (dsh.reported || []).length ? listOf(dsh.reported) : e('p', { class: 'muted' }, 'Nothing to summarise yet — check in a few times and reflections will gather here.')),
      section('PATTERNS TO EXPLORE', (dsh.patterns || []).length ? listOf(dsh.patterns) : e('p', { class: 'muted' }, 'Patterns appear after a few days of check-ins with context. They’re observations, not conclusions.')),
      dsh.try_this ? section('ONE THING TO TRY', e('div', { class: 'card stack' }, e('strong', {}, dsh.try_this.title), e('p', {}, dsh.try_this.text),
        A('/routines', 'See this routine', 'btn btn-ghost btn-sm'))) : null,
      dsh.unread_notifications ? e('p', { class: 'help' }, A('/notifications', `You have ${dsh.unread_notifications} unread note${dsh.unread_notifications > 1 ? 's' : ''}.`)) : null,
      disclaimer());
  });
}

/* ───────────── TRENDS ───────────── */
const WINDOWS = [[7, '7 days'], [14, '14 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];
const varWords = (v) => (v == null ? 'not enough data yet' : v < 8 ? 'steady, with small day-to-day changes' : v < 15 ? 'some ups and downs' : 'wide swings from day to day');
function trendCard(d) {
  const pts = (d.series || []).filter((p) => p.score != null).map((p, i) => ({ x: i, y: p.score }));
  const ch = d.change;
  return e('article', { class: 'card stack a-trend', 'aria-label': d.label },
    e('div', { class: 'row a-between' }, e('h3', { class: 'h3 a-dim-title' }, dimIcon(d.key), d.label), dirChip(d.direction)),
    pts.length > 1 ? e('div', { class: 'a-chart', role: 'img', 'aria-label': `${d.label} line chart` }, lineChart([{ label: d.label, points: pts }], { w: 520, h: 150, baseline: d.baseline })) : e('p', { class: 'help' }, 'Not enough reports in this window to draw a line.'),
    e('dl', { class: 'a-dl' },
      e('div', {}, e('dt', {}, 'Now'), e('dd', {}, rnd(d.current))),
      e('div', {}, e('dt', {}, 'Baseline'), e('dd', {}, rnd(d.baseline))),
      e('div', {}, e('dt', {}, 'Change from baseline'), e('dd', {}, ch == null ? '–' : `${ch > 0 ? '+' : ''}${rnd(ch)}`)),
      e('div', {}, e('dt', {}, 'Reported trend'), e('dd', {}, dirWords(d.direction))),
      e('div', {}, e('dt', {}, 'Reported pattern'), e('dd', {}, varWords(d.variability))),
      d.consistency != null ? e('div', {}, e('dt', {}, 'Consistency of reporting'), e('dd', {}, d.consistency <= 1 ? `${Math.round(d.consistency * 100)}%` : `${rnd(d.consistency)}%`)) : null));
}
async function trendsPage(ctx) {
  return lazy(async (root) => {
    let win = Number(ctx.query && ctx.query.window) || 30;
    const body = e('div', { class: 'stack' });
    const tabs = e('div', { class: 'tabs', role: 'group', 'aria-label': 'Time window' });
    const load = async () => {
      set(tabs, WINDOWS.map(([w, l]) => e('button', { type: 'button', class: `tab${w === win ? ' active' : ''}`, 'aria-pressed': String(w === win), onclick: () => { win = w; load(); } }, l)));
      set(body, loading());
      try {
        const t = await api('GET', `/api/trends?window=${win}`);
        const dims = (t.dimensions || []);
        set(body, dims.some((d) => (d.series || []).length) ? e('div', { class: 'grid grid-2' }, dims.map(trendCard)) : emptyState('No trends yet', 'Trends appear once you have a few days of check-ins. There’s no rush.', A('/checkin', 'Check in', 'btn btn-primary')));
      } catch (err) { set(body, errorBox(err)); }
    };
    set(root, e('h1', { class: 'h1' }, 'Trends'), e('p', { class: 'lead' }, 'How each part of your rhythm has moved against your own baseline. These are reported patterns, not assessments.'), tabs, body, disclaimer());
    load();
  });
}

/* ───────────── CHECK-IN ───────────── */
async function checkinPage() {
  return lazy(async (root) => {
    const nx = await api('GET', '/api/checkin/next');
    const qs = nx.questions || [];
    if (nx.done_today || !qs.length) {
      return set(root, e('div', { class: 'narrow stack a-center' }, e('h1', { class: 'h1' }, 'That’s enough for today.'),
        e('p', { class: 'lead' }, 'You’ve already shared what you needed to. Come back tomorrow — or whenever feels right.'),
        e('div', { class: 'row' }, A('/home', 'Back to my rhythm', 'btn btn-primary'), A('/trends', 'See trends', 'btn btn-ghost')), disclaimer()));
    }
    const answers = {}; const notes = {}; const ctxv = {};
    let i = 0;
    const draw = () => {
      if (i >= qs.length) return drawContext();
      const q = qs[i];
      const next = btn(i === qs.length - 1 ? 'Continue' : 'Next', () => { i++; draw(); }, 'btn btn-primary', { disabled: !answers[q.id] });
      const note = e('textarea', { class: 'textarea', rows: '2', maxlength: '300', 'aria-label': 'Optional note', placeholder: 'Anything you’d like to add? (optional)', oninput: (ev) => { notes[q.id] = ev.target.value; } });
      note.value = notes[q.id] || '';
      set(root, e('div', { class: 'narrow stack a-checkin' },
        e('p', { class: 'eyebrow' }, nx.intro && i === 0 ? nx.intro : `Question ${i + 1} of ${qs.length}`),
        e('h1', { class: 'h2' }, q.question),
        answerInput(q, answers[q.id], (v) => { answers[q.id] = v; next.disabled = false; }),
        e('details', { class: 'a-note' }, e('summary', {}, 'Add a note'), note),
        e('div', { class: 'row a-between' }, i > 0 ? btn('Back', () => { i--; draw(); }, 'btn btn-ghost') : A('/home', 'Not now', 'btn btn-ghost'), next),
        e('p', { class: 'help' }, nx.reasons && nx.reasons.length ? `Chosen because: ${nx.reasons[0]}` : '')));
    };
    const chip = (key, val, label) => e('button', { type: 'button', class: `chip${ctxv[key] === val ? ' active' : ''}`, 'aria-pressed': String(ctxv[key] === val),
      onclick: (ev) => { if (ctxv[key] === val) delete ctxv[key]; else ctxv[key] = val; drawContext(); } }, label);
    const drawContext = () => {
      const sub = btn('Save check-in', async () => {
        await busy(sub, async () => {
          const payload = { answers: qs.filter((q) => answers[q.id]).map((q) => ({ question_id: q.id, value: answers[q.id], ...(notes[q.id] ? { note: notes[q.id] } : {}) })) };
          if (Object.keys(ctxv).length) payload.context = ctxv;
          const res = await api('POST', '/api/checkin', payload);
          track('check_in_completed', { n: payload.answers.length });
          if (nx.baseline && !nx.baseline.complete && res.baseline && res.baseline.complete) track('baseline_completed');
          drawDone(res);
        });
      });
      set(root, e('div', { class: 'narrow stack' },
        e('p', { class: 'eyebrow' }, 'Optional'),
        e('h1', { class: 'h2' }, 'Anything shaping today?'),
        e('p', { class: 'muted' }, 'Quick context helps spot patterns later. Skip freely.'),
        e('div', { class: 'stack' },
          e('div', {}, e('p', { class: 'label' }, 'Workload'), e('div', { class: 'row a-chips' }, [['light', 'Light'], ['moderate', 'Moderate'], ['heavy', 'Heavy']].map(([v, l]) => chip('workload', v, l)))),
          e('div', { class: 'row a-chips' }, chip('exercised', true, 'Exercised today'), chip('late_screens', true, 'Screens late'))),
        e('div', { class: 'row a-between' }, btn('Back', () => { i = qs.length - 1; draw(); }, 'btn btn-ghost'), sub)));
    };
    const drawDone = (res) => set(root, e('div', { class: 'narrow stack a-center fade-in' },
      e('p', { class: 'eyebrow' }, 'Reflection'), e('h1', { class: 'h2' }, 'Thank you.'),
      res.reflection ? e('p', { class: 'lead' }, res.reflection) : null,
      res.baseline && !res.baseline.complete ? baselineBanner(res.baseline) : null,
      e('div', { class: 'row' }, A('/home', 'See my rhythm', 'btn btn-primary'), A('/trends', 'View trends', 'btn btn-ghost')), disclaimer()));
    draw();
  }, 'container stack a-page fade-in');
}

/* ───────────── GUIDE ───────────── */
const RESOURCE_PATH = (r) => r.link || '/learn';
function bubble(role, content, extra = {}) {
  const sc = extra.safety_category;
  const crisis = sc === 'POTENTIAL_CRISIS' || sc === 'EMERGENCY';
  const care = role === 'assistant' && sc && sc !== 'NORMAL_WELLNESS' && sc !== 'NORMAL';
  const paras = String(content || '').split(/\n{1,}/).map((p) => e('p', {}, p));
  return e('div', { class: `a-msg a-msg-${role}` },
    e('div', { class: `a-bubble${care ? (crisis ? ' a-help-card' : ' a-care') : ''}`, role: crisis ? 'alert' : null },
      care && crisis ? e('strong', { class: 'a-help-title' }, 'You deserve support right now') : care ? e('strong', { class: 'a-care-title' }, 'A gentle note') : null,
      paras,
      crisis ? e('p', { class: 'help' }, 'If you may be in danger, please contact your local emergency number or a trusted person near you. A qualified professional can help in ways Svara can’t.') : null),
    (extra.resources || []).length ? e('div', { class: 'row a-res' }, extra.resources.map((r) => A(RESOURCE_PATH(r), `${r.type === 'routine' ? '🧭 ' : '📖 '}${r.title}`, 'pill'))) : null);
}
async function guidePage() {
  return lazy(async (root) => {
    let convs = []; let active = null; let aiOff = false;
    try { const p = await api('GET', '/api/profile'); const c = (p.profile || p).consents; if (c && c.ai_processing === false) aiOff = true; } catch { /* ignore */ }
    const loadConvs = async () => { try { convs = rowsOf(await api('GET', '/api/guide/conversations')); } catch { convs = []; } };
    await loadConvs();
    const list = e('nav', { class: 'a-conv-list stack', 'aria-label': 'Conversations' });
    const thread = e('div', { class: 'a-thread', 'aria-live': 'polite', role: 'log' });
    const sugg = e('div', { class: 'row a-sugg' });
    const input = e('textarea', { class: 'textarea', rows: '2', maxlength: '1000', 'aria-label': 'Message Svara Guide', placeholder: 'Ask about your own reported patterns…' });
    const form = e('form', { class: 'a-compose', onsubmit: (ev) => { ev.preventDefault(); send(input.value); } }, input, e('button', { class: 'btn btn-primary', type: 'submit' }, 'Send'));
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(input.value); } });
    const scroll = () => { thread.scrollTop = thread.scrollHeight; };
    const disabledNote = () => e('div', { class: 'callout' }, e('strong', {}, 'Svara Guide is switched off. '), 'Turn on AI processing in ', A('/privacy', 'My Privacy'), ' if you’d like to chat. Everything else in Svara works without it.');
    const drawList = () => set(list, btn('+ New conversation', () => { active = null; set(thread, welcome()); set(sugg); drawList(); }, 'btn btn-ghost btn-sm'),
      convs.map((c) => e('div', { class: `a-conv${c.id === active ? ' active' : ''}` },
        e('button', { type: 'button', class: 'a-conv-btn', onclick: () => open(c.id) }, c.title || 'Conversation', e('span', { class: 'help' }, dt(c.updated_at || c.created_at))),
        e('button', { type: 'button', class: 'a-x', 'aria-label': 'Delete conversation', onclick: async () => { if (!confirm('Delete this conversation?')) return; try { await api('DELETE', `/api/guide/conversations/${c.id}`); if (active === c.id) { active = null; set(thread, welcome()); } await loadConvs(); drawList(); } catch (er) { toast(er.message, 'error'); } } }, '×'))));
    const welcome = () => e('div', { class: 'a-welcome' }, e('p', { class: 'lead' }, 'Hello. Ask me about what you’ve reported — a trend, a pattern, or how to prepare for a conversation with a clinician.'),
      e('div', { class: 'row a-sugg' }, ['Summarise my week', 'Explain my sleep trend', 'Help me prepare to talk to a clinician'].map((s) => btn(s, () => send(s), 'chip'))));
    const open = async (id) => {
      active = id; drawList(); set(thread, loading());
      try {
        const r = await api('GET', `/api/guide/conversations/${id}`);
        set(thread, (r.messages || []).map((m) => { const meta = parse(m.meta, {}) || {}; return bubble(m.role, m.content, { safety_category: m.safety_category, resources: meta.resources }); }));
        set(sugg); scroll();
      } catch (er) { set(thread, errorBox(er)); }
    };
    let sending = false;
    const send = async (text) => {
      text = (text || '').trim(); if (!text || sending) return;
      sending = true; input.value = '';
      if (!active && thread.querySelector('.a-welcome')) set(thread);
      thread.append(bubble('user', text));
      const typing = e('div', { class: 'a-msg a-msg-assistant' }, e('div', { class: 'a-bubble a-typing', role: 'status', 'aria-label': 'Svara Guide is typing' }, e('span'), e('span'), e('span')));
      thread.append(typing); set(sugg); scroll();
      try {
        const r = await api('POST', '/api/guide/message', { conversationId: active || undefined, message: text });
        typing.remove();
        if (r.disabled) { aiOff = true; thread.append(bubble('assistant', r.reply)); thread.append(disabledNote()); form.hidden = true; }
        else {
          if (r.conversationId && r.conversationId !== active) { active = r.conversationId; await loadConvs(); drawList(); }
          thread.append(bubble('assistant', r.reply, r));
          set(sugg, (r.suggestions || []).map((s) => btn(s, () => send(s), 'chip')));
        }
      } catch (er) { typing.remove(); thread.append(e('div', { class: 'callout' }, er.message || 'Svara Guide couldn’t reply just now. Please try again in a moment.')); }
      sending = false; scroll();
    };
    drawList(); set(thread, welcome());
    if (aiOff) { thread.append(disabledNote()); }
    set(root,
      e('div', { class: 'row a-between' }, e('div', {}, e('p', { class: 'eyebrow' }, 'SVARA GUIDE'), e('h1', { class: 'h1' }, 'Svara Guide'))),
      e('div', { class: 'callout', role: 'note' }, 'Svara Guide helps you understand your own reported patterns. It isn’t a doctor and can’t diagnose, prescribe or advise on medication.'),
      e('div', { class: 'a-guide' }, e('aside', { class: 'a-guide-side' }, list), e('div', { class: 'a-guide-main card' }, thread, sugg, form)),
      disclaimer());
    if (aiOff) form.hidden = true;
  }, 'container stack a-page fade-in');
}

/* ───────────── FIND YOUR RHYTHM ───────────── */
async function findPage(ctx) {
  return lazy(async (root) => {
    const goals = goalList();
    const out = e('div', { class: 'stack' });
    const picker = e('div', { class: 'grid grid-3 a-goals' });
    let sel = ctx.query && ctx.query.goal;
    const drawPick = () => set(picker, goals.map((g) => e('button', { type: 'button', class: `card a-goal-pick${sel === g.key ? ' active' : ''}`, 'aria-pressed': String(sel === g.key), onclick: () => { sel = g.key; drawPick(); show(); } },
      e('span', { class: 'a-goal-emoji', 'aria-hidden': 'true' }, g.emoji), e('span', {}, g.label))));
    const show = async () => {
      if (!sel) return set(out);
      set(out, loading());
      try {
        const r = await api('GET', `/api/rhythm/find?goal=${encodeURIComponent(sel)}`);
        const g = goals.find((x) => x.key === sel) || {};
        const rt = r.routine;
        const steps = rt ? parse(rt.steps, []) : [];
        set(out,
          e('h2', { class: 'h2' }, `${g.emoji || ''} ${g.label || ''}`),
          section('WHERE YOUR RHYTHM IS NOW', (r.snapshot || []).length ? e('div', { class: 'grid grid-2' }, r.snapshot.map((s) => e('div', { class: 'card row a-between' }, e('strong', {}, s.label), e('span', {}, s.current != null ? `${s.baseline != null ? rnd(s.baseline) + ' → ' : ''}${rnd(s.current)} ` : 'no data yet', s.current != null ? dirChip(s.direction) : null)))) : e('p', { class: 'muted' }, 'Check in a few times and this will fill in.')),
          section('WHAT YOU’VE REPORTED', (r.observations || []).length ? listOf(r.observations) : e('p', { class: 'muted' }, 'No observations yet.')),
          (r.resources || []).length ? section('LEARN MORE', e('div', { class: 'grid grid-2' }, r.resources.map((x) => e('div', { class: 'card stack' }, e('span', { class: 'pill' }, x.category), e('strong', {}, x.title), e('p', { class: 'help' }, x.summary), A(`/learn/${x.slug}`, 'Read', 'btn btn-ghost btn-sm'))))) : null,
          rt ? section('A SIMPLE ROUTINE', e('div', { class: 'card stack' }, e('strong', {}, rt.name), e('span', { class: 'help' }, `${rt.duration_min} min · ${rt.frequency}`), listOf(steps.map((s) => (typeof s === 'string' ? s : s.text || s.title))), e('p', { class: 'help' }, rt.safety_notes || 'A general wellness activity, not a medical treatment.'),
            (() => { const b = btn('Start this routine', () => busy(b, async () => { await api('POST', `/api/routines/${rt.id}/start`); track('routine_started', { routine: rt.name }); toast('Routine started — take your time.'); navigate('/routines'); })); return b; })())) : null,
          r.tracking_goal ? section('OPTIONAL TRACKING GOAL', e('div', { class: 'card stack' }, e('p', {}, r.tracking_goal.text),
            (() => { const b = btn(`Track ${r.tracking_goal.label || 'this'}`, () => busy(b, async () => { await api('POST', '/api/rhythm/goal', { goal_key: sel, active: true }); toast('Added to your goals.'); }), 'btn btn-ghost'); return b; })())) : null,
          r.clinician_cta ? e('div', { class: 'callout' }, e('p', {}, r.clinician_cta.text), A('/clinician', 'Talk to a clinician', 'btn btn-ghost btn-sm')) : null,
          (r.products || []).length ? section('Appropriate next step (demo)', e('div', { class: 'grid grid-2' }, r.products.map((p) => e('div', { class: 'card stack' }, p.badge || p.is_demo ? e('span', { class: 'badge-demo' }, 'DEMO — NOT FOR SALE') : null, e('strong', {}, p.name), e('span', { class: 'help' }, p.category), e('p', {}, p.description), p.required_disclaimer ? e('p', { class: 'help' }, p.required_disclaimer) : null)))) : null,
          disclaimer());
      } catch (er) { set(out, errorBox(er)); }
    };
    drawPick();
    set(root, e('h1', { class: 'h1' }, 'Find your rhythm'), e('p', { class: 'lead' }, 'Choose what you’d like to understand better. We’ll show what you’ve reported and a gentle place to start.'), picker, out);
    if (sel) show();
  });
}

/* ───────────── ROUTINES ───────────── */
async function routinesPage() {
  return lazy(async (root) => {
    const [lib, act] = await Promise.all([api('GET', '/api/routines'), api('GET', '/api/routines/activity')]);
    const routines = lib.routines || [];
    let activity = act.activity || [];
    const byId = Object.fromEntries(routines.map((r) => [r.id, r]));
    const grid = e('div', { class: 'grid grid-2' });
    const hist = e('div', { class: 'stack' });
    const state_ = (id) => { const l = activity.find((a) => a.routine_id === id); return l && l.status === 'started' ? l : null; };
    const draw = () => {
      set(grid, routines.map((r) => {
        const steps = parse(r.steps, []); const running = state_(r.id);
        const b = running
          ? btn('Mark complete', () => busy(b, async () => { await api('POST', `/api/routines/${r.id}/complete`); track('routine_completed', { routine: r.name }); toast('Nicely done.'); await reload(); }))
          : btn('Start', () => busy(b, async () => { await api('POST', `/api/routines/${r.id}/start`); track('routine_started', { routine: r.name }); await reload(); }), 'btn btn-ghost btn-sm');
        return e('article', { class: 'card stack', 'aria-label': r.name },
          e('div', { class: 'row a-between' }, e('h3', { class: 'h3' }, r.name), e('span', { class: 'pill' }, `${r.duration_min} min`)),
          e('p', { class: 'help' }, `${r.goal} · ${r.frequency}`),
          e('details', { class: 'a-note' }, e('summary', {}, `${steps.length} steps`), e('ol', { class: 'list' }, steps.map((s) => e('li', {}, typeof s === 'string' ? s : s.text || s.title || '')))),
          e('p', { class: 'help' }, `${r.safety_notes ? r.safety_notes + ' ' : ''}A general wellness activity, not a medical treatment.`),
          b);
      }));
      set(hist, activity.length ? e('table', { class: 'table' }, e('thead', {}, e('tr', {}, e('th', {}, 'Date'), e('th', {}, 'Routine'), e('th', {}, 'Status'))),
        e('tbody', {}, activity.slice(0, 30).map((a) => e('tr', {}, e('td', {}, dt(a.day || a.created_at)), e('td', {}, a.name || a.routine_name || (byId[a.routine_id] || {}).name || 'Routine'), e('td', {}, statusChip(a.status)))))) : e('p', { class: 'muted' }, 'Nothing here yet. Try one when it feels right.'));
    };
    const reload = async () => { try { activity = (await api('GET', '/api/routines/activity')).activity || []; } catch { /* keep */ } draw(); };
    draw();
    set(root, e('h1', { class: 'h1' }, 'Routines'), e('p', { class: 'lead' }, 'Small, optional practices. Try one, notice how it goes — there’s no score and no streak.'),
      e('p', { class: 'muted' }, `${act.completed_7d || 0} completed in the last 7 days.`),
      routines.length ? grid : emptyState('No routines available', 'Check back soon.'),
      section('YOUR ACTIVITY', hist), disclaimer());
  });
}

/* ───────────── WEEKLY ───────────── */
function weeklyView(c) {
  c = parse(c, {}) || {};
  return e('div', { class: 'stack' },
    e('h2', { class: 'h2' }, c.title || 'YOUR WEEK IN SVARA'),
    c.week_start ? e('p', { class: 'muted' }, `${dt(c.week_start)}${c.week_end ? ' – ' + dt(c.week_end) : ''}`) : null,
    (c.arrows || []).length ? e('div', { class: 'grid grid-3' }, c.arrows.map((a) => e('div', { class: 'card row a-between' }, e('strong', {}, a.label || dimLabel(a.dimension)), dirChip(a.direction)))) : null,
    section('WHAT YOU REPORTED', (c.reported || []).length ? listOf(c.reported) : e('p', { class: 'muted' }, 'Not much reported this week — and that’s fine.')),
    section('REFLECTION', e('p', {}, c.reflection || '')),
    section('NEXT WEEK', e('p', {}, c.next_week || '')),
    disclaimer(c.disclaimer));
}
async function weeklyPage() {
  return lazy(async (root) => {
    const [cur, lst] = await Promise.all([api('GET', '/api/weekly'), api('GET', '/api/weekly/list').catch(() => ({}))]);
    track('weekly_report_viewed');
    const past = rowsOf(lst);
    const view = e('div', {}, cur.report ? weeklyView(cur.report.content) : emptyState('No weekly summary yet', 'Your first one appears after a few days of check-ins.', A('/checkin', 'Check in', 'btn btn-primary')));
    set(root, view,
      past.length ? section('PAST WEEKS', e('div', { class: 'row a-chips' }, past.map((p) => e('button', { type: 'button', class: 'chip', onclick: () => { set(view, weeklyView(p.content || { title: 'YOUR WEEK IN SVARA', week_start: p.week_start, reflection: 'This week’s full summary is not available to view here.' })); window.scrollTo(0, 0); } }, `Week of ${dt(p.week_start)}`)))) : null);
  });
}

/* ───────────── CLINICIAN ───────────── */
const STAGES = ['requested', 'scheduled', 'in_consultation', 'completed', 'closed'];
export function timeline(status) {
  if (status === 'revoked') return e('p', { class: 'help' }, 'Access revoked — this clinician can no longer view the report.');
  const idx = STAGES.indexOf(status);
  return e('ol', { class: 'a-steps', 'aria-label': 'Status timeline' }, STAGES.map((s, i) => e('li', { class: i < idx ? 'done' : i === idx ? 'now' : '', 'aria-current': i === idx ? 'step' : null }, s.replace(/_/g, ' '))));
}
async function clinicianPage() {
  return lazy(async (root) => {
    const pw = await api('GET', '/api/clinician/pathway');
    const f = { range: 30, questions: [], comments: '', consent: false };
    let p = {};
    try { p = (await api('GET', '/api/profile')).profile || {}; } catch { /* ignore */ }
    const form = e('div', { class: 'stack' });
    const preview = e('div', { class: 'card-soft stack', 'aria-live': 'polite' });
    const qList = e('ul', { class: 'list a-qlist' });
    const drawQ = () => set(qList, f.questions.map((q, i) => e('li', {}, q, ' ', e('button', { type: 'button', class: 'a-x', 'aria-label': `Remove question ${i + 1}`, onclick: () => { f.questions.splice(i, 1); drawQ(); } }, '×'))));
    const qIn = e('input', { class: 'input', maxlength: '200', placeholder: 'Add a question to discuss', 'aria-label': 'Question to discuss' });
    const addQ = () => { const v = qIn.value.trim(); if (v && f.questions.length < 8) { f.questions.push(v); qIn.value = ''; drawQ(); } };
    qIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addQ(); } });
    const drawPreview = () => set(preview, e('strong', {}, 'What will be shared'),
      listOf([`Your 10 rhythm dimensions: current, baseline and trends (${f.range ? 'last ' + f.range + ' days' : 'full history'})`, 'Your goals', 'Recent changes and patterns you’ve reported', f.comments ? 'Your comments (below)' : 'Your comments (none added)', `Lifestyle context${p.lifestyle ? '' : ' (if you’ve added it)'}`, f.questions.length ? `${f.questions.length} question(s) to discuss` : 'No questions added']),
      e('p', { class: 'help' }, 'Not shared: your Svara Guide conversations, notification history, or account details.'));
    const rangeRow = e('div', { class: 'row a-chips', role: 'group', 'aria-label': 'Time range' });
    const drawRange = () => set(rangeRow, [[7, '7 days'], [30, '30 days'], [90, '90 days'], [null, 'Full history']].map(([v, l]) => e('button', { type: 'button', class: `chip${f.range === v ? ' active' : ''}`, 'aria-pressed': String(f.range === v), onclick: () => { f.range = v; drawRange(); drawPreview(); } }, l)));
    const comments = e('textarea', { class: 'textarea', rows: '3', maxlength: '800', placeholder: 'Anything you want the clinician to know (optional)', oninput: (ev) => { f.comments = ev.target.value; drawPreview(); } });
    const sub = btn('Share with a clinician', () => busy(sub, async () => {
      if (!f.consent) { toast('Please tick the consent box first.', 'error'); return; }
      await api('POST', '/api/clinician/request', { range_days: f.range, questions: f.questions, comments: f.comments, consent: true });
      track('clinician_requested'); track('clinician_report_shared');
      toast('Report shared. You can revoke access at any time.');
      navigate('/clinician?r=' + Date.now());
    }), 'btn btn-primary', { disabled: true });
    const consentRow = toggle('I consent to sharing this report with a qualified clinician. I can revoke access at any time.', false, (v) => { f.consent = v; sub.disabled = !v; });
    drawRange(); drawQ(); drawPreview();
    const reports = pw.reports || [];
    const rep = e('div', { class: 'stack' });
    const drawReports = () => set(rep, reports.length ? reports.map((r) => {
      const det = e('div', { class: 'stack' });
      const dBtn = btn('View notes', () => busy(dBtn, async () => {
        const x = await api('GET', `/api/clinician/reports/${r.id}`);
        const notes = x.notes || [];
        set(det, notes.length ? notes.map((n) => e('div', { class: 'a-note-item' }, e('span', { class: 'pill' }, n.kind === 'next_step' ? 'recommended next step' : n.kind), ' ', e('span', { class: 'help' }, dt(n.created_at)), n.body ? e('p', {}, n.body) : null, n.file_name ? e('p', { class: 'help' }, `📎 ${n.file_name}`) : null)) : e('p', { class: 'muted' }, 'No notes visible to you yet.'));
      }), 'btn btn-ghost btn-sm');
      const rv = r.status !== 'revoked' && r.status !== 'closed' ? btn('Revoke access', () => busy(rv, async () => { if (!confirm('Revoke this clinician’s access to the report?')) return; await api('POST', `/api/clinician/reports/${r.id}/revoke`); r.status = 'revoked'; drawReports(); toast('Access revoked.'); }), 'btn btn-ghost btn-sm') : null;
      return e('article', { class: 'card stack' }, e('div', { class: 'row a-between' }, e('strong', {}, `Report from ${dt(r.created_at)}`), statusChip(r.status)),
        e('p', { class: 'help' }, `${r.range_days ? 'Last ' + r.range_days + ' days' : 'Full history'}${r.scheduled_for ? ' · Scheduled ' + dt(r.scheduled_for, true) : ''}`),
        timeline(r.status), e('div', { class: 'row' }, dBtn, rv), det);
    }) : e('p', { class: 'muted' }, 'You haven’t shared any reports.'));
    drawReports();
    const cl = (pw.clinicians || [])[0];
    set(root, e('h1', { class: 'h1' }, 'Talk to a clinician'),
      e('p', { class: 'lead' }, 'You can share your Svara history with a qualified clinician for professional assessment.'),
      e('div', { class: 'callout' }, 'Svara does not diagnose or prescribe. A clinician makes any professional decisions. Sharing is always your choice.', cl ? ` Reports are routed to ${cl.display_name}${cl.specialty ? ', ' + cl.specialty : ''}${cl.is_demo ? ' (demo clinician)' : ''}.` : ''),
      section('SHARE A REPORT', e('div', { class: 'card stack' },
        field('Time range to include', rangeRow),
        field('Questions to discuss', e('div', { class: 'stack' }, qList, e('div', { class: 'row' }, qIn, btn('Add', addQ, 'btn btn-ghost btn-sm'))), { tag: 'Optional' }),
        field('Comments', comments, { tag: 'Optional' }),
        preview, consentRow, sub)),
      section('YOUR REPORTS', rep), disclaimer());
  });
}

/* ───────────── PRIVACY ───────────── */
async function privacyPage() {
  return lazy(async (root) => {
    const pv = await api('GET', '/api/privacy');
    const consents = pv.consents || {};
    const g = (k) => !!(consents[k] && consents[k].granted);
    const shares = pv.sharing || [];
    const hist = e('div', {});
    const tg = (k, label, help) => toggle(label, g(k), async (v, el) => { try { await api('PUT', '/api/privacy/consents', { [k]: v }); toast('Saved.'); } catch (er) { el.checked = !v; toast(er.message, 'error'); } }, help);
    const dl = btn('Download my data (JSON)', () => busy(dl, async () => {
      const res = await fetch('/api/privacy/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Export failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = 'svara-my-data.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    }), 'btn btn-ghost');
    const hb = btn('View access history', () => busy(hb, async () => {
      const r = await api('GET', '/api/privacy/access-history'); const en = r.entries || [];
      set(hist, en.length ? e('table', { class: 'table' }, e('thead', {}, e('tr', {}, e('th', {}, 'When'), e('th', {}, 'Who'), e('th', {}, 'What'))), e('tbody', {}, en.map((x) => e('tr', {}, e('td', {}, dt(x.at, true)), e('td', {}, x.actor_role), e('td', {}, String(x.action).replace(/[._]/g, ' ')))))) : e('p', { class: 'muted' }, 'No one else has accessed your information.'));
    }), 'btn btn-ghost');
    const pw = e('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' });
    const ty = e('input', { class: 'input', 'aria-label': 'Type DELETE to confirm', placeholder: 'DELETE' });
    const del = btn('Permanently delete my account', () => busy(del, async () => {
      if (ty.value.trim() !== 'DELETE') { toast('Type DELETE to confirm.', 'error'); return; }
      await api('POST', '/api/privacy/delete', { password: pw.value });
      state.user = null; toast('Your account and data were deleted.'); navigate('/');
    }), 'btn btn-ghost a-danger');
    set(root, e('p', { class: 'eyebrow' }, 'MY PRIVACY'), e('h1', { class: 'h1' }, 'You’re in control.'),
      e('div', { class: 'card-soft stack' }, (pv.statements || ['We do not sell personal wellness information.']).map((s) => e('p', {}, '✓ ' + s))),
      section('WHAT WE COLLECT', e('div', { class: 'a-table-wrap' }, e('table', { class: 'table' }, e('thead', {}, e('tr', {}, ['What', 'Why', 'Who can access', 'Retention'].map((t) => e('th', {}, t)))),
        e('tbody', {}, (pv.collected || []).map((c) => e('tr', {}, e('td', {}, c.what), e('td', {}, c.why), e('td', {}, c.who), e('td', {}, c.retention))))))),
      pv.retention ? e('p', { class: 'help' }, typeof pv.retention === 'string' ? pv.retention : '') : null,
      section('YOUR CHOICES', e('div', { class: 'card stack' }, tg('ai_processing', 'AI processing for Svara Guide', 'Lets the guide use the minimum of your reported data to reply.'), tg('analytics', 'Anonymous analytics', 'Counts of actions with no names or answers.'), tg('marketing', 'Wellness emails', 'Optional.'))),
      section('CLINICIAN SHARING', shares.length ? e('div', { class: 'stack' }, shares.map((s) => e('div', { class: 'card row a-between' }, e('span', {}, `Report from ${dt(s.created_at)} `, statusChip(s.status)), s.status !== 'revoked' && s.status !== 'closed' ? (() => { const b = btn('Revoke', () => busy(b, async () => { await api('POST', `/api/clinician/reports/${s.id}/revoke`); s.status = 'revoked'; toast('Access revoked.'); navigate('/privacy?r=' + Date.now()); }), 'btn btn-ghost btn-sm'); return b; })() : null))) : e('p', { class: 'muted' }, 'You haven’t shared anything. Sharing only happens when you choose.')),
      section('YOUR DATA', e('div', { class: 'row' }, dl, hb), hist),
      section('DELETE ACCOUNT', e('div', { class: 'card stack' }, e('p', {}, 'This permanently deletes your account and everything in it. It can’t be undone.'), field('Type DELETE to confirm', ty), field('Your password', pw), del)),
      disclaimer());
  });
}

/* ───────────── NOTIFICATIONS ───────────── */
async function notificationsPage() {
  return lazy(async (root) => {
    let list = (await api('GET', '/api/notifications')).notifications || [];
    let prof = {};
    try { const pr = await api('GET', '/api/profile'); prof = pr.profile || pr; } catch { /* ignore */ }
    const prefs = { daily: true, weekly: true, reports: true, ...((prof.preferences || {}).notifications || {}) };
    const box = e('div', { class: 'stack' });
    const draw = () => set(box, list.length ? list.map((n) => e('article', { class: `card stack a-notif${n.read_at ? '' : ' unread'}` },
      e('div', { class: 'row a-between' }, e('strong', {}, n.title), e('span', { class: 'help' }, dt(n.created_at, true))),
      n.body ? e('p', {}, n.body) : null,
      e('div', { class: 'row' }, n.link ? A(n.link, 'Open', 'btn btn-ghost btn-sm') : null,
        !n.read_at ? (() => { const b = btn('Mark read', () => busy(b, async () => { await api('POST', `/api/notifications/${n.id}/read`); n.read_at = new Date().toISOString(); draw(); }), 'btn btn-ghost btn-sm'); return b; })() : null))) : emptyState('All quiet', 'New notes will show up here.'));
    draw();
    const all = btn('Mark all read', () => busy(all, async () => { await api('POST', '/api/notifications/read-all'); list.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); }); draw(); }), 'btn btn-ghost btn-sm');
    const pt = (k, l, hp) => toggle(l, prefs[k], async (v, el) => { prefs[k] = v; try { await api('PUT', '/api/profile', { preferences: { ...(prof.preferences || {}), notifications: { ...prefs } } }); prof.preferences = { ...(prof.preferences || {}), notifications: { ...prefs } }; toast('Saved.'); } catch (er) { el.checked = !v; prefs[k] = !v; toast(er.message, 'error'); } }, hp);
    set(root, e('div', { class: 'row a-between' }, e('h1', { class: 'h1' }, 'Notifications'), all), box,
      section('PREFERENCES', e('div', { class: 'card stack' }, pt('daily', 'Daily check-in prompt', 'At most one gentle prompt a day.'), pt('weekly', 'Weekly summary ready'), pt('reports', 'Clinician report updates'))));
  });
}

/* ───────────── routes ───────────── */
export const routes = [
  { path: '/onboarding', role: 'USER', title: 'Welcome to Svara', render: onboardingPage },
  { path: '/home', role: 'USER', title: 'My Rhythm', render: homePage },
  { path: '/trends', role: 'USER', title: 'Trends', render: trendsPage },
  { path: '/checkin', role: 'USER', title: 'Check-in', render: checkinPage },
  { path: '/guide', role: 'USER', title: 'Svara Guide', render: guidePage },
  { path: '/find', role: 'USER', title: 'Find your rhythm', render: findPage },
  { path: '/routines', role: 'USER', title: 'Routines', render: routinesPage },
  { path: '/weekly', role: 'USER', title: 'Your week', render: weeklyPage },
  { path: '/clinician', role: 'USER', title: 'Talk to a clinician', render: clinicianPage },
  { path: '/privacy', role: 'USER', title: 'My Privacy', render: privacyPage },
  { path: '/notifications', role: 'USER', title: 'Notifications', render: notificationsPage },
];
