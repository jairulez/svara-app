import { validate, assertValid, S, GUIDE_LLM_SCHEMA } from './schemas.js';
import { classify, respondTo } from './safety.js';
import { checkText, guardOutput } from './claims.js';
import { getRhythm, detectPatterns } from './trends.js';
import { selectQuestions } from './questions.js';
import { generateWeeklyReport } from './reports.js';
import { buildContext, displayName, getGoalKeys } from './memory.js';
import { routineForDimension, routineForGoal, articlesForCategories } from './discovery.js';
import { GOALS, DIM_CATEGORY } from './goals.js';
import { DIMENSIONS, dimLabel } from './scoring.js';
import { completeJson, llmEnabled, GUIDE_SYSTEM } from './llm.js';
import { productEligibility } from './eligibility.js';

const lc = (s) => s.toLowerCase();
const userIdSchema = { type: 'object', required: ['userId'], properties: { userId: S.str(80) } };

// ---------- deterministic conversation generator ----------
export const INTENTS = ['clinician', 'product', 'explain', 'weekly', 'summary', 'routine', 'reflection', 'general'];

export function detectIntent(message) {
  const m = lc(message);
  if (/\b(clinician|doctor|professional|therapist|specialist|consult\w*|appointment)\b/.test(m)) return 'clinician';
  if (/\b(products?|hemp|cbd|vijaya|bhang|oil|tea|supplements?|gummy|gummies|buy|purchase|balm|herbal)\b/.test(m)) return 'product';
  if (/\b(what (does|is|do)|mean|explain|baseline|score|rhythm)\b/.test(m)) return 'explain';
  if (/\b(week|weekly)\b/.test(m)) return 'weekly';
  if (/\b(how am i|summary|summar\w*|overview|doing|lately|today)\b/.test(m)) return 'summary';
  if (/\b(routines?|wind[- ]?down|breath\w*|try|suggest\w*|habits?|tips?|ritual)\b/.test(m)) return 'routine';
  if (/\b(why|patterns?|notice\w*|reflect\w*|trends?|changes?|lower|higher)\b/.test(m)) return 'reflection';
  return 'general';
}

const DIM_WORDS = [['sleep', /sleep|rest|wake|bed/], ['energy', /energ|tired|fatigue/], ['mood', /mood/], ['relaxation', /relax|unwind|switch off/], ['motivation', /motivat|drive/],
  ['focus', /focus|concentrat|distract/], ['recovery', /recover/], ['social_connection', /social|connect|lonely|people/], ['stress', /stress|overload|overwhelm|pressure/], ['overall_wellbeing', /overall|wellbeing|satisf/]];
export const mentionedDimension = (message) => DIM_WORDS.find(([, re]) => re.test(lc(message)))?.[0] || null;

const SUGGEST = {
  general: ['Summarise how I\'m doing', 'Suggest a routine to try', 'Explain my baseline'],
  summary: ['What patterns do you notice?', 'Suggest a routine to try', 'Prepare questions for a clinician'],
  explain: ['Summarise how I\'m doing', 'What patterns do you notice?', 'Suggest a routine to try'],
  weekly: ['What patterns do you notice?', 'Suggest a routine to try'],
  routine: ['Summarise how I\'m doing', 'What patterns do you notice?'],
  reflection: ['Suggest a routine to try', 'Prepare questions for a clinician'],
  clinician: ['Summarise how I\'m doing', 'What patterns do you notice?'],
  product: ['Tell me about the clinician pathway', 'Explain Vijaya in Ayurveda', 'Summarise how I\'m doing'],
};

const res = (title, slug, type = 'content') => ({ type, title, link: type === 'routine' ? '/routines' : `/learn/${slug}` });
const articleRes = (cats, n = 2) => articlesForCategories(cats, n).map((a) => res(a.title, a.slug));

