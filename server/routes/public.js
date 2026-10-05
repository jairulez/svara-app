import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, ROOT } from '../lib/config.js';
import { all, get, insert, j, setting } from '../lib/db.js';
import { authProviders, anonId } from '../lib/auth.js';
import { httpError, reply } from '../lib/http.js';
import { S, validate } from '../lib/validate.js';
import { DIMENSIONS, scoreAssessment } from '../engine/scoring.js';
import { GOALS } from '../engine/discovery.js';
import { listDisplayableProducts, publicProduct } from '../engine/claims.js';
import { ANALYTICS_EVENTS, scrubProps, latestConsents, DISCLAIMER, asObj } from './_shared.js';
import { ipHash } from '../lib/auth.js';

const version = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } })();
const PRIMARY = () => DIMENSIONS.filter((d) => d.in_snapshot).map((d) => d.key);

export default function register(r) {
  r.get('/api/health', () => ({ status: 'ok', version, time: new Date().toISOString() }));

  r.get('/api/config', () => ({
    demoMode: config.demoMode,
    commerceEnabled: config.commerceEnabled,
    dimensions: DIMENSIONS,
    goals: GOALS.map((g) => ({ key: g.key, label: g.label, emoji: g.emoji })),
    authProviders: Object.fromEntries(Object.entries(authProviders).map(([k, v]) => [k, !!v.enabled])),
    features: {
      products_catalogue: !!setting('features.products_catalogue'),
      clinician_pathway: !!setting('features.clinician_pathway'),
      content_hub: !!setting('features.content_hub'),
      guide: !!setting('ai.guide_enabled'),
      weekly_reports: !!setting('ai.weekly_reports_enabled'),
    },
  }));

  r.get('/api/assessment/questions', () => {
    const rows = all(`SELECT q.* FROM questions q LEFT JOIN wellness_dimensions d ON d.key=q.dimension
                      WHERE q.pool='assessment' AND q.active=1 ORDER BY COALESCE(d.sort_order, 99), q.created_at`);
    return { questions: rows.map((q) => ({ id: q.id, dimension: q.dimension, question: q.question, response_type: q.response_type, options: j(q.options, []) })) };
  });

  r.post('/api/assessment/score', { bucket: 'heavy' }, ({ body }) => {
    const { answers } = validate(body, { answers: S.arr(S.obj({ question_id: S.str({ required: true, max: 64 }), value: S.int({ required: true, min: 1, max: 5 }) }), { required: true, min: 1, max: 30 }) });
    try { const res = scoreAssessment(answers); return { scores: res.scores, answered: res.answered }; }
    catch (e) { throw httpError(400, 'invalid_answers', e.message || 'Invalid answers.'); }
  });

  r.post('/api/snapshot/share', ({ body }) => {
    const { scores } = validate(body, { scores: S.json({ required: true }) });
    const keys = PRIMARY();
    const clean = {};
    for (const [k, v] of Object.entries(scores)) {
      if (!keys.includes(k)) throw httpError(400, 'validation_error', 'Only aggregate wellness dimensions can be shared.', { scores: `Unknown dimension: ${String(k).slice(0, 30)}` });
      if (!Number.isInteger(v) || v < 0 || v > 100) throw httpError(400, 'validation_error', 'Scores must be whole numbers from 0 to 100.', { scores: `${k} out of range` });
      clean[k] = v;
    }
    if (!Object.keys(clean).length) throw httpError(400, 'validation_error', 'Provide at least one score.', { scores: 'Required.' });
    const slug = crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').toLowerCase();
    insert('snapshot_shares', { slug, scores: JSON.stringify(clean) });
    return reply(201, { slug, url: `${config.publicUrl}/s/${slug}` });
  });

  r.get('/api/snapshot/:slug', ({ params }) => {
    if (!/^[a-z0-9]{6,16}$/i.test(params.slug)) throw httpError(404, 'not_found', 'Snapshot not found.');
    const s = get('SELECT scores, created_at FROM snapshot_shares WHERE slug=?', params.slug);
    if (!s) throw httpError(404, 'not_found', 'Snapshot not found.');
    return { scores: j(s.scores, {}), created_at: s.created_at };
  });

  r.post('/api/events', ({ body, user, ip }) => {
    const { name, props } = validate(body, { name: S.str({ required: true, max: 60 }), props: S.json() });
    if (!ANALYTICS_EVENTS.has(name)) throw httpError(400, 'validation_error', 'Unknown event.', { name: 'Not an allowed event.' });
    const optedOut = user && latestConsents(user.id).analytics?.granted === false;
    if (!optedOut) insert('analytics_events', { name, anon_id: anonId(user ? user.id : `ip:${ipHash(ip)}`), props: JSON.stringify(scrubProps(props)) });
    return undefined;
  });

  r.get('/api/content', () => {
    const rows = all("SELECT slug,title,category,summary,read_minutes,claim_check FROM content WHERE status='published' AND active=1 ORDER BY category, title")
      .filter((a) => asObj(a.claim_check).ok !== false);
    return {
      categories: [...new Set(rows.map((a) => a.category))],
      articles: rows.map(({ claim_check, ...a }) => a),
    };
  });
  r.get('/api/content/:slug', ({ params }) => {
    const a = get("SELECT slug,title,category,summary,body,read_minutes,claim_check,updated_at FROM content WHERE slug=? AND status='published' AND active=1", params.slug);
    if (!a || asObj(a.claim_check).ok === false) throw httpError(404, 'not_found', 'Article not found.');
    const { claim_check, ...article } = a;
    return { article, disclaimer: DISCLAIMER };
  });

  r.get('/api/routines', () => ({
    routines: all('SELECT * FROM routines WHERE active=1 ORDER BY name').map(shapeRoutine),
  }));

  r.get('/api/products', () => {
    const rows = listDisplayableProducts() || [];
    const products = rows.map((p) => (p && 'badge' in p ? p : publicProduct(p)));
    return {
      demo: !config.commerceEnabled,
      notice: config.commerceEnabled ? 'Products shown are listed for information. Speak with a qualified clinician before use.' : 'DEMO — NOT FOR SALE. These are illustrative placeholders only and cannot be purchased.',
      products,
    };
  });
}

export function shapeRoutine(r) {
  return {
    id: r.id, name: r.name, goal: r.goal, duration_min: r.duration_min,
    steps: asObj(r.steps, []), frequency: r.frequency, safety_notes: r.safety_notes,
    source_metadata: asObj(r.source_metadata, {}), dimensions: asObj(r.dimensions, []),
  };
}
