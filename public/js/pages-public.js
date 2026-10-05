// Public pages: landing, check, snapshot, share, auth, explore, learn, products.
import {
  h, api, state, refreshMe, navigate, toast, track, fmt, icon, logo, disclaimer, demoBadge, loading, errorBox, emptyState,
  rhythmRings, radar, sparkline, bar, dimIcon, markdown, countUp, dimColor, roleHome, setSession, PRIMARY, dimLabel, clear, DISCLAIMER_TEXT,
} from './core.js';

const STORE_KEY = 'svara.assessment';
const readAssessment = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch { return null; } };
const writeAssessment = (v) => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* ignore */ } };
const clearAssessment = () => { try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ } };
const safeNext = (n) => (n && /^\/(?!\/)/.test(n) && !n.startsWith('/api') ? n : null);
const prettyCat = (c) => String(c || '').replace(/[_-]+/g, ' ').replace(/^\w/, (x) => x.toUpperCase());
const wrap = (...c) => h('div', { class: 'container page' }, ...c);

/* ======================= LANDING ======================= */
const SAMPLE = { sleep: 72, energy: 58, mood: 66, relaxation: 44, motivation: 61, focus: 70, recovery: 55, social_connection: 68 };

function sectionHead(eyebrow, title, lead, center) {
  return h('div', { class: 'section-head' + (center ? ' center' : '') + ' reveal' },
    eyebrow ? h('span', { class: 'eyebrow' }, eyebrow) : null, h('h2', { class: 'h2' }, title), lead ? h('p', { class: 'lead' }, lead) : null);
}

function wavesBg() {
  const p = (y, a) => `M0 ${y} ` + Array.from({ length: 8 }, (_, i) => `q 100 ${i % 2 ? a : -a} 200 0`).join(' ');
  return h('div', { class: 'waves-bg', 'aria-hidden': 'true' },
    h('svg', { viewBox: '0 0 1600 160', preserveAspectRatio: 'none' },
      h('path', { d: p(70, 40), fill: 'none', style: { stroke: 'var(--c2)' }, 'stroke-width': 1.5 }),
      h('path', { d: p(95, 30), fill: 'none', style: { stroke: 'var(--c3)' }, 'stroke-width': 1.2, opacity: .7 }),
      h('path', { d: p(120, 22), fill: 'none', style: { stroke: 'var(--c1)' }, 'stroke-width': 1, opacity: .5 })));
}

function miniCheckin() {
  const qs = [
    { dim: 'energy', q: 'How is your energy right now?', opts: ['Very low', 'Low', 'Steady', 'Good', 'Bright'], emoji: ['😴', '🙁', '😐', '🙂', '😄'] },
    { dim: 'relaxation', q: 'How relaxed does your body feel?', opts: ['Tense', 'A little tight', 'Neutral', 'Fairly loose', 'Deeply at ease'], emoji: ['😣', '😕', '😐', '🙂', '😌'] },
    { dim: 'focus', q: 'How easy is it to focus today?', opts: ['Scattered', 'Drifting', 'Okay', 'Clear', 'Very sharp'], emoji: ['🌫️', '🙁', '😐', '🙂', '🎯'] },
  ];
  const root = h('div', { class: 'card demo-checkin' });
  let i = 0; const vals = [];
  function draw() {
    clear(root);
    if (i >= qs.length) {
      root.appendChild(h('div', { class: 'stack fade-in' },
        h('span', { class: 'eyebrow' }, 'Your mini snapshot'),
        ...qs.map((q, k) => h('div', { style: { textAlign: 'left' } }, h('div', { class: 'row between' }, h('span', null, dimLabel(q.dim)), h('b', null, q.opts[vals[k] - 1])), bar((vals[k] - 1) * 25, { label: dimLabel(q.dim) }))),
        h('p', { class: 'muted' }, 'That’s the idea: a few gentle questions, a clearer picture. Nothing here was saved.'),
        h('div', { class: 'row center' },
          h('a', { class: 'btn btn-primary', href: '/check' }, 'Take the 60-second check', icon('arrow')),
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { i = 0; vals.length = 0; draw(); } }, 'Try again'))));
      return;
    }
    const q = qs[i];
    root.appendChild(h('div', { class: 'fade-in' },
      h('span', { class: 'eyebrow' }, `Question ${i + 1} of ${qs.length}`),
      h('p', { class: 'q', id: 'demo-q' }, q.q),
      h('div', { class: 'emoji-scale', role: 'radiogroup', 'aria-labelledby': 'demo-q' },
        q.opts.map((o, k) => h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': o, onclick: (e) => { e.currentTarget.setAttribute('aria-checked', 'true'); vals.push(k + 1); setTimeout(() => { i++; draw(); }, 260); } },
          h('span', { class: 'em', 'aria-hidden': 'true' }, q.emoji[k]), h('span', null, o))))));
  }
  draw();
  return root;
}

