import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Never touch the real database from tests.
if (!process.env.DATABASE_PATH) process.env.DATABASE_PATH = path.join(os.tmpdir(), `svara-test-${process.pid}.db`);

const { migrate, insert, today, all } = await import('../server/lib/db.js');
const { seedReference } = await import('../server/db/seed.js');
const { classify, respondTo } = await import('../server/engine/safety.js');
const { checkText, guardOutput } = await import('../server/engine/claims.js');
const { toScore, scoreAssessment } = await import('../server/engine/scoring.js');
const { selectQuestions } = await import('../server/engine/questions.js');
const { recordCheckIn, recordContext, detectPatterns, getRhythm, baselineStatus, comparePattern } = await import('../server/engine/trends.js');
const { validate } = await import('../server/engine/schemas.js');
const { addDays } = await import('../server/engine/util.js');
const { ARTICLES } = await import('../server/db/seed-data/content.js');

before(() => { migrate(); seedReference(); });

function newUser(prefs = {}) {
  const u = insert('users', { email: `t-${crypto.randomUUID()}@test.local`, password_hash: null, role: 'USER', status: 'active', is_demo: 0, auth_provider: 'password' });
  insert('user_profiles', { user_id: u.id, name: 'Test', lifestyle: '{}', preferences: JSON.stringify({ questions_per_day: 3, max_sensitivity: 'high', ...prefs }), onboarding_completed: 1 });
  return u.id;
}

test('safety classifier: categories and highest severity wins', () => {
  assert.equal(classify('I had a lovely walk and slept okay').category, 'NORMAL_WELLNESS');
  assert.equal(classify("I can't breathe properly").category, 'EMERGENCY');
  assert.equal(classify('sudden chest pain since this morning').category, 'EMERGENCY');
  assert.equal(classify('I think I took too many pills, an overdose').category, 'EMERGENCY');
  assert.equal(classify('I want to end my life').category, 'POTENTIAL_CRISIS');
  assert.equal(classify("I don't want to be here anymore").category, 'POTENTIAL_CRISIS');
  assert.equal(classify('everything feels hopeless').category, 'POTENTIAL_CRISIS');
  assert.equal(classify('I got a rash after trying the new balm').category, 'ADVERSE_REACTION');
  assert.equal(classify('how much of this tea should I take each day?').category, 'PRODUCT_DOSAGE');
  assert.equal(classify('is 500 mg too much').category, 'PRODUCT_DOSAGE');
  assert.equal(classify('can I stop taking my medication?').category, 'MEDICATION_QUESTION');
  assert.equal(classify('will this interact with my antidepressants').category, 'MEDICATION_QUESTION');
  assert.equal(classify('do I have insomnia?').category, 'MEDICAL_QUESTION');
  assert.equal(classify('I feel hopeless and have chest pain').category, 'EMERGENCY'); // severity order
});

test('safety classifier: negation and idiom false positives', () => {
  assert.equal(classify('no chest pain today, just tired').category, 'NORMAL_WELLNESS');
  assert.equal(classify('this workload is killing me, but I am fine').category, 'NORMAL_WELLNESS');
  assert.equal(classify('How can I relax more in the evenings?').category, 'NORMAL_WELLNESS');
  assert.equal(classify('').category, 'NORMAL_WELLNESS');
});

test('safety replies: templated and appropriately worded', () => {
  assert.equal(respondTo('NORMAL_WELLNESS'), null);
  const crisis = respondTo('POTENTIAL_CRISIS').reply;
  assert.match(crisis, /local emergency number/i);
  assert.match(crisis, /14416/);
  assert.match(respondTo('MEDICATION_QUESTION').reply, /prescriber or pharmacist/i);
  assert.match(respondTo('PRODUCT_DOSAGE').reply, /labelling|doctor or pharmacist/i);
  assert.match(respondTo('MEDICAL_QUESTION').reply, /professional/i);
});

test('claim checker: blocks prohibited claims', () => {
  for (const bad of ['This tea treats insomnia.', 'A natural cure for stress', 'Guaranteed better sleep', 'Works like a painkiller', 'Prevents heart disease',
    'Clinically proven to treat anxiety', 'A miracle blend', 'Helps you get high', 'FDA approved wellness oil', 'Heals depression naturally']) {
    assert.equal(checkText(bad).ok, false, `should block: ${bad}`);
  }
  assert.equal(checkText('Part of an evening routine').ok, true);
});

