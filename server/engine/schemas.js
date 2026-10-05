// Tiny JSON-schema subset validator (type, properties, required, items, enum, min/max, minLength/maxLength,
// minItems/maxItems, additionalProperties:false). Used to gate every agent input/output and all LLM output.
export function validate(schema, value, path = '$') {
  const errors = [];
  const fail = (msg) => errors.push(`${path}: ${msg}`);
  if (!schema || typeof schema !== 'object') return { ok: true, errors };

  const types = schema.type ? [].concat(schema.type) : null;
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  if (types) {
    const t = typeOf(value);
    const okType = types.some((x) => x === t || (x === 'number' && t === 'integer'));
    if (!okType) { fail(`expected ${types.join('|')}, got ${t}`); return { ok: false, errors }; }
  }
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail('too short');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail('too long');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('does not match pattern');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail('below minimum');
    if (schema.maximum !== undefined && value > schema.maximum) fail('above maximum');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail('too few items');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('too many items');
    if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${path}[${i}]`).errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value) || value[k] === undefined) fail(`missing "${k}"`);
    const props = schema.properties || {};
    for (const [k, s] of Object.entries(props)) if (k in value && value[k] !== undefined) errors.push(...validate(s, value[k], `${path}.${k}`).errors);
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(k in props)) fail(`unexpected "${k}"`);
  }
  return { ok: errors.length === 0, errors };
}

export function assertValid(schema, value, label = 'value') {
  const r = validate(schema, value);
  if (!r.ok) throw Object.assign(new Error(`${label} failed validation: ${r.errors.slice(0, 3).join('; ')}`), { status: 422 });
  return value;
}

// ---- shared schemas ----
export const S = {
  str: (max = 2000) => ({ type: 'string', maxLength: max }),
  strList: (max = 10, len = 400) => ({ type: 'array', maxItems: max, items: { type: 'string', maxLength: len } }),
};

export const GUIDE_LLM_SCHEMA = {
  type: 'object', required: ['reply'], additionalProperties: false,
  properties: { reply: { type: 'string', minLength: 1, maxLength: 1200 }, suggestions: S.strList(4, 80) },
};