const INSIGHTS = [
  { tag: 'Sample insight', text: 'You’ve reported lower relaxation on days with heavier workloads.', dim: 'relaxation', data: [52, 48, 55, 40, 38, 52, 58, 44, 36, 50, 47, 56] },
  { tag: 'Sample insight', text: 'Your energy has felt steadier over the past two weeks than before.', dim: 'energy', data: [40, 44, 42, 50, 53, 51, 58, 60, 57, 62, 64, 63] },
  { tag: 'Sample insight', text: 'On nights you reported screens late, you’ve rated your sleep a little lower.', dim: 'sleep', data: [70, 55, 68, 52, 72, 50, 66, 54, 70, 49, 67, 53] },
];
const ROUTINES = [
  ['Evening Wind-Down', '10 min', 'A slow, screen-light sequence to close the day.'],
  ['Morning Reset', '8 min', 'Gentle movement and a quiet intention before the day begins.'],
  ['Workday Reset', '5 min', 'A short pause between tasks to breathe and refocus.'],
  ['Weekend Recovery', '20 min', 'An unhurried routine to restore after a busy week.'],
];
const FAQS = [
  ['Is SVARA a medical service?', 'No. SVARA is a wellness tool. It helps you notice and understand your own reported patterns. It doesn’t diagnose, treat or prescribe, and it isn’t a substitute for a qualified clinician.'],
  ['Is the guide an AI doctor?', 'No. The guide helps you reflect on what you’ve reported, explains your charts and points to educational content. It won’t diagnose, recommend medication or dosing, and it nudges you toward a clinician for health questions.'],
  ['What happens to my data?', 'You choose what to share. Your check-ins stay in your account, you can export or delete everything from My Privacy, and nothing is shared with a clinician unless you explicitly say so each time.'],
  ['Can a clinician see my information?', 'Only if you request a review and consent. You pick the time range, can add your own questions, and can revoke access whenever you like. The clinician keeps full authority over any professional view.'],
  ['Are the products real?', 'No. Anything labelled “DEMO — NOT FOR SALE” is a demonstration entry used to show how a regulated catalogue could work. Nothing can be purchased in this preview.'],
  ['Is there a single health score?', 'No. SVARA shows separate dimensions such as sleep, energy and focus. A single number can hide more than it reveals, so your rhythm is shown as a picture, not a grade.'],
  ['How long does the first check take?', 'About a minute: one question at a time, ten in total. After that, daily check-ins are one to three questions, and you set how often.'],
];

function landing() {
  track('landing_view');
  const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-title' },
    wavesBg(),
    h('div', { class: 'container hero-grid' },
      h('div', { class: 'fade-in' },
        h('span', { class: 'eyebrow' }, 'Personal wellness intelligence'),
        h('h1', { class: 'h1', id: 'hero-title' }, 'Your inner rhythm, understood.'),
        h('p', { class: 'lead' }, 'Small check-ins. Meaningful patterns. A clearer picture of how you’re doing.'),
        h('p', { class: 'support' }, 'SVARA helps you understand your everyday wellbeing through simple check-ins, personal patterns and thoughtful guidance.'),
        h('div', { class: 'hero-actions' },
          h('a', { class: 'btn btn-primary btn-lg', href: '/check' }, 'Discover My Rhythm', icon('arrow')),
          h('a', { class: 'btn btn-lg', href: '#how' }, 'How Svara Works')),
        h('p', { style: { marginTop: '18px' } }, h('a', { class: 'row', style: { display: 'inline-flex', gap: '6px', textDecoration: 'none', fontWeight: 550 }, href: '/explore' }, 'Explore Svara with a demo profile', icon('arrow', { size: 16 })))),
      h('div', { class: 'hero-art fade-in', style: { animationDelay: '.15s' } }, h('div', { class: 'halo' }),
        rhythmRings(SAMPLE, { size: 380 }))));

  const how = h('section', { class: 'section', id: 'how' }, h('div', { class: 'container' },
    sectionHead('How Svara works', 'Three gentle steps.', 'No long forms or complicated dashboards. Just a calm way to notice what you already feel.', true),
    h('div', { class: 'steps' },
      [['1', 'Check in', 'One question at a time, in about a minute. Choose how often, and how many.', 'check'],
        ['2', 'See your patterns', 'Over days and weeks, your rhythm takes shape: what’s steady, what shifts, what seems connected.', 'trend'],
        ['3', 'Reflect with guidance', 'Thoughtful, non-clinical suggestions and short routines, grounded in what you reported.', 'sparkle']]
        .map(([n, t, d, ic], k) => h('div', { class: 'card step hover reveal', style: { transitionDelay: k * 90 + 'ms' } }, h('div', { class: 'num' }, n), h('h3', { class: 'h3' }, t), h('p', { class: 'muted', style: { marginBottom: 0 } }, d))))));

  const dimRows = PRIMARY.map((d, i) => {
    const num = h('span', { class: 'v' }, '0');
    const row = h('div', { class: 'dim-row' }, dimIcon(d.key), h('span', null, d.label), num, bar(SAMPLE[d.key], { label: d.label }));
    row._num = num; row._v = SAMPLE[d.key];
    return row;
  });
  const rhythmSec = h('section', { class: 'section section-tint', id: 'rhythm' }, h('div', { class: 'container split' },
    h('div', { class: 'reveal' }, h('span', { class: 'eyebrow' }, 'Your rhythm'), h('h2', { class: 'h2' }, 'Not one number. A whole picture.'),
      h('p', { class: 'lead' }, 'Sleep, energy, mood, relaxation, motivation, focus, recovery and connection each have their own line. Together they form your rhythm: unique, changing, yours.'),
      h('p', { class: 'muted' }, 'The example on the right is illustrative sample data, not a real person.'),
      h('div', { style: { marginTop: '28px', maxWidth: '260px' } }, rhythmRings(SAMPLE, { size: 260 }))),
    h('div', { class: 'reveal' }, h('div', { class: 'dim-list' }, dimRows))));
  // count-up when revealed
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { dimRows.forEach((r) => countUp(r._num, r._v)); io.disconnect(); } }), { threshold: 0.3 });
    requestAnimationFrame(() => io.observe(rhythmSec));
  } else dimRows.forEach((r) => { r._num.textContent = r._v; });

  const demo = h('section', { class: 'section', id: 'demo' }, h('div', { class: 'container' },
    sectionHead('One question at a time', 'Try it. It takes ten seconds.', 'This is how every check-in feels: a single, simple question. Nothing is stored in this demo.', true),
    h('div', { class: 'reveal' }, miniCheckin())));

  const insights = h('section', { class: 'section section-tint', id: 'insights' }, h('div', { class: 'container' },
    sectionHead('Personal insights', 'Patterns in your own words.', 'SVARA notices what you’ve reported and describes it plainly: observations, never conclusions.', true),
    h('div', { class: 'grid-3' }, INSIGHTS.map((s, k) => h('div', { class: 'card insight hover reveal', style: { transitionDelay: k * 90 + 'ms' } },
      h('span', { class: 'tag' }, s.tag), h('p', null, s.text), h('div', null, sparkline(s.data, { w: 240, h: 48, color: dimColor(k * 2) }))))),
    h('p', { class: 'help center', style: { marginTop: '20px' } }, 'Illustrative examples only.')));

  const routines = h('section', { class: 'section', id: 'routines' }, h('div', { class: 'container' },
    sectionHead('Wellness routines', 'Small rituals, thoughtfully shaped.', 'Short, calm routines you can try when they fit. No streaks, no pressure.', true),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' } }, ROUTINES.map(([n, d, t], k) => h('div', { class: 'card routine-card hover reveal', style: { transitionDelay: k * 80 + 'ms' } },
      icon(['wave', 'sun', 'clock', 'moon'][k], { size: 26 }), h('h3', { class: 'h3', style: { marginTop: '14px' } }, n), h('p', { class: 'dur' }, d), h('p', { class: 'muted', style: { marginBottom: 0 } }, t))))));

  const pro = h('section', { class: 'section section-tint', id: 'guidance' }, h('div', { class: 'container split' },
    h('div', { class: 'reveal' }, h('span', { class: 'eyebrow' }, 'Professional guidance'), h('h2', { class: 'h2' }, 'A clinician, when you want one.'),
      h('p', { class: 'lead' }, 'If you’d like a professional perspective, you can optionally share a summary of your reported rhythm with a qualified clinician. You choose the range, you add your questions, and you can revoke access at any time.'),
      h('p', { class: 'muted' }, 'The clinician keeps full authority. SVARA never replaces their judgement, and never tells you what to take.')),
    h('div', { class: 'card pad-lg reveal' }, h('div', { class: 'stack' },
      ...[['Optional', 'Nothing is shared unless you ask.'], ['Consent each time', 'You approve every report, with the range you choose.'], ['Revocable', 'Withdraw access whenever you like.'], ['Clinician-led', 'Clinical decisions stay with the clinician.']]
        .map(([t, d]) => h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } }, h('span', { class: 'pill' }, icon('check', { size: 14 })), h('div', null, h('b', null, t), h('div', { class: 'muted' }, d))))))));

  const privacy = h('section', { class: 'section', id: 'privacy' }, h('div', { class: 'container' },
    sectionHead('Privacy', 'Your rhythm stays yours.', 'Plain-language privacy, with controls you can actually find.', true),
    h('div', { class: 'pillars four' }, [['lock', 'You hold the keys', 'Export or delete your data any time from My Privacy.'], ['eye', 'See who looked', 'An access history shows when and by which role your information was viewed.'], ['shield', 'Consent that’s specific', 'AI guidance, analytics and clinician sharing are separate, switchable choices.'], ['user', 'Share a snapshot safely', 'Share cards show four aggregate numbers, never your name or answers.']]
      .map(([ic, t, d]) => h('div', { class: 'pillar reveal' }, icon(ic), h('h3', null, t), h('p', null, d))))));

  const transparency = h('section', { class: 'section isnt', id: 'transparency' }, h('div', { class: 'container' },
    sectionHead('Transparency', 'What SVARA is, and isn’t.', null, true),
    h('div', { class: 'grid-2' },
      h('div', { class: 'card reveal' }, h('h3', { class: 'h3' }, 'SVARA is'), h('ul', { class: 'list' }, ['A way to notice your own reported patterns', 'Calm, observational language', 'A guide to educational content and short routines', 'A bridge to a clinician, only if you choose'].map((t) => h('li', null, t)))),
      h('div', { class: 'card reveal' }, h('h3', { class: 'h3' }, 'SVARA is not'), h('ul', { class: 'list' }, ['An AI doctor', 'A source of diagnosis or prescriptions', 'A replacement for professional care', 'A shop: demo products are labelled DEMO — NOT FOR SALE'].map((t) => h('li', null, t))))),
    h('div', { class: 'center', style: { marginTop: '28px' } }, h('a', { class: 'btn', href: '/products' }, 'See the demo catalogue'))));

  const faq = h('section', { class: 'section', id: 'faq' }, h('div', { class: 'container' },
    sectionHead('FAQ', 'Honest answers.', null, true),
    h('div', { class: 'faq reveal' }, FAQS.map(([q, a]) => h('details', null, h('summary', null, q), h('div', { class: 'ans' }, a))))));

  const final = h('section', { class: 'final-cta' }, h('div', { class: 'container' }, h('div', { class: 'card-soft reveal' },
    h('h2', { class: 'h2' }, 'You already have an inner rhythm.'),
    h('p', { class: 'lead', style: { maxWidth: '30em', margin: '0 auto 28px' } }, 'Svara helps you hear it. Take a one-minute check and see what your own responses reveal.'),
    h('a', { class: 'btn btn-primary btn-lg', href: '/check' }, 'Discover My Rhythm', icon('arrow')))));

  return h('div', null, hero, how, rhythmSec, demo, insights, routines, pro, privacy, transparency, faq, final);
}

