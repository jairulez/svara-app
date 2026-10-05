// DEMO products only. Fabricated, never real approvals. regulatory_status stays DEMO_NOT_APPROVED, licence_reference null.
const DISCLAIMER = 'DEMO — NOT FOR SALE. Illustrative preview item; it has no regulatory approval and is not available to purchase. This information is educational and not medical advice. Speak with a qualified clinician or pharmacist before using any product, especially if you take medication.';
const base = { manufacturer: 'Demo Botanicals Co. (fictional)', regulatory_status: 'DEMO_NOT_APPROVED', licence_reference: null, required_disclaimer: DISCLAIMER, lab_report_url: null, currency: 'INR', stock: 0, is_demo: 1, active: 1 };

export const PRODUCTS = [
  { ...base, id: 'p_demo_evening_tea', name: 'Calm Evening Botanical Tea', category: 'Herbal tea',
    ingredients: ['Tulsi', 'Chamomile', 'Lemon balm', 'Fennel seed'], formulation: 'Caffeine-free loose-leaf herbal infusion',
    description: 'DEMO — NOT FOR SALE. A caffeine-free botanical infusion imagined as a quiet moment in an evening routine.',
    regulatory_category: 'Herbal infusion (illustrative)', price: 450, batch_information: 'DEMO batch, not a real production lot',
    approved_claims: ['Part of an evening routine', 'A caffeine-free herbal infusion', 'A warm ritual to end the day'],
    restricted_claims: ['Treats insomnia', 'Cures anxiety', 'Helps you fall asleep', 'Clinically proven', 'Guaranteed calm'] },
  { ...base, id: 'p_demo_night_blend', name: 'Night Ritual Herbal Blend', category: 'Herbal blend',
    ingredients: ['Brahmi', 'Shankhpushpi', 'Tulsi', 'Cardamom'], formulation: 'Powdered herbal blend for a warm drink',
    description: 'DEMO — NOT FOR SALE. A sleep-support style herbal blend inspired by traditional evening rituals, shown here only to illustrate how product information is presented.',
    regulatory_category: 'Herbal blend (illustrative)', price: 590, batch_information: 'DEMO batch, not a real production lot',
    approved_claims: ['Designed to be used as part of a wind-down routine', 'Inspired by traditional evening rituals'],
    restricted_claims: ['Treats insomnia', 'Cures sleeplessness', 'Guaranteed better sleep', 'Medical-grade sleep aid', 'Clinically tested'] },
  { ...base, id: 'p_demo_hemp_seed_oil', name: 'Cold-Pressed Hemp Seed Oil', category: 'Culinary oil',
    ingredients: ['Cold-pressed hemp seed oil'], formulation: 'Culinary oil, 100 ml',
    description: 'DEMO — NOT FOR SALE. A culinary oil made from hemp seed, shown as an example of an everyday food item. Rules for hemp-derived foods vary by country.',
    regulatory_category: 'Food item (illustrative)', price: 750, batch_information: 'DEMO batch, not a real production lot',
    approved_claims: ['A culinary oil for dressings and finishing', 'Part of an everyday cooking routine'],
    restricted_claims: ['Treats pain', 'Contains CBD', 'Gets you relaxed', 'Anti-inflammatory', 'Cures anxiety'] },
  { ...base, id: 'p_demo_recovery_balm', name: 'Movement & Recovery Balm', category: 'Topical balm',
    ingredients: ['Sesame oil', 'Beeswax', 'Rosemary oil', 'Peppermint oil'], formulation: 'Warming massage balm, 50 g',
    description: 'DEMO — NOT FOR SALE. A warming massage balm imagined as part of a post-movement self-care ritual.',
    regulatory_category: 'Topical (illustrative)', price: 520, batch_information: 'DEMO batch, not a real production lot',
    approved_claims: ['A warming massage balm for after-activity self-care', 'Part of a post-movement routine'],
    restricted_claims: ['Painkiller', 'Treats muscle pain', 'Heals injuries', 'Anti-inflammatory', 'Clinically proven'] },
];