function generate({ userId, message, intent, conversationId }) {
  const rhythm = getRhythm(userId);
  const data = rhythm.filter((r) => r.has_data);
  const name = displayName(userId);
  const dimKey = mentionedDimension(message);
  const lowest = [...data].sort((a, b) => a.current - b.current)[0];
  const suggestions = SUGGEST[intent] || SUGGEST.general;
  let reply; let resources = [];

  if (intent === 'summary') {
    if (!data.length) reply = `Hi ${name}. I don't have much check-in data to look at yet. A few daily check-ins will give us something real to reflect on together.`;
    else {
      const high = [...data].sort((a, b) => b.current - a.current)[0];
      const moved = [...data].filter((r) => Math.abs(r.delta7) >= 5).sort((a, b) => Math.abs(b.delta7) - Math.abs(a.delta7))[0];
      reply = `Here's what you've reported lately, ${name}. ${high.label} has been your steadier area (around ${high.current}), while ${lc(lowest.label)} has been lower (around ${lowest.current}).`;
      if (moved) reply += ` Compared with the week before, you've reported ${lc(moved.label)} ${moved.delta7 > 0 ? 'higher' : 'lower'} by about ${Math.abs(moved.delta7)} points.`;
      reply += ' These are your own reports, so they show how things have felt, not why.';
      resources = articleRes([DIM_CATEGORY[lowest.key]], 1);
    }
  } else if (intent === 'explain') {
    const dim = dimKey ? DIMENSIONS.find((d) => d.key === dimKey) : null;
    if (dim) {
      const r = rhythm.find((x) => x.key === dim.key);
      reply = `${dim.label}: ${dim.description}`;
      if (r.has_data) reply += ` Your recent figure is around ${r.current}${r.baseline !== null ? `, compared with a baseline of ${r.baseline}` : ''}. Scores come from your own answers and always mean the same thing: higher feels better. They are not a medical measure.`;
      else reply += " I don't have readings for this yet, so a few check-ins will start to fill it in.";
      resources = articleRes([DIM_CATEGORY[dim.key]], 1);
    } else {
      reply = 'Your rhythm is a set of separate dimensions, such as sleep, energy and relaxation, each scored 0 to 100 from your own answers, where higher feels better. Your baseline is the average of your first seven days of check-ins, and everything after that is compared with your own starting point rather than with anyone else.';
      resources = [res('Why your baseline matters', 'why-your-baseline-matters'), res('What does your daily rhythm actually mean?', 'what-does-your-daily-rhythm-actually-mean')];
    }
  } else if (intent === 'weekly') {
    const { content } = generateWeeklyReport(userId);
    reply = `${content.reflection} ${content.reported[0] || ''}`.trim();
    resources = [];
  } else if (intent === 'routine') {
    const goalKey = getGoalKeys(userId)[0];
    const routine = (dimKey && routineForDimension(dimKey)) || (lowest && routineForDimension(lowest.key)) || (goalKey && routineForGoal(goalKey)) || routineForGoal('night_routine');
    if (routine) {
      reply = `One gentle option is ${routine.name} (about ${routine.duration_min} minutes): ${routine.steps.slice(0, 3).join('; ')}. It's a general wellness activity, not a treatment, so use it only if it feels right for you, and notice how your check-ins look afterwards.`;
      resources = [res(routine.name, routine.id, 'routine')];
    } else reply = "I couldn't find a routine just now, but the Routines page has a few gentle ideas to browse.";
  } else if (intent === 'reflection') {
    const pats = detectPatterns(userId).slice(0, 2);
    reply = pats.length
      ? `${pats.map((p) => p.text).join(' ')} I can only describe what you've reported, not why it happened, so treat this as something to notice.`
      : "I'm not seeing a clear pattern yet. Patterns need at least a few days on each side of a comparison, so keep checking in and adding your daily context, and they'll start to show.";
    resources = articleRes(['Wellness science'], 1);
  } else if (intent === 'clinician') {
    const qs = data.length ? `Based on your reports, you might ask about ${lowest ? lc(lowest.label) : 'your rhythm'} and what everyday habits matter most.` : 'Writing down what you have noticed is a good starting point.';
    reply = `If something feels persistent or worrying, a qualified clinician is the right person to talk to. In SVARA you can choose to share a summary of your rhythm with one, and you stay in control of that. ${qs} I can help you prepare questions to bring along.`;
    resources = [];
  } else if (intent === 'product') {
    const e = productEligibility(userId);
    reply = `I can share general education about botanical and hemp-derived ingredients, but I can't recommend products or suggest how to use them. ${e.eligible ? 'Because you have been through the clinician pathway, you can see product information on the Explore page, and it stays informational.' : 'Product information in SVARA appears only after a conversation with a clinician that you have chosen to share your summary for.'} Rules about hemp and related ingredients vary by place, so a qualified clinician is the best person to ask.`;
    resources = articleRes(['Hemp education', 'Ayurveda education', 'Product education'], 3);
  } else {
    reply = `Hi ${name}. I can summarise how you've been doing, explain a number in your rhythm, look for patterns, suggest a gentle routine, or help you prepare for a clinician conversation. What would be most useful?`;
  }
  return { reply, suggestions: suggestions.slice(0, 3), resources, goals: getGoalKeys(userId).map((k) => GOALS.find((g) => g.key === k)?.label).filter(Boolean), conversationId };
}