/* ======================= CHECK ======================= */
const EMOJI = ['😞', '🙁', '😐', '🙂', '😄'];

function inputFor(q, current, onPick, labelId) {
  const opts = q.options && q.options.length ? q.options : ['1', '2', '3', '4', '5'];
  const group = (cls, build) => {
    const g = h('div', { class: cls, role: 'radiogroup', 'aria-labelledby': labelId });
    const btns = opts.map((o, i) => build(o, i + 1, i));
    btns.forEach((b, i) => {
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(current === i + 1));
      b.setAttribute('tabindex', current ? (current === i + 1 ? '0' : '-1') : (i === 0 ? '0' : '-1'));
      b.addEventListener('click', () => onPick(i + 1));
      b.addEventListener('keydown', (e) => {
        let n = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % btns.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + btns.length) % btns.length;
        if (n != null) { e.preventDefault(); btns.forEach((x, k) => x.setAttribute('tabindex', k === n ? '0' : '-1')); btns[n].focus(); }
      });
      g.appendChild(b);
    });
    return g;
  };
  switch (q.response_type) {
    case 'emoji': return group('emoji-scale', (o, v, i) => h('button', { type: 'button', 'aria-label': `${v}: ${o}` }, h('span', { class: 'em', 'aria-hidden': 'true' }, EMOJI[i]), h('span', null, o)));
    case 'choice': return group('choice-list', (o) => h('button', { type: 'button', class: 'choice-card' }, h('span', { class: 'dot' }), h('span', null, o)));
    case 'slider': {
      let touched = !!current;
      const label = h('div', { class: 'slider-val', 'aria-live': 'polite' }, current ? opts[current - 1] : 'Slide to choose');
      const input = h('input', { type: 'range', class: 'slider', min: 1, max: 5, step: 1, value: current || 3, 'aria-labelledby': labelId, 'aria-valuetext': current ? opts[current - 1] : 'not chosen' });
      const upd = () => { touched = true; label.textContent = opts[input.value - 1]; input.setAttribute('aria-valuetext', opts[input.value - 1]); };
      input.addEventListener('input', upd);
      const wrapEl = h('div', { class: 'slider-wrap' }, label, input, h('div', { class: 'slider-ends' }, h('span', null, opts[0]), h('span', null, opts[4])));
      wrapEl._commit = () => { if (!touched) upd(); return Number(input.value); };
      return wrapEl;
    }
    default: return group('scale', (o, v) => h('button', { type: 'button', 'aria-label': `${v}: ${o}` }, h('b', null, String(v)), h('span', null, o)));
  }
}

