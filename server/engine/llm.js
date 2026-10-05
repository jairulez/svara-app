import { config } from '../lib/config.js';
import { setting } from '../lib/db.js';
import { validate } from './schemas.js';
import { hasConsent } from './memory.js';

/** LLM is optional: provider must be anthropic with a key, admin flag on, and (if a user is given) ai_processing consent. */
export function llmEnabled(userId = null) {
  if (config.llm.provider !== 'anthropic' || !config.llm.apiKey) return false;
  if (setting('ai.llm_enabled') !== true) return false;
  return userId ? hasConsent(userId, 'ai_processing') : true;
}

function extractJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

/**
 * Ask the Anthropic Messages API for strict JSON. Returns the schema-validated object, or null on ANY problem
 * (disabled, network, non-200, bad JSON, schema mismatch). Callers must then use the deterministic fallback.
 * The raw model text is never returned or stored.
 */
export async function completeJson({ userId = null, system, prompt, schema, maxTokens = 500, timeoutMs = 12000 }) {
  if (!llmEnabled(userId)) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.llm.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.llm.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const obj = extractJson(text);
    if (!obj) return null;
    return validate(schema, obj).ok ? obj : null;
  } catch {
    return null;
  }
}

export const GUIDE_SYSTEM = [
  'You are the SVARA guide, a calm, warm wellness companion. SVARA is NOT a doctor.',
  'Rules: use observational language only ("you\'ve reported..."). Never diagnose, never suggest treatments, medication, doses or products,',
  'never claim any health benefit, never predict outcomes. If asked about medical matters, say a qualified clinician is the right person.',
  'Use ONLY the data in CONTEXT. Keep replies under 120 words.',
  'Respond with ONLY a JSON object: {"reply": string, "suggestions": [up to 3 short follow-up prompts]}.',
].join(' ');
