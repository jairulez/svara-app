import { all, get, insert, run, update, j, now } from '../lib/db.js';
import { config } from '../lib/config.js';
import { arr } from './util.js';

const BADGE = 'DEMO — NOT FOR SALE';
const norm = (t) => String(t ?? '').replace(/[’‘]/g, "'");

// A match is negated when a negation word sits earlier in the same clause: "does not treat or cure".
function negated(s, idx) {
  const before = s.slice(Math.max(0, idx - 70), idx).toLowerCase();
  const seg = before.split(/[.;:!?\n]|\bbut\b|\bhowever\b/).pop();
  return /\b(?:not|no|never|without|cannot|isn't|aren't|doesn't|don't|won't|nor|neither|nothing|none)\b|n't\b/.test(seg);
}
const excerptOf = (s, idx, len) => s.slice(Math.max(0, idx - 25), idx + len + 25).replace(/\s+/g, ' ').trim();

/** Check marketing/educational copy against claim_rules + a product's restricted_claims. */
export function checkText(text, { product } = {}) {
  const s = norm(text);
  const violations = [];
  const approvedMeta = product && product.regulatory_status === 'APPROVED' && product.licence_reference;
  for (const rule of all('SELECT * FROM claim_rules WHERE active=1')) {
    if (rule.id === 'cr_approval' && approvedMeta) continue; // approval wording allowed when metadata supports it
    let re;
    try { re = new RegExp(rule.pattern, 'gi'); } catch { continue; }
    let n = 0;
    for (const m of s.matchAll(re)) {
      if (negated(s, m.index)) continue;
      violations.push({ rule_id: rule.id, label: rule.label, severity: rule.severity, excerpt: excerptOf(s, m.index, m[0].length), reason: rule.reason });
      if (++n >= 3) break;
    }
  }
  if (product) {
    const lower = s.toLowerCase();
    for (const phrase of arr(typeof product.restricted_claims === 'string' ? j(product.restricted_claims, []) : product.restricted_claims)) {
      const p = String(phrase).toLowerCase().trim();
      const idx = p ? lower.indexOf(p) : -1;
      if (idx >= 0 && !negated(s, idx)) {
        violations.push({ rule_id: 'product_restricted', label: 'Restricted product claim', severity: 'block', excerpt: excerptOf(s, idx, p.length), reason: 'This product has a restricted claim that cannot be used.' });
      }
    }
  }
  return { ok: !violations.some((v) => v.severity === 'block'), violations };
}

/** Product copy = name, description, formulation, approved claims and disclaimer (never the restricted list itself). */
export function checkProduct(row) {
  const approved = arr(typeof row.approved_claims === 'string' ? j(row.approved_claims, []) : row.approved_claims);
  const text = [row.name, row.description, row.formulation, ...approved, row.required_disclaimer].filter(Boolean).join('\n');
  return checkText(text, { product: row });
}

/** Check an article, persist content_claims and update status/claim_check. */
export function checkContent(row) {
  const res = checkText([row.title, row.summary, row.body].filter(Boolean).join('\n'));
  run('DELETE FROM content_claims WHERE content_id=? AND resolved=0', row.id);
  for (const v of res.violations) insert('content_claims', { content_id: row.id, excerpt: v.excerpt, rule_id: v.rule_id, severity: v.severity });
  const status = !res.ok ? 'blocked' : row.status === 'blocked' ? 'published' : row.status;
  update('content', row.id, { status, claim_check: JSON.stringify({ ok: res.ok, checked_at: now(), violations: res.violations.length }) });
  return res;
}

const SAFE_FALLBACK = "I can share general wellness information, but I'd rather not make claims about health outcomes. A qualified clinician is the best person to speak with about that.";

/** Guard generated text: blocked text is replaced by the fallback. */
export function guardOutput(text, { fallback = SAFE_FALLBACK, product } = {}) {
  const r = checkText(text, { product });
  return r.ok ? { text, blocked: false, violations: r.violations } : { text: fallback, blocked: true, violations: r.violations };
}

export function publicProduct(row) {
  const list = (v) => arr(typeof v === 'string' ? j(v, []) : v);
  return {
    id: row.id, name: row.name, category: row.category, manufacturer: row.manufacturer,
    ingredients: list(row.ingredients), formulation: row.formulation, description: row.description,
    regulatory_category: row.regulatory_category, regulatory_status: row.regulatory_status, licence_reference: row.licence_reference ?? null,
    approved_claims: list(row.approved_claims), restricted_claims: list(row.restricted_claims),
    required_disclaimer: row.required_disclaimer, lab_report_url: row.lab_report_url ?? null, batch_information: row.batch_information ?? null,
    price: row.price, currency: row.currency, stock: row.stock, is_demo: !!row.is_demo, badge: row.is_demo ? BADGE : null,
  };
}

/** Display gate. Commerce on: only APPROVED + licence reference. Otherwise demo products show (with badge) in demo mode. */
export function listDisplayableProducts() {
  const rows = all('SELECT * FROM products WHERE active=1 ORDER BY name');
  if (config.commerceEnabled) {
    return rows.filter((r) => r.regulatory_status === 'APPROVED' && r.licence_reference && !r.is_demo).map(publicProduct);
  }
  if (config.demoMode) return rows.filter((r) => r.is_demo).map(publicProduct);
  return [];
}

export const DEMO_BADGE = BADGE;
export const getProductRow = (id) => get('SELECT * FROM products WHERE id=?', id);
