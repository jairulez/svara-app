import { all, insert } from '../lib/db.js';
import { truncate } from './util.js';

export const SEVERITY_ORDER = ['EMERGENCY', 'POTENTIAL_CRISIS', 'ADVERSE_REACTION', 'PRODUCT_DOSAGE', 'MEDICATION_QUESTION', 'MEDICAL_QUESTION'];
export const CATEGORIES = ['NORMAL_WELLNESS', ...SEVERITY_ORDER];

// Negation is honoured only where "no chest pain" style phrasing is a real false positive.
// Crisis, dosage and medication rules are never suppressed by negation words ("I don't want to live").
const NEGATION_APPLIES = new Set(['EMERGENCY', 'ADVERSE_REACTION', 'MEDICAL_QUESTION']);
const NEG_BEFORE = /\b(?:no|not|never|without|zero|(?:do(?:n't| not)|did(?:n't| not)|have(?:n't| not)|has(?:n't| not)) (?:have|had|get|got|felt|feel|experience\w*|any))\s+(?:\w+\s+){0,2}$/;

const normalise = (t) => String(t ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

/** Classify free text against the DB-backed safety_rules. Highest severity wins. */
export function classify(text) {
  const s = normalise(text);
  if (!s) return { category: 'NORMAL_WELLNESS', rule_label: null };
  let best = null;
  for (const rule of all('SELECT category, label, pattern FROM safety_rules WHERE active=1')) {
    let re;
    try { re = new RegExp(rule.pattern, 'gi'); } catch { continue; }
    let hit = false;
    for (const m of s.matchAll(re)) {
      if (NEGATION_APPLIES.has(rule.category) && NEG_BEFORE.test(s.slice(Math.max(0, m.index - 40), m.index))) continue;
      hit = true; break;
    }
    if (!hit) continue;
    const rank = SEVERITY_ORDER.indexOf(rule.category);
    if (rank >= 0 && (!best || rank < best.rank)) best = { rank, category: rule.category, rule_label: rule.label };
  }
  return best ? { category: best.category, rule_label: best.rule_label } : { category: 'NORMAL_WELLNESS', rule_label: null };
}

const REPLIES = {
  EMERGENCY: "What you're describing could need urgent attention, and SVARA can't assess it. Please contact your local emergency number now, or go to the nearest emergency department. If someone is nearby, ask them to stay with you. Once you are safe and seen by a professional, I'm here whenever you'd like to come back.",
  POTENTIAL_CRISIS: "I'm really sorry you're carrying this, and I'm glad you said something. You deserve support from a real person right now. If you might act on these thoughts or are in immediate danger, please call your local emergency number. In India, Tele-MANAS (14416) is one free, confidential option; elsewhere, a local crisis line or a trusted person can help. If you can, reach out to someone close to you and stay with them. SVARA is a wellness tool, not a crisis service, but you are not alone.",
  ADVERSE_REACTION: "I'm sorry you've had that experience. If you've had an unexpected reaction, it's sensible to pause using whatever may be involved and speak with a doctor or pharmacist. If anything feels severe, such as trouble breathing, swelling of the face or throat, or chest pain, please call your local emergency number straight away. SVARA can't assess reactions, but I can help you note down what happened so you can share it.",
  PRODUCT_DOSAGE: "I can't advise on how much of any product to use or how often. That depends on the person and on the product's approved information. Please follow the product's approved labelling and check with a doctor or pharmacist, especially if you take other medication. I'm happy to help you prepare questions to bring to them.",
  MEDICATION_QUESTION: "SVARA can't give individual advice about starting, stopping, changing or combining medication. Please speak with your prescriber or pharmacist before making any change. If it helps, I can summarise what you've been reporting and help you write down questions for that conversation.",
  MEDICAL_QUESTION: "I can't diagnose or assess symptoms or conditions, and I wouldn't want to guess. A qualified professional can look at this properly, and it may be worth a professional assessment. If it would help, I can summarise what you've reported in SVARA and help you prepare questions for a clinician.",
};

export function respondTo(category) {
  return REPLIES[category] ? { reply: REPLIES[category] } : null;
}

const scrub = (s) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]');

/** Persist a minimised safety event: truncated, with emails/phone-like numbers removed. */
export function logEvent({ userId = null, category, rule_label = null, source = 'guide', text = '', action = 'safe_reply' }) {
  return insert('safety_events', {
    user_id: userId, category, rule_label, source, excerpt: truncate(scrub(String(text).replace(/\s+/g, ' ').trim()), 140), action,
  });
}