async function checkPage() {
  const wrapEl = h('div', { class: 'narrow check-wrap' });
  let questions;
  try { questions = (await api('GET', '/api/assessment/questions')).questions || []; }
  catch (e) { return wrap(errorBox(e)); }
  if (!questions.length) return wrap(emptyState('No questions available', 'Please try again shortly.'));
  const answers = {};
  let idx = -1, busy = false, startedTracked = false;

  const intro = () => {
    clear(wrapEl);
    wrapEl.appendChild(h('div', { class: 'q-screen' },
      h('span', { class: 'eyebrow' }, 'About a minute'),
      h('h1', { class: 'h1', style: { fontSize: 'clamp(2rem,6vw,3.2rem)' } }, 'Let’s discover your current rhythm.'),
      h('p', { class: 'lead' }, `${questions.length} short questions, one at a time. There are no right answers. Just notice how things feel lately.`),
      h('div', { class: 'row', style: { marginTop: '16px' } },
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => { idx = 0; if (!startedTracked) { startedTracked = true; track('wellness_check_started'); } show(); } }, 'Begin', icon('arrow'))),
      h('p', { class: 'help' }, 'Your answers aren’t saved to an account unless you choose to create one.')));
  };

  async function finish() {
    if (busy) return; busy = true;
    clear(wrapEl); wrapEl.appendChild(loading('Reading your rhythm…'));
    const payload = questions.map((q) => ({ question_id: q.id, value: answers[q.id] }));
    try {
      const res = await api('POST', '/api/assessment/score', { answers: payload });
      writeAssessment({ answers: payload, scores: res.scores });
      track('wellness_check_completed');
      navigate('/snapshot');
    } catch (e) { busy = false; clear(wrapEl); wrapEl.appendChild(errorBox(e)); wrapEl.appendChild(h('div', { class: 'row center', style: { marginTop: '16px' } }, h('button', { class: 'btn', type: 'button', onclick: () => { idx = questions.length - 1; show(); } }, 'Go back'))); }
  }

  function show() {
    clear(wrapEl);
    const q = questions[idx];
    const labelId = 'q-label';
    const pct = (idx / questions.length) * 100;
    const next = () => { if (idx >= questions.length - 1) finish(); else { idx++; show(); } };
    const pick = (v) => { answers[q.id] = v; if (q.response_type === 'slider') return; show.sel = v; wrapEl.querySelectorAll('[role=radio]').forEach((b, i) => b.setAttribute('aria-checked', String(i + 1 === v))); setTimeout(next, 320); };
    const input = inputFor(q, answers[q.id], pick, labelId);
    const nav = h('div', { class: 'q-nav' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { if (idx === 0) { idx = -1; intro(); } else { idx--; show(); } } }, icon('back'), 'Back'),
      q.response_type === 'slider' || answers[q.id] ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { if (input._commit) answers[q.id] = input._commit(); next(); } }, idx === questions.length - 1 ? 'See my snapshot' : 'Continue', icon('arrow')) : h('span'));
    wrapEl.appendChild(h('div', null,
      h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('span', { class: 'muted', style: { fontSize: '.85rem' } }, `${idx + 1} of ${questions.length}`), h('span', { class: 'muted', style: { fontSize: '.85rem' } }, 'About a minute')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': questions.length, 'aria-valuenow': idx, 'aria-label': 'Progress' }, h('i', { style: { width: pct + '%' } }))));
    wrapEl.appendChild(h('div', { class: 'q-screen', key: idx },
      h('div', { class: 'q-dim' }, dimIcon(q.dimension), dimLabel(q.dimension)),
      h('h1', { class: 'q-text', id: labelId }, q.question),
      input, nav,
      h('p', { class: 'kbd-hint hide-sm' }, 'Tip: press 1–5 to answer, arrow keys to move.')));
    requestAnimationFrame(() => { const f = wrapEl.querySelector('[aria-checked="true"], [role=radio], input'); const t = wrapEl.querySelector('.q-text'); if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } void f; const bar = wrapEl.querySelector('.progress i'); if (bar) requestAnimationFrame(() => { bar.style.width = ((idx + 1) / questions.length) * 100 + '%'; }); });
  }

  const onKey = (e) => {
    if (!wrapEl.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (idx < 0 || busy || (e.target.matches && e.target.matches('input,textarea,select'))) return;
    const q = questions[idx];
    if (/^[1-5]$/.test(e.key) && q && q.response_type !== 'slider') { const btns = wrapEl.querySelectorAll('[role=radio]'); if (btns[Number(e.key) - 1]) btns[Number(e.key) - 1].click(); }
  };
  document.addEventListener('keydown', onKey);
  intro();
  return h('div', { class: 'container' }, wrapEl);
}

/* ======================= SNAPSHOT ======================= */
function band(v) { return v >= 75 ? 'feels strong' : v >= 50 ? 'feels fairly steady' : v >= 25 ? 'feels a little low' : 'feels low'; }

