import { get } from '../lib/db.js';
import { listDisplayableProducts } from './claims.js';

/**
 * Product information is only surfaced after a consented clinician pathway:
 * a completed/closed, non-revoked report with a granted consent AND a next_step note containing "[product-pathway]",
 * and at least one product that passes the display gate.
 */
export function productEligibility(userId) {
  const report = get(`SELECT cr.id, cr.consent_id FROM clinician_reports cr
    WHERE cr.user_id=? AND cr.status IN ('completed','closed') AND cr.revoked_at IS NULL AND cr.consent_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM consents c WHERE c.id=cr.consent_id AND c.granted=1)
      AND EXISTS (SELECT 1 FROM clinician_notes n WHERE n.report_id=cr.id AND n.kind='next_step' AND n.body LIKE '%[product-pathway]%')
    ORDER BY cr.created_at DESC LIMIT 1`, userId);
  if (!report) return { eligible: false, reason: 'Product information appears only after a consented conversation with a clinician that includes a product-pathway next step.' };
  if (!listDisplayableProducts().length) return { eligible: false, reason: 'No products currently meet the display requirements.' };
  return { eligible: true, reason: 'A completed clinician conversation you consented to includes a product-pathway next step.' };
}