test('claim checker: negation is respected', () => {
  assert.equal(checkText('This product does not treat or cure any condition.').ok, true);
  assert.equal(checkText('It is not a cure and makes no guarantee of results.').ok, true);
  assert.equal(checkText('SVARA does not diagnose.').ok, true);
  assert.equal(checkText('This tea treats insomnia. It does not cure anything else.').ok, false);
});

test('claim checker: product restricted claims and approval metadata', () => {
  const p = { restricted_claims: JSON.stringify(['Helps you fall asleep']), regulatory_status: 'DEMO_NOT_APPROVED', licence_reference: null };
  assert.equal(checkText('A tea that helps you fall asleep', { product: p }).ok, false);
  assert.equal(checkText('FDA approved', { product: p }).ok, false);
  assert.equal(checkText('FDA approved', { product: { ...p, regulatory_status: 'APPROVED', licence_reference: 'LIC-1' } }).ok, true);
  const g = guardOutput('This will cure anxiety', { fallback: 'safe' });
  assert.deepEqual([g.blocked, g.text], [true, 'safe']);
});

test('seeded articles pass the claim checker and fit the word range', () => {
  assert.ok(ARTICLES.length >= 14);
  for (const a of ARTICLES) {
    assert.equal(checkText(`${a.title}\n${a.summary}\n${a.body}`).ok, true, a.slug);
    const words = a.body.split(/\s+/).length;
    assert.ok(words >= 250 && words <= 450, `${a.slug}: ${words} words`);
  }
  for (const a of ARTICLES.filter((x) => /hemp|vijaya/i.test(x.title))) {
    assert.match(a.body, /vary|varies|differ/i, `${a.slug} mentions regulation varies`);
    assert.match(a.body, /qualified clinician/i, `${a.slug} points to a clinician`);
  }
});

test('scoring: raw 1-5 maps to 0-100 and reverse-coding inverts', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((r) => toScore(r)), [0, 25, 50, 75, 100]);
  assert.deepEqual([1, 2, 3, 4, 5].map((r) => toScore(r, true)), [100, 75, 50, 25, 0]);
  assert.throws(() => toScore(6), /1 to 5/);
  assert.throws(() => toScore(2.5));
});

test('scoreAssessment: per-dimension scores, stress reverse-coded, no composite', () => {
  const qs = all("SELECT id, dimension FROM questions WHERE pool='assessment' AND active=1");
  assert.ok(qs.length >= 10);
  assert.equal(new Set(qs.map((q) => q.dimension)).size, 10);
  const answers = qs.map((q) => ({ question_id: q.id, value: 5 }));
  const r = scoreAssessment(answers);
  assert.equal(r.answered, qs.length);
  assert.equal(r.scores.sleep, 100);
  assert.equal(r.scores.stress, 0, 'high "overloaded" answer must score low');
  assert.ok(!('overall' in r) && !('total' in r) && !('composite' in r));
  assert.throws(() => scoreAssessment([{ question_id: 'nope', value: 3 }]));
  assert.throws(() => scoreAssessment([]));
});

test('question library meets the brief', () => {
  const rows = all('SELECT * FROM questions');
  assert.ok(rows.filter((q) => q.pool === 'assessment').length >= 10);
  assert.ok(rows.filter((q) => q.pool === 'daily').length >= 40);
  for (const q of rows) {
    assert.equal(JSON.parse(q.options).length, 5, q.id);
    assert.ok(['scale5', 'slider', 'emoji', 'choice'].includes(q.response_type));
    assert.ok(q.allowed_frequency_days >= 1);
    assert.equal(checkText(q.question).ok, true);
  }
  assert.equal(rows.find((q) => q.question === 'How mentally overloaded did you feel?').reverse, 1);
  assert.ok(new Set(rows.map((q) => q.response_type)).size === 4);
});

test('selectQuestions never repeats inside allowed_frequency_days', () => {
  const uid = newUser();
  const t = today();
  const first = selectQuestions(uid, { count: 3 });
  assert.equal(first.questions.length, 3);
  assert.equal(first.reasons.length, 3);
  // answer one of them 1 day ago, and force its window
  const q = first.questions[0];
  const meta = all('SELECT allowed_frequency_days f FROM questions WHERE id=?', q.id)[0];
  recordCheckIn(uid, { question_id: q.id, raw_value: 3, kind: 'daily', day: addDays(t, -1) });
  for (let round = 0; round < 3; round++) {
    const sel = selectQuestions(uid, { count: 3 });
    assert.ok(sel.questions.every((x) => x.id !== q.id || meta.f <= 1), 'question reappeared inside its window');
  }
  // answered today → never offered again today
  const todays = selectQuestions(uid, { count: 1 }).questions[0];
  recordCheckIn(uid, { question_id: todays.id, raw_value: 4, kind: 'daily', day: t });
  assert.ok(selectQuestions(uid, { count: 3 }).questions.every((x) => x.id !== todays.id));
  // after the window passes, it is eligible again
  const old = newUser();
  recordCheckIn(old, { question_id: q.id, raw_value: 3, kind: 'daily', day: addDays(t, -meta.f) });
  const pool = selectQuestions(old, { count: 3 });
  assert.ok(pool.questions.length > 0);
});