function shareCard(scores) {
  const four = [['energy', 'Energy'], ['mood', 'Mood'], ['relaxation', 'Relaxation'], ['focus', 'Focus']];
  const card = h('div', { class: 'share-card', role: 'group', 'aria-label': 'My SVARA snapshot share card' },
    h('div', { class: 'sc-brand' }, logo(28), h('span', null, 'SVARA')),
    h('h3', null, 'MY SVARA SNAPSHOT'),
    ...four.map(([k, l]) => { const v = Math.round(scores[k] ?? 0); const fill = h('i', { style: { width: '0%' } }); requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = v + '%'; })); return h('div', { class: 'sc-row' }, h('span', null, l), h('div', { class: 'sc-bar' }, fill), h('b', null, String(v))); }),
    h('p', { class: 'sc-cta' }, 'Discover your rhythm.'));
  return card;
}

async function snapshotPage() {
  const a = readAssessment();
  if (!a || !a.scores) { navigate('/check', { replace: true }); return null; }
  const scores = a.scores;
  const obsData = PRIMARY.map((d) => ({ ...d, v: scores[d.key] })).filter((d) => d.v != null);
  const hi = [...obsData].sort((x, y) => y.v - x.v)[0], lo = [...obsData].sort((x, y) => x.v - y.v)[0];

  const legend = h('div', { class: 'legend' }, PRIMARY.map((d, i) => {
    const n = h('span', { class: 'n' }, '0');
    setTimeout(() => countUp(n, scores[d.key] ?? 0), 120 + i * 60);
    return h('div', { class: 'legend-row' }, h('i', { style: { background: dimColor(i) } }), h('span', null, d.label), n);
  }));
  const shareStatus = h('div', { class: 'stack', 'aria-live': 'polite' });
  const makeLink = async (btn) => {
    btn.disabled = true;
    try {
      const body = {}; PRIMARY.forEach((d) => { body[d.key] = Math.max(0, Math.min(100, Math.round(scores[d.key] ?? 0))); });
      const r = await api('POST', '/api/snapshot/share', { scores: body });
      const full = new URL(r.url || `/s/${r.slug}`, location.origin).href;
      clear(shareStatus);
      const inp = h('input', { class: 'input', readonly: true, value: full, 'aria-label': 'Share link', onfocus: (e) => e.target.select() });
      shareStatus.appendChild(h('div', { class: 'share-link' }, inp,
        h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(full); toast('Link copied.', 'success'); } catch { inp.select(); toast('Press copy to copy the link.'); } } }, icon('copy'), 'Copy')));
      if (navigator.share) shareStatus.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ title: 'My SVARA Snapshot', text: 'Discover your rhythm.', url: full }).catch(() => {}) }, icon('share'), 'Share…'));
      shareStatus.appendChild(h('p', { class: 'help' }, 'The link shows only four aggregate numbers. No name, no answers.'));
      btn.remove();
    } catch (e) { btn.disabled = false; toast(e.message, 'error'); }
  };
  const mkBtn = h('button', { class: 'btn', type: 'button', onclick: (e) => makeLink(e.currentTarget) }, icon('link'), 'Create share link');

  return wrap(h('div', { class: 'snap-head fade-in' },
    h('span', { class: 'eyebrow' }, 'Your Svara snapshot'),
    h('h1', { class: 'h1', style: { fontSize: 'clamp(2rem,5vw,3.4rem)' } }, 'YOUR SVARA SNAPSHOT'),
    h('p', { class: 'lead', style: { maxWidth: '34em', margin: '0 auto' } }, 'A first picture of how you’ve been feeling lately, across eight areas of everyday wellbeing.')),
    h('div', { class: 'snap-grid' },
      h('div', { class: 'card pad-lg center' }, h('div', { class: 'rings-wrap' }, rhythmRings(scores, { size: 300 })), h('div', { style: { marginTop: '24px' } }, legend)),
      h('div', { class: 'card pad-lg center' }, h('div', { class: 'rings-wrap' }, radar(scores, { size: 340 })),
        h('div', { class: 'stack', style: { marginTop: '12px', textAlign: 'left' } }, hi && lo && hi.key !== lo.key ? [
          h('p', { style: { margin: 0 } }, h('b', null, 'Highest reported: '), `${hi.label} (${Math.round(hi.v)})`),
          h('p', { style: { margin: 0 } }, h('b', null, 'Lowest reported: '), `${lo.label} (${Math.round(lo.v)})`)] : null))),
    h('div', { class: 'stack stack-lg', style: { marginTop: '36px' } },
      h('h2', { class: 'h2' }, 'What you reported'),
      h('div', { class: 'obs-list' }, obsData.map((d) => h('div', { class: 'obs' }, dimIcon(d.key),
        h('div', null, h('b', null, d.label), h('span', null, `You’ve reported that ${d.label.toLowerCase()} ${band(d.v)} right now.${d === hi && hi.key !== lo.key ? ' It’s the area you rated highest.' : d === lo && hi.key !== lo.key ? ' It’s the area you rated lowest.' : ''}`))))),
      h('div', { class: 'callout' }, 'Your snapshot reflects your responses. It is not a medical diagnosis.')),
    h('div', { class: 'card-soft center', style: { marginTop: '36px' } },
      h('h2', { class: 'h2' }, 'Keep your rhythm.'),
      h('p', { class: 'lead', style: { maxWidth: '30em', margin: '0 auto 22px' } }, 'Save your snapshot to see how it changes over time, with gentle daily check-ins.'),
      h('a', { class: 'btn btn-primary btn-lg', href: '/signup' }, 'Save My Snapshot', icon('arrow'))),
    h('div', { class: 'split', style: { marginTop: '56px' } },
      h('div', { class: 'stack' }, h('span', { class: 'eyebrow' }, 'Share'), h('h2', { class: 'h2' }, 'A card you can share.'),
        h('p', { class: 'muted' }, 'Only four aggregate numbers appear on the card: Energy, Mood, Relaxation and Focus.'), mkBtn, shareStatus),
      shareCard(scores)),
    disclaimer());
}

