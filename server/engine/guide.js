import { get, insert, update, setting } from '../lib/db.js';
import { classify, respondTo, logEvent } from './safety.js';
import { guardOutput } from './claims.js';
import { hasConsent } from './memory.js';
import { runAgent, runAgentAsync, detectIntent } from './agents.js';
import { httpError, truncate } from './util.js';

const OFF_NOTE = 'The SVARA guide is switched off. You can turn it on in My Privacy (AI processing).';
const FALLBACK = "I'd rather not make claims about health outcomes. I can summarise what you've reported or suggest a gentle routine, and a qualified clinician is the best person to ask about anything medical.";

function gate(userId, conversationId, message) {
  if (!setting('ai.guide_enabled') || !hasConsent(userId, 'ai_processing')) {
    return { conversationId: conversationId || null, reply: OFF_NOTE, safety_category: 'NORMAL_WELLNESS', resources: [], suggestions: [], blocked: false, disabled: true };
  }
  if (typeof message !== 'string' || !message.trim()) throw httpError(400, 'Please write a message.');
  if (message.length > 2000) throw httpError(400, 'That message is too long.');
  return null;
}

function openConversation(userId, conversationId, message) {
  if (conversationId) {
    const c = get('SELECT * FROM ai_conversations WHERE id=? AND user_id=?', conversationId, userId);
    if (!c) throw httpError(404, 'Conversation not found.');
    return c;
  }
  return insert('ai_conversations', { user_id: userId, title: truncate(message.trim().replace(/\s+/g, ' '), 40), summary: '' });
}

// Rolling summary stores topics only, never the raw text (data minimisation).
function rollSummary(conv, intent, category) {
  const topics = (conv.summary || '').match(/Topics: ([\w, ]+)\./)?.[1]?.split(', ').filter(Boolean) || [];
  const next = [...topics.filter((t) => t !== intent), intent].slice(-5);
  const flag = category !== 'NORMAL_WELLNESS' ? ' A safety-related message was handled with a templated reply.' : '';
  return `Topics: ${next.join(', ')}.${flag}`;
}

function persist(userId, conv, message, out, intent) {
  insert('ai_messages', { conversation_id: conv.id, role: 'user', content: message.trim(), safety_category: out.safety_category });
  insert('ai_messages', { conversation_id: conv.id, role: 'assistant', content: out.reply, safety_category: out.safety_category, meta: JSON.stringify({ intent, blocked: out.blocked, resources: out.resources.length }) });
  update('ai_conversations', conv.id, { summary: rollSummary(conv, intent, out.safety_category) });
}

function safeReply(userId, conv, message, c) {
  logEvent({ userId, category: c.category, rule_label: c.rule_label, source: 'guide', text: message, action: 'templated_reply' });
  const out = { conversationId: conv.id, reply: respondTo(c.category).reply, safety_category: c.category, resources: [], suggestions: [], blocked: true, disabled: false };
  persist(userId, conv, message, out, 'safety');
  return out;
}

function finalise(userId, conv, message, intent, gen) {
  // claim guard, then an output safety check (the reply must itself never read like clinical/dosing advice)
  const g = guardOutput(gen.reply, { fallback: FALLBACK });
  let reply = g.text; let blocked = g.blocked;
  const o = classify(reply);
  if (['EMERGENCY', 'POTENTIAL_CRISIS', 'PRODUCT_DOSAGE', 'MEDICATION_QUESTION'].includes(o.category)) { reply = FALLBACK; blocked = true; }
  const out = { conversationId: conv.id, reply, safety_category: 'NORMAL_WELLNESS', resources: blocked ? [] : gen.resources, suggestions: gen.suggestions || [], blocked, disabled: false };
  persist(userId, conv, message, out, intent);
  return out;
}

/** Deterministic, synchronous guide pipeline (contract). */
export function respond(userId, { conversationId, message } = {}) {
  const off = gate(userId, conversationId, message);
  if (off) return off;
  const conv = openConversation(userId, conversationId, message);
  const c = classify(message);
  if (c.category !== 'NORMAL_WELLNESS') return safeReply(userId, conv, message, c);
  const intent = detectIntent(message);
  const gen = runAgent('conversation_agent', { userId, message, intent, conversationId: conv.id });
  return finalise(userId, conv, message, intent, gen);
}

/** Same pipeline, but uses the optional LLM (schema-validated, claim-guarded) when enabled. Falls back to `respond` behaviour. */
export async function respondAsync(userId, { conversationId, message } = {}) {
  const off = gate(userId, conversationId, message);
  if (off) return off;
  const conv = openConversation(userId, conversationId, message);
  const c = classify(message);
  if (c.category !== 'NORMAL_WELLNESS') return safeReply(userId, conv, message, c);
  const intent = detectIntent(message);
  const gen = await runAgentAsync('conversation_agent', { userId, message, intent, conversationId: conv.id });
  return finalise(userId, conv, message, intent, gen);
}