test('selectQuestions respects max_sensitivity and only returns library questions', () => {
  const uid = newUser({ max_sensitivity: 'low', questions_per_day: 3 });
  const ids = new Set(all('SELECT id FROM questions WHERE active=1').map((r) => r.id));
  const sens = new Map(all('SELECT id, sensitivity_level s FROM questions').map((r) => [r.id, r.s]));
  const { questions } = selectQuestions(uid, { count: 3 });
  for (const q of questions) { assert.ok(ids.has(q.id)); assert.equal(sens.get(q.id), 'low'); }
});

test('recordCheckIn: baseline progression, scores roll up, sparse rhythm is safe', () => {
  const uid = newUser();
  const empty = getRhythm(uid);
  assert.equal(empty.length, 10);
  assert.ok(empty.every((d) => d.has_data === false && d.current === null && d.direction === 'steady'));
  const q = all("SELECT id FROM questions WHERE pool='daily' AND dimension='sleep' AND reverse=0 LIMIT 1")[0];
  const row = recordCheckIn(uid, { question_id: q.id, raw_value: 5, day: today() });
  assert.equal(row.kind, 'baseline');
  assert.equal(row.score, 100);
  assert.equal(baselineStatus(uid).days_completed, 1);
  const sleep = getRhythm(uid).find((d) => d.key === 'sleep');
  assert.equal(sleep.has_data, true);
  assert.equal(sleep.current, 100);
  assert.throws(() => recordCheckIn(uid, { question_id: q.id, raw_value: 9 }));
});

test('detectPatterns: needs n>=3 each side and a >=8 point gap, observational wording', () => {
  assert.equal(comparePattern([50, 50], [80, 80, 80]), null);
  assert.equal(comparePattern([70, 72, 71], [75, 76, 74]), null);
  assert.deepEqual(comparePattern([25, 25, 50], [75, 75, 75]).gap < 0, true);

  const uid = newUser();
  const relax = all("SELECT id FROM questions WHERE pool='daily' AND dimension='relaxation' AND reverse=0 LIMIT 1")[0].id;
  const t = today();
  // sparse: only 2 heavy days → no pattern
  for (let i = 1; i <= 8; i++) {
    const day = addDays(t, -i);
    const heavy = i <= 2;
    recordContext(uid, day, { workload: heavy ? 'heavy' : 'light' });
    recordCheckIn(uid, { question_id: relax, raw_value: heavy ? 1 : 4, kind: 'daily', day });
  }
  assert.equal(detectPatterns(uid).filter((p) => p.kind === 'workload').length, 0);
  // add enough heavy days
  for (let i = 9; i <= 14; i++) {
    const day = addDays(t, -i);
    const heavy = i <= 12;
    recordContext(uid, day, { workload: heavy ? 'heavy' : 'light' });
    recordCheckIn(uid, { question_id: relax, raw_value: heavy ? 1 : 4, kind: 'daily', day });
  }
  const p = detectPatterns(uid).find((x) => x.kind === 'workload' && x.dimension === 'relaxation');
  assert.ok(p, 'workload/relaxation pattern expected');
  assert.ok(p.n >= 6);
  assert.match(p.text, /^You've reported lower relaxation on days with a heavy workload/);
  assert.doesNotMatch(p.text, /because|caused|cause/i);
});

test('schema validator subset', () => {
  const schema = { type: 'object', required: ['reply'], additionalProperties: false, properties: { reply: { type: 'string', maxLength: 5 }, tags: { type: 'array', maxItems: 1, items: { type: 'string' } } } };
  assert.equal(validate(schema, { reply: 'hi' }).ok, true);
  assert.equal(validate(schema, { reply: 'too long!' }).ok, false);
  assert.equal(validate(schema, { reply: 'a', extra: 1 }).ok, false);
  assert.equal(validate(schema, {}).ok, false);
  assert.equal(validate(schema, { reply: 'a', tags: ['x', 'y'] }).ok, false);
});
