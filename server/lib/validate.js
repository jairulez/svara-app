import { httpError } from './http.js';

const mk = (type, o = {}) => ({ type, ...o });
/** Tiny schema builders. Every field is optional unless { required: true }. */
export const S = {
  str: (o) => mk('string', o),
  email: (o) => mk('email', o),
  int: (o) => mk('int', o),
  num: (o) => mk('number', o),
  bool: (o) => mk('boolean', o),
  enum: (values, o) => mk('enum', { values, ...o }),
  arr: (item, o) => mk('array', { item, ...o }),
  obj: (shape, o) => mk('object', { shape, ...o }),
  /** free-form plain object (size limited), e.g. source_metadata */
  json: (o) => mk('json', o),
};

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function fail(errors, path, msg) { errors[path] = msg; }

function clean(spec, value, path, errors) {
  const t = spec.type;
  if (value === null && spec.nullable) return null;
  switch (t) {
    case 'string': case 'email': {
      if (typeof value !== 'string') return fail(errors, path, 'Must be text.');
      let v = spec.trim === false ? value : value.trim();
      if (t === 'email') {
        v = v.toLowerCase();
        if (v.length > 254 || !EMAIL_RE.test(v)) return fail(errors, path, 'Enter a valid email address.');
      }
      if (spec.min !== undefined && v.length < spec.min) return fail(errors, path, spec.min === 1 ? 'Required.' : `Must be at least ${spec.min} characters.`);
      if (spec.max !== undefined && v.length > spec.max) return fail(errors, path, `Must be at most ${spec.max} characters.`);
      if (spec.pattern && !spec.pattern.test(v)) return fail(errors, path, spec.patternMessage || 'Invalid format.');
      if (/\u0000/.test(v)) return fail(errors, path, 'Invalid characters.');
      return v;
    }
    case 'int': case 'number': {
      let v = value;
      if (spec.coerce && typeof v === 'string' && v.trim() !== '') v = Number(v);
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail(errors, path, 'Must be a number.');
      if (t === 'int' && !Number.isInteger(v)) return fail(errors, path, 'Must be a whole number.');
      if (spec.min !== undefined && v < spec.min) return fail(errors, path, `Must be at least ${spec.min}.`);
      if (spec.max !== undefined && v > spec.max) return fail(errors, path, `Must be at most ${spec.max}.`);
      return v;
    }
    case 'boolean': {
      let v = value;
      if (spec.coerce && (v === 'true' || v === 'false')) v = v === 'true';
      if (typeof v !== 'boolean') return fail(errors, path, 'Must be true or false.');
      return v;
    }
    case 'enum': {
      if (!spec.values.includes(value)) return fail(errors, path, `Must be one of: ${spec.values.join(', ')}.`);
      return value;
    }
    case 'array': {
      if (!Array.isArray(value)) return fail(errors, path, 'Must be a list.');
      if (spec.min !== undefined && value.length < spec.min) return fail(errors, path, `Provide at least ${spec.min}.`);
      if (value.length > (spec.max ?? 100)) return fail(errors, path, `Provide at most ${spec.max ?? 100}.`);
      const out = []; let ok = true;
      value.forEach((x, i) => { const r = clean(spec.item, x, `${path}[${i}]`, errors); if (errors[`${path}[${i}]`] || (typeof r === 'object' && r !== null && Object.keys(errors).some((k) => k.startsWith(`${path}[${i}]`)))) ok = false; out.push(r); });
      return ok ? out : undefined;
    }
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(errors, path, 'Must be an object.');
      return cleanObject(spec.shape, value, path, errors);
    }
    case 'json': {
      if (value === null || typeof value !== 'object') return fail(errors, path, 'Must be an object or list.');
      if (JSON.stringify(value).length > (spec.maxBytes || 8000)) return fail(errors, path, 'Too large.');
      return value;
    }
    default: return fail(errors, path, 'Unsupported field type.');
  }
}

function cleanObject(shape, input, prefix, errors) {
  const out = {};
  for (const [key, spec] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key;
    let v = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined;
    if (v === undefined || (v === null && !spec.nullable) || (v === '' && spec.type !== 'string')) {
      if (spec.required) { errors[path] = 'Required.'; continue; }
      if (spec.default !== undefined) out[key] = typeof spec.default === 'function' ? spec.default() : spec.default;
      continue;
    }
    const before = Object.keys(errors).length;
    const r = clean(spec, v, path, errors);
    if (Object.keys(errors).length === before && r !== undefined) out[key] = r;
  }
  return out;
}

/** Validate `input` against `shape`; returns cleaned object (unknown keys dropped) or throws 400 with field errors. */
export function validate(input, shape) {
  const errors = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = cleanObject(shape, src, '', errors);
  if (Object.keys(errors).length) throw httpError(400, 'validation_error', 'Please check the highlighted fields.', errors);
  return out;
}
