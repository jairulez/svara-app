// Safety + claim rules. Patterns are case-insensitive regex source strings, editable from Admin.
// Safety classification normalises curly apostrophes to ' and lower-cases before matching.
const R = String.raw;

export const SAFETY_RULES = [
  // ---- EMERGENCY ----
  { id: 'sr_breathing', category: 'EMERGENCY', label: 'Breathing difficulty',
    pattern: R`\b(?:can'?t|cannot|unable to|struggling to|hard to|difficult to)\s+(?:\w+\s+)?breathe\b|\b(?:trouble|difficulty|struggling)\s+breathing\b|\bshort(?:ness)? of breath\b|\bgasping for (?:air|breath)\b` },
  { id: 'sr_chest', category: 'EMERGENCY', label: 'Chest pain',
    pattern: R`\bchest (?:pain|pains|pressure|tightness)\b|\bpain (?:in|across) (?:my )?chest\b|\btight(?:ness)? in (?:my )?chest\b` },
  { id: 'sr_overdose', category: 'EMERGENCY', label: 'Possible overdose',
    pattern: R`\boverdos(?:e|ed|ing)\b|\btook (?:too (?:many|much)|an extra)\b.{0,30}\b(?:pills?|tablets?|capsules?|medication|medicine|dose)\b` },
  { id: 'sr_allergy', category: 'EMERGENCY', label: 'Severe allergic reaction',
    pattern: R`\b(?:anaphyla\w*|severe(?:ly)? allergic|throat (?:is )?(?:closing|swelling|tight)|(?:face|tongue|lips|throat) (?:is |are )?(?:swelling|swollen))\b` },
  { id: 'sr_collapse', category: 'EMERGENCY', label: 'Collapse or seizure',
    pattern: R`\b(?:passed out|blacked out|unconscious|having a seizure|had a seizure|having a stroke|face (?:is )?drooping|bleeding (?:heavily|badly)|won'?t stop bleeding)\b` },
  // ---- POTENTIAL_CRISIS ----
  { id: 'sr_selfharm', category: 'POTENTIAL_CRISIS', label: 'Self-harm or suicidal phrasing',
    pattern: R`\b(?:kill(?:ing)? myself|end(?:ing)? (?:my (?:own )?life|it all)|tak(?:e|ing) my (?:own )?life|want(?:ed)? to die|wanna die|wish i (?:was|were) dead|better off dead|suicid\w*|self[- ]?harm\w*|(?:hurt|harm)(?:ing)? myself|don'?t want to (?:be here|live|exist|wake up|go on)|no (?:reason|point) (?:in )?(?:living|going on|anything)|can'?t go on|not worth living)\b` },
  { id: 'sr_hopeless', category: 'POTENTIAL_CRISIS', label: 'Hopelessness',
    pattern: R`\b(?:hopeless\w*|worthless|nothing (?:matters|will ever)|give up on (?:life|everything)|no way out)\b` },
  // ---- ADVERSE_REACTION ----
  { id: 'sr_adverse', category: 'ADVERSE_REACTION', label: 'Possible adverse reaction',
    pattern: R`\b(?:side[- ]effects?|adverse (?:reaction|effect)s?|allergic reaction|bad reaction|reacted (?:badly|to)|rash (?:after|from)|made me (?:sick|feel unwell|dizzy|nauseous|ill)|(?:felt|feeling|feel|got|get) (?:sick|dizzy|nauseous|unwell|faint|itchy)\b.{0,40}\b(?:after|since|from)\b.{0,30}\b(?:taking|using|trying|drinking|applying|product|tea|oil|balm|blend))\b` },
  // ---- PRODUCT_DOSAGE ----
  { id: 'sr_dosage', category: 'PRODUCT_DOSAGE', label: 'Product dosage question',
    pattern: R`\bhow (?:much|many)\b.{0,60}\b(?:should|can|could|do|would|to) (?:i |we |you )?(?:take|use|consume|have|drink|eat|apply)\b|\b(?:dose|doses|dosage|dosing)\b|\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ml|milligrams?)\b|\bhow (?:often|frequently|many times)\b.{0,30}\b(?:take|use|apply|drink)\b|\bmaximum amount\b` },
  // ---- MEDICATION_QUESTION ----
  { id: 'sr_med_change', category: 'MEDICATION_QUESTION', label: 'Changing medication',
    pattern: R`\b(?:stop|stopping|quit|quitting|change|changing|skip|skipping|reduce|reducing|lower|lowering|increase|increasing|double|doubling|miss|missing|swap|replace|come off|coming off|taper\w*)\b.{0,40}\b(?:medication|medications|medicine|medicines|meds|prescription|prescribed|pills|tablets|antidepressants?|antibiotics?|sleeping pills|blood pressure|insulin|statins?)\b|\bshould i (?:keep|continue|carry on|still) (?:taking|on)\b` },
  { id: 'sr_med_interact', category: 'MEDICATION_QUESTION', label: 'Medication interaction',
    pattern: R`\b(?:interact\w*|mix|mixing|combine|combining|together with|along with|alongside)\b.{0,50}\b(?:medication|medications|medicine|meds|prescription|pills|antidepressants?|blood thinners?|painkillers?)\b|\b(?:medication|medicine|meds|prescription|pills|antidepressants?)\b.{0,40}\b(?:interact\w*|safe with|okay with|ok with)\b` },
  // ---- MEDICAL_QUESTION ----
  { id: 'sr_medical', category: 'MEDICAL_QUESTION', label: 'Medical or diagnostic question',
    pattern: R`\bdo i have\b|\bam i (?:sick|ill|depressed|anxious|bipolar|diabetic|dying|autistic)\b|\bdo you think i have\b|\bdiagnos\w*|\bwhat(?:'s| is) wrong with me\b|\b(?:is|are) (?:this|these|it) (?:normal|serious|dangerous|a sign of)\b|\bsymptoms? of\b|\bwhat are the symptoms\b|\b(?:treat|cure|treatment for|remedy for|medicine for|medication for)\b.{0,25}\b(?:my )?(?:anxiety|depression|insomnia|adhd|pain|migraines?|ptsd|panic|diabetes|cancer)\b|\b(?:i have|having|i'?ve got|suffer\w* (?:from|with)) (?:insomnia|depression|an anxiety disorder|adhd|ptsd|panic attacks?)\b` },
];