// ---------- agent registry ----------
const claimViolation = { type: 'object', properties: { rule_id: S.str(80), label: S.str(200), severity: S.str(20), excerpt: S.str(400), reason: S.str(400) } };
const questionShape = { type: 'object', required: ['id', 'dimension', 'question', 'options'], properties: { id: S.str(80), dimension: S.str(40), question: S.str(300), response_type: S.str(20), options: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } }, reverse: { type: 'boolean' } } };

export const agents = {
  onboarding_agent: {
    name: 'onboarding_agent', inputSchema: { type: 'object', required: ['scores'], properties: { scores: { type: 'object' } } },
    outputSchema: { type: 'object', required: ['suggested_goals', 'intro'], properties: { suggested_goals: S.strList(3, 40), intro: S.str(400) } },
    run({ scores }) {
      const lowDims = Object.entries(scores).filter(([k]) => DIMENSIONS.some((d) => d.key === k)).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => k);
      const suggested = [...new Set(lowDims.flatMap((d) => GOALS.filter((g) => g.dimensions[0] === d).map((g) => g.key)))].slice(0, 3);
      return { suggested_goals: suggested, intro: 'Based on what you shared, these areas might be worth tracking first. You can change them any time.' };
    },
  },
  question_selection_agent: {
    name: 'question_selection_agent', inputSchema: { type: 'object', required: ['userId'], properties: { userId: S.str(80), count: { type: 'integer', minimum: 1, maximum: 5 } } },
    outputSchema: { type: 'object', required: ['questions', 'reasons'], properties: { questions: { type: 'array', items: questionShape }, reasons: S.strList(5) } },
    run: ({ userId, count }) => selectQuestions(userId, { count }),
  },
  wellness_summary_agent: {
    name: 'wellness_summary_agent', inputSchema: userIdSchema,
    outputSchema: { type: 'object', required: ['reported', 'reflection'], properties: { reported: S.strList(8), reflection: S.str(800) } },
    run: ({ userId }) => { const { content } = generateWeeklyReport(userId); return { reported: content.reported, reflection: content.reflection }; },
  },
  routine_agent: {
    name: 'routine_agent', inputSchema: { type: 'object', required: ['userId'], properties: { userId: S.str(80), dimension: S.str(40) } },
    outputSchema: { type: 'object', required: ['routine_id', 'title', 'text'], properties: { routine_id: S.str(80), title: S.str(120), text: S.str(500) } },
    run({ userId, dimension }) {
      const low = [...getRhythm(userId).filter((r) => r.has_data)].sort((a, b) => a.current - b.current)[0];
      const dim = dimension || low?.key || 'relaxation';
      const r = routineForDimension(dim) || routineForGoal('night_routine');
      return { routine_id: r.id, title: r.name, text: `Something gentle to try: ${r.name}, about ${r.duration_min} minutes. Notice how ${lc(dimLabel(dim))} feels in your check-ins afterwards.` };
    },
  },
  conversation_agent: {
    name: 'conversation_agent',
    inputSchema: { type: 'object', required: ['userId', 'message'], properties: { userId: S.str(80), message: { type: 'string', minLength: 1, maxLength: 2000 }, intent: S.str(20), conversationId: S.str(80) } },
    outputSchema: { type: 'object', required: ['reply', 'suggestions', 'resources'], properties: { reply: S.str(1500), suggestions: S.strList(4, 120), resources: { type: 'array', items: { type: 'object', required: ['type', 'title', 'link'], properties: { type: S.str(20), title: S.str(200), link: S.str(200) } } } } },
    run: (input) => generate({ ...input, intent: input.intent || detectIntent(input.message) }),
    /** Optional LLM path. Validated JSON only; any failure falls back to the deterministic reply. */
    async runAsync(input) {
      const intent = input.intent || detectIntent(input.message);
      const base = generate({ ...input, intent });
      if (!llmEnabled(input.userId) || ['clinician', 'product'].includes(intent)) return base;
      const ctx = buildContext(input.userId, 'chat', { conversationId: input.conversationId });
      const out = await completeJson({
        userId: input.userId, system: GUIDE_SYSTEM, schema: GUIDE_LLM_SCHEMA,
        prompt: `CONTEXT: ${JSON.stringify(ctx)}\nINTENT: ${intent}\nUSER_MESSAGE: ${input.message}`,
      });
      if (!out) return base;
      if (classify(out.reply).category !== 'NORMAL_WELLNESS') return base;
      return { ...base, reply: out.reply, suggestions: out.suggestions?.length ? out.suggestions : base.suggestions };
    },
  },
  report_agent: {
    name: 'report_agent', inputSchema: userIdSchema,
    outputSchema: { type: 'object', required: ['reflection', 'next_week'], properties: { reflection: S.str(800), next_week: S.str(500) } },
    run: ({ userId }) => { const { content } = generateWeeklyReport(userId); return { reflection: content.reflection, next_week: content.next_week }; },
  },
  safety_agent: {
    name: 'safety_agent', inputSchema: { type: 'object', required: ['text'], properties: { text: S.str(5000) } },
    outputSchema: { type: 'object', required: ['category'], properties: { category: S.str(40), rule_label: { type: ['string', 'null'] }, reply: { type: ['string', 'null'] } } },
    run: ({ text }) => { const c = classify(text); return { ...c, reply: respondTo(c.category)?.reply ?? null }; },
  },
  claim_compliance_agent: {
    name: 'claim_compliance_agent', inputSchema: { type: 'object', required: ['text'], properties: { text: S.str(20000) } },
    outputSchema: { type: 'object', required: ['ok', 'violations'], properties: { ok: { type: 'boolean' }, violations: { type: 'array', items: claimViolation } } },
    run: ({ text }) => checkText(text),
  },
};

/** Validate input → run → validate output. Output that fails its schema is never returned. */
export function runAgent(name, input) {
  const a = agents[name];
  if (!a) throw Object.assign(new Error(`Unknown agent ${name}`), { status: 500 });
  assertValid(a.inputSchema, input, `${name} input`);
  return assertValid(a.outputSchema, a.run(input), `${name} output`);
}
export async function runAgentAsync(name, input) {
  const a = agents[name];
  assertValid(a.inputSchema, input, `${name} input`);
  const out = a.runAsync ? await a.runAsync(input) : a.run(input);
  return assertValid(a.outputSchema, out, `${name} output`);
}
export const agentGuard = guardOutput;
export { validate };