/* ======================= SHARE PAGE ======================= */
async function sharePage({ params }) {
  let r;
  try { r = await api('GET', `/api/snapshot/${encodeURIComponent(params.slug)}`); }
  catch (e) { return wrap(e.status === 404 ? emptyState('This snapshot isn’t available', 'The link may be mistyped or no longer active.', { href: '/check', label: 'Discover My Rhythm' }) : errorBox(e)); }
  return wrap(h('div', { class: 'narrow stack stack-lg center fade-in' },
    h('span', { class: 'eyebrow' }, 'Shared snapshot'),
    h('h1', { class: 'h2' }, 'Someone shared their rhythm.'),
    shareCard(r.scores || {}),
    h('p', { class: 'muted' }, 'Four aggregate numbers, shared by choice. It is not a medical assessment.'),
    h('a', { class: 'btn btn-primary btn-lg', href: '/check' }, 'Discover your rhythm', icon('arrow')),
    disclaimer()));
}

/* ======================= AUTH ======================= */
function strength(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 16) s++;
  return pw ? Math.max(1, s) : 0;
}
function field(label, input, id, err) {
  return h('div', { class: 'field' }, h('label', { class: 'label', for: id }, label), input, h('div', { class: 'field-error', id: id + '-err', role: 'alert' }, err || ''));
}
function showFieldErrors(form, e) {
  form.querySelectorAll('.field-error').forEach((x) => { x.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
  const f = e.fields || {};
  for (const [k, msg] of Object.entries(f)) {
    const i = form.querySelector(`[name="${k}"]`); const out = form.querySelector(`#${i ? i.id : k}-err`);
    if (i) i.setAttribute('aria-invalid', 'true');
    if (out) out.textContent = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(' ') : 'Please check this field.';
  }
}
function providerButtons(login) {
  const p = (state.config && state.config.authProviders) || {};
  return h('div', null,
    h('div', { class: 'divider' }, 'or'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn', type: 'button', disabled: !p.google, style: { width: '100%' }, 'aria-disabled': p.google ? null : 'true' }, 'Continue with Google', p.google ? null : h('span', { class: 'pill earth' }, 'Coming soon')),
      h('button', { class: 'btn', type: 'button', disabled: !p.magic_link, style: { width: '100%' } }, 'Email me a magic link', p.magic_link ? null : h('span', { class: 'pill earth' }, 'Coming soon'))));
}

function signupPage({ query }) {
  if (state.user) { navigate(roleHome(state.user.role), { replace: true }); return null; }
  const a = readAssessment();
  const email = h('input', { class: 'input', id: 'su-email', name: 'email', type: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com' });
  const name = h('input', { class: 'input', id: 'su-name', name: 'name', type: 'text', autocomplete: 'given-name', placeholder: 'What should we call you? (optional)' });
  const pw = h('input', { class: 'input', id: 'su-pw', name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: 10, 'aria-describedby': 'su-pw-help' });
  const meter = h('div', { class: 'strength', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  const hint = h('div', { class: 'help', id: 'su-pw-help' }, 'At least 10 characters. A mix of upper and lower case, a number and a symbol makes it stronger.');
  pw.addEventListener('input', () => { meter.className = 'strength s' + strength(pw.value); const s = strength(pw.value); hint.textContent = !pw.value ? 'At least 10 characters. A mix of upper and lower case, a number and a symbol makes it stronger.' : ['', 'Getting started. Try a longer password.', 'Okay. Add a number or symbol.', 'Good.', 'Strong.'][s] + (pw.value.length < 10 ? ' (10+ characters needed)' : ''); });
  const terms = h('input', { type: 'checkbox', name: 'terms', id: 'su-terms', required: true });
  const priv = h('input', { type: 'checkbox', name: 'privacy', id: 'su-priv', required: true });
  const btn = h('button', { class: 'btn btn-primary btn-lg', type: 'submit', style: { width: '100%' } }, 'Create my account');
  const formErr = h('div', { class: 'field-error', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); formErr.textContent = '';
    if (!email.value || !pw.value) { formErr.textContent = 'Please enter your email and a password.'; return; }
    if (pw.value.length < 10) { formErr.textContent = 'Your password needs at least 10 characters.'; return; }
    if (!terms.checked || !priv.checked) { formErr.textContent = 'Please accept the Terms and the Privacy Policy to continue.'; return; }
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const body = { email: email.value.trim(), password: pw.value, consents: { terms: true, privacy: true } };
      if (name.value.trim()) body.name = name.value.trim();
      if (a && a.answers) body.assessment = { answers: a.answers };
      const r = await api('POST', '/api/auth/signup', body);
      setSession(r); await refreshMe(); clearAssessment();
      toast('Welcome to SVARA.', 'success');
      navigate('/onboarding');
    } catch (err) { btn.disabled = false; btn.textContent = 'Create my account'; showFieldErrors(form, err); formErr.textContent = err.fields ? '' : err.message; }
  } },
    field('Email', email, 'su-email'), field('First name', name, 'su-name'), field('Password', pw, 'su-pw'), meter, hint,
    h('div', { class: 'stack', style: { margin: '20px 0' } },
      h('label', { class: 'check', for: 'su-terms' }, terms, h('span', null, 'I agree to the Terms of Use.')),
      h('label', { class: 'check', for: 'su-priv' }, priv, h('span', null, 'I have read the Privacy Policy and understand how my information is used.'))),
    formErr, btn);
  void query;
  return h('div', { class: 'auth-wrap fade-in' },
    h('span', { class: 'eyebrow' }, 'Create your account'),
    h('h1', { class: 'h2' }, 'Keep your rhythm.'),
    a ? h('div', { class: 'callout', style: { margin: '14px 0 22px' } }, 'Your snapshot is ready to be attached to your new account.') : h('p', { class: 'muted' }, 'A calm place to check in and notice your patterns.'),
    form, providerButtons(),
    h('p', { class: 'center muted', style: { marginTop: '24px' } }, 'Already have an account? ', h('a', { href: '/login' }, 'Log in')),
    disclaimer());
}

function loginPage({ query }) {
  if (state.user) { navigate(safeNext(query.next) || roleHome(state.user.role), { replace: true }); return null; }
  const email = h('input', { class: 'input', id: 'li-email', name: 'email', type: 'email', autocomplete: 'email', required: true });
  const pw = h('input', { class: 'input', id: 'li-pw', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn btn-primary btn-lg', type: 'submit', style: { width: '100%' } }, 'Log in');
  const formErr = h('div', { class: 'field-error', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); formErr.textContent = '';
    if (!email.value || !pw.value) { formErr.textContent = 'Please enter your email and password.'; return; }
    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const r = await api('POST', '/api/auth/login', { email: email.value.trim(), password: pw.value });
      setSession(r); await refreshMe();
      navigate(safeNext(query.next) || roleHome(state.user.role));
    } catch (err) { btn.disabled = false; btn.textContent = 'Log in'; formErr.textContent = err.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : err.status === 401 || err.status === 400 ? 'That email and password don’t match.' : err.message; }
  } }, field('Email', email, 'li-email'), field('Password', pw, 'li-pw'), formErr, btn);
  return h('div', { class: 'auth-wrap fade-in' },
    h('span', { class: 'eyebrow' }, 'Welcome back'), h('h1', { class: 'h2' }, 'Log in to SVARA'), form, providerButtons(true),
    h('p', { class: 'center muted', style: { marginTop: '24px' } }, 'New here? ', h('a', { href: '/signup' }, 'Create an account'), ' or ', h('a', { href: '/explore' }, 'explore the demo'), '.'),
    state.config && state.config.demoMode ? h('div', { class: 'card-soft center', style: { marginTop: '20px' } }, h('p', { style: { margin: '0 0 12px' } }, 'Just looking around?'), h('a', { class: 'btn', href: '/explore' }, 'Explore Svara')) : null);
}

/* ======================= EXPLORE ======================= */
async function explorePage() {
  let personas = [];
  try { const r = await api('GET', '/api/demo/personas'); personas = Array.isArray(r) ? r : r.personas || []; } catch (e) { return wrap(errorBox(e)); }
  if (!personas.some((p) => p.persona === 'clinician')) personas = [...personas, { persona: 'clinician', name: 'Dr. Demo Clinician', blurb: 'See the clinician portal: review a shared report, add notes and set next steps.' }];
  const cards = personas.map((p) => {
    const btn = h('button', { class: 'card persona hover', type: 'button', onclick: async () => {
      btn.disabled = true;
      try { const r = await api('POST', '/api/demo/start', { persona: p.persona }); setSession(r); await refreshMe(); toast(`Exploring as ${p.name}`); navigate(roleHome(state.user.role)); }
      catch (e) { btn.disabled = false; toast(e.message, 'error'); }
    } },
      h('div', { class: 'row between' }, h('div', { class: 'av' }, p.persona === 'clinician' ? 'Dr' : p.persona), demoBadgeSmall()),
      h('h3', { class: 'h3', style: { margin: 0 } }, p.name), h('p', { class: 'muted', style: { margin: 0 } }, p.blurb),
      h('span', { class: 'row', style: { color: 'var(--accent-deep)', fontWeight: 600 } }, p.persona === 'clinician' ? 'Open clinician portal' : 'Explore this rhythm', icon('arrow', { size: 16 })));
    return btn;
  });
  return wrap(h('div', { class: 'stack stack-lg fade-in' },
    h('div', { class: 'section-head' }, h('span', { class: 'eyebrow' }, 'Demo mode'), h('h1', { class: 'h1', style: { fontSize: 'clamp(2rem,5vw,3.2rem)' } }, 'Explore Svara'),
      h('p', { class: 'lead' }, 'Step into a ready-made rhythm and see how SVARA feels after weeks of check-ins. No sign-up needed.')),
    h('div', { class: 'callout' }, h('b', null, 'Synthetic demo data. '), 'These people don’t exist. Every number, pattern and report is generated for demonstration and is not medical information.'),
    h('div', { class: 'grid-2' }, cards),
    h('div', { class: 'card-soft row between' }, h('div', null, h('b', null, 'Curious about the product catalogue?'), h('div', { class: 'muted' }, 'A demonstration of how regulated products could be presented. Nothing is for sale.')), h('a', { class: 'btn', href: '/products' }, 'Demo product catalogue')),
    disclaimer()));
}
function demoBadgeSmall() { return h('span', { class: 'pill earth' }, 'Synthetic demo data'); }

/* ======================= LEARN ======================= */
async function learnPage({ query }) {
  const cat = query.category || '';
  const root = h('div', { class: 'stack stack-lg' });
  let r;
  try { r = await api('GET', '/api/content' + (cat ? `?category=${encodeURIComponent(cat)}` : '')); } catch (e) { return wrap(errorBox(e)); }
  const cats = r.categories || [];
  const chips = h('div', { class: 'row', role: 'group', 'aria-label': 'Filter by category' },
    h('a', { class: 'chip' + (!cat ? ' active' : ''), href: '/learn', 'aria-current': !cat ? 'true' : null, style: { textDecoration: 'none' } }, 'All'),
    cats.map((c) => { const key = typeof c === 'string' ? c : c.key || c.slug || c.name; const label = typeof c === 'string' ? prettyCat(c) : c.label || prettyCat(key); return h('a', { class: 'chip' + (cat === key ? ' active' : ''), href: `/learn?category=${encodeURIComponent(key)}`, 'aria-current': cat === key ? 'true' : null, style: { textDecoration: 'none' } }, label); }));
  root.appendChild(h('div', { class: 'section-head' }, h('span', { class: 'eyebrow' }, 'Learn'), h('h1', { class: 'h1', style: { fontSize: 'clamp(2rem,5vw,3.2rem)' } }, 'Calm, clear reading.'), h('p', { class: 'lead' }, 'Plain-language articles about everyday wellbeing. Educational, never diagnostic.')));
  root.appendChild(chips);
  root.appendChild(r.articles && r.articles.length
    ? h('div', { class: 'grid-3' }, r.articles.map((a) => h('a', { class: 'card hover article-card', href: `/learn/${a.slug}` }, h('span', { class: 'pill' }, prettyCat(a.category)), h('h3', { class: 'h3', style: { margin: 0 } }, a.title), h('p', { class: 'muted', style: { margin: 0, flex: 1 } }, a.summary), h('div', { class: 'meta' }, h('span', null, `${a.read_minutes || 3} min read`)))))
    : emptyState('Nothing here yet', 'Try another category.'));
  root.appendChild(disclaimer());
  return wrap(root);
}

async function articlePage({ params }) {
  let r;
  try { r = await api('GET', `/api/content/${encodeURIComponent(params.slug)}`); }
  catch (e) { return wrap(e.status === 404 ? emptyState('Article not found', 'It may have been unpublished.', { href: '/learn', label: 'Back to Learn' }) : errorBox(e)); }
  const a = r.article;
  document.title = `${a.title} — SVARA`;
  return wrap(h('article', { class: 'article stack stack-lg fade-in' },
    h('a', { href: '/learn', class: 'row muted', style: { textDecoration: 'none' } }, icon('back', { size: 16 }), 'Learn'),
    h('div', null, h('span', { class: 'pill' }, prettyCat(a.category)), h('h1', { style: { marginTop: '14px' } }, a.title),
      a.summary ? h('p', { class: 'lead' }, a.summary) : null, h('p', { class: 'muted' }, `${a.read_minutes || 3} min read`)),
    markdown(a.body),
    h('div', { class: 'callout' }, 'If something here raises a question about your health, please speak with a qualified clinician. This article is general education, not personal medical advice.'),
    h('p', { class: 'disclaimer' }, r.disclaimer || DISCLAIMER_TEXT),
    h('div', { class: 'card-soft center' }, h('p', { class: 'lead' }, 'Curious how this shows up in your own week?'), h('a', { class: 'btn btn-primary', href: '/check' }, 'Discover My Rhythm'))));
}

/* ======================= PRODUCTS ======================= */
async function productsPage() {
  let r;
  try { r = await api('GET', '/api/products'); } catch (e) { return wrap(errorBox(e)); }
  const items = r.products || [];
  const list = (arr) => (arr && arr.length ? h('ul', { class: 'list' }, arr.map((x) => h('li', null, x))) : h('span', { class: 'muted' }, 'None listed'));
  const seen = new Set();
  const cards = items.map((p) => {
    const card = h('div', { class: 'card product-card' },
      h('div', { class: 'row between' }, h('span', { class: 'pill' }, prettyCat(p.category)), p.badge || p.is_demo ? demoBadge(p.badge || 'DEMO — NOT FOR SALE') : null),
      h('h3', { class: 'h3', style: { margin: 0 } }, p.name),
      p.description ? h('p', { class: 'muted', style: { margin: 0 } }, p.description) : null,
      h('dl', null,
        h('div', null, h('dt', null, 'Regulatory status'), h('dd', null, [p.regulatory_category, p.regulatory_status && prettyCat(p.regulatory_status)].filter(Boolean).join(' · ') || 'Not specified', p.licence_reference ? ` · Licence ${p.licence_reference}` : '')),
        h('div', null, h('dt', null, 'Approved claims'), h('dd', null, list(p.approved_claims))),
        p.required_disclaimer ? h('div', null, h('dt', null, 'Required disclaimer'), h('dd', null, p.required_disclaimer)) : null,
        p.manufacturer ? h('div', null, h('dt', null, 'Manufacturer'), h('dd', null, p.manufacturer)) : null),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { track('purchase_intent', { product: p.name }); toast('Thanks for your interest. Purchasing isn’t available in this preview.'); } }, 'Request info'));
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { if (!seen.has(p.id)) { seen.add(p.id); track('product_viewed', { product: p.name }); } io.disconnect(); } }), { threshold: 0.5 });
      requestAnimationFrame(() => io.observe(card));
    }
    return card;
  });
  return wrap(h('div', { class: 'stack stack-lg fade-in' },
    h('div', { class: 'demo-banner', role: 'note' }, h('strong', null, 'DEMO — NOT FOR SALE'), h('span', null, r.notice || 'These entries are demonstrations only. Nothing here can be bought.')),
    h('div', { class: 'section-head' }, h('span', { class: 'eyebrow' }, 'Demo catalogue'), h('h1', { class: 'h1', style: { fontSize: 'clamp(2rem,5vw,3.2rem)' } }, 'How products could appear.'),
      h('p', { class: 'lead' }, 'This catalogue shows how regulated products could be presented, with their status, approved claims and required disclaimers displayed in plain view.')),
    h('div', { class: 'callout' }, 'In SVARA, products only appear after a path of goal, then education, then context, then an optional clinician pathway. They are never the starting point.',
      h('div', { class: 'path-flow' }, ['Goal', 'Education', 'Context', 'Optional clinician pathway', 'Product'].map((s, i, arr) => [h('span', { class: 's' }, s), i < arr.length - 1 ? icon('chevron', { size: 14 }) : null]))),
    items.length ? h('div', { class: 'grid-2' }, cards) : emptyState('No products to show', 'The catalogue is empty in this preview.'),
    disclaimer()));
}

export const routes = [
  { path: '/', role: null, title: '', render: async () => landing() },
  { path: '/check', role: null, title: 'Discover your rhythm', render: checkPage },
  { path: '/snapshot', role: null, title: 'Your snapshot', render: snapshotPage },
  { path: '/s/:slug', role: null, title: 'Shared snapshot', render: sharePage },
  { path: '/signup', role: null, title: 'Create account', render: async (c) => signupPage(c) },
  { path: '/login', role: null, title: 'Log in', render: async (c) => loginPage(c) },
  { path: '/explore', role: null, title: 'Explore Svara', render: explorePage },
  { path: '/learn', role: null, title: 'Learn', render: learnPage },
  { path: '/learn/:slug', role: null, title: 'Learn', render: articlePage },
  { path: '/products', role: null, title: 'Demo products', render: productsPage },
];