export const CLAIM_RULES = [
  { id: 'cr_treat', label: 'Treats / cures / heals a condition', severity: 'block',
    reason: 'Wellness copy must not claim to treat, cure or heal a medical condition.',
    pattern: R`\b(?:treat|treats|treated|treating|cure|cures|cured|curing|heal|heals|healed|remedy|remedies|fix|fixes|alleviate\w*|eliminate\w*|reverse\w*)\b[^.]{0,30}\b(?:anxiety|insomnia|depression|panic|ptsd|adhd|cancer|diabetes|epilepsy|arthritis|migraines?|hypertension|disease|disorder|illness|sleeplessness|sleep disorders?)\b` },
  { id: 'cr_cure', label: 'The word "cure"', severity: 'block', reason: 'Do not use "cure" as a claim.', pattern: R`\bcures?\b|\bcuring\b` },
  { id: 'cr_guaranteed', label: 'Guaranteed results', severity: 'block', reason: 'Outcomes cannot be guaranteed.', pattern: R`\bguarantee[sd]?\b|\b100% (?:effective|safe|natural results)\b` },
  { id: 'cr_painkiller', label: 'Painkiller / analgesic claim', severity: 'block', reason: 'Pain-relief claims are medical claims.', pattern: R`\b(?:pain[- ]?kill\w*|analgesic|pain relief)\b` },
  { id: 'cr_prevents', label: 'Prevents disease', severity: 'block', reason: 'Disease-prevention claims are not allowed.',
    pattern: R`\b(?:prevent|prevents|preventing|protects? against|lowers? the risk of)\b[^.]{0,30}\b(?:disease|illness|cancer|diabetes|infection|heart|dementia|alzheimer\w*)` },
  { id: 'cr_clinical', label: 'Clinically proven / tested', severity: 'block', reason: 'Efficacy claims need approved evidence.',
    pattern: R`\bclinically (?:proven|tested|shown|approved)\b|\bscientifically proven\b|\bproven to (?:treat|cure|reduce|improve|work)\b|\bdoctor[- ]recommended\b` },
  { id: 'cr_miracle', label: 'Miracle / wonder claims', severity: 'block', reason: 'Exaggerated claims are not allowed.', pattern: R`\b(?:miracle|magic pill|wonder (?:drug|cure)|breakthrough cure)\b` },
  { id: 'cr_high', label: 'Intoxication / "get high"', severity: 'block', reason: 'Do not reference intoxicating effects as a benefit.', pattern: R`\bget(?:ting)? high\b|\bpsychoactive (?:effect|high)s?\b|\bstoned\b` },
  { id: 'cr_approval', label: 'Regulatory approval claim', severity: 'block', reason: 'Approval claims need supporting regulatory metadata.',
    pattern: R`\bfda[- ]approved\b|\bapproved by (?:the )?fda\b|\bayush[- ]approved\b|\bfssai[- ]approved\b|\bapproved by (?:the )?(?:fssai|ayush)\b` },
  { id: 'cr_diagnose', label: 'Diagnosis / prescription language', severity: 'block', reason: 'SVARA does not diagnose or prescribe.', pattern: R`\bdiagnos(?:e|es|ed|ing|is)\b|\bprescribe[sd]?\b` },
  { id: 'cr_dosing', label: 'Dosing instructions', severity: 'block', reason: 'Dosing guidance is not allowed.',
    pattern: R`\b(?:recommended|suggested|daily|maximum) (?:dose|dosage)\b|\btake\s+\d+\s*(?:mg|mcg|ml|capsules?|tablets?|drops?|pills?|gummies)\b` },
  { id: 'cr_immune', label: 'Immunity claims', severity: 'block', reason: 'Immunity claims are health claims.', pattern: R`\b(?:boosts?|strengthens?) (?:your )?(?:immune|immunity)\b|\banti[- ]?inflammatory\b` },
  { id: 'cr_detox', label: 'Detox claims', severity: 'warn', reason: 'Detox language is vague and often unsubstantiated.', pattern: R`\bdetox\w*\b` },
];
