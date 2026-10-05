import { config } from './config.js';

/**
 * Pluggable store interface (swap for Redis later):
 *   hit(key, windowMs, nowMs) -> Promise<{ count, oldest }>   // records a hit, returns hits within window
 *   peek(key, windowMs, nowMs) -> Promise<{ count, oldest }>  // no recording
 */
export class MemoryStore {
  constructor() {
    this.map = new Map();
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref?.();
    this.maxWindow = 0;
  }
  _trim(arr, windowMs, nowMs) {
    const cut = nowMs - windowMs;
    let i = 0; while (i < arr.length && arr[i] <= cut) i++;
    if (i) arr.splice(0, i);
  }
  async hit(key, windowMs, nowMs = Date.now()) {
    this.maxWindow = Math.max(this.maxWindow, windowMs);
    let arr = this.map.get(key);
    if (!arr) { arr = []; this.map.set(key, arr); }
    this._trim(arr, windowMs, nowMs);
    arr.push(nowMs);
    return { count: arr.length, oldest: arr[0] };
  }
  async peek(key, windowMs, nowMs = Date.now()) {
    const arr = this.map.get(key) || [];
    this._trim(arr, windowMs, nowMs);
    return { count: arr.length, oldest: arr[0] };
  }
  async reset(key) { this.map.delete(key); }
  sweep() {
    const nowMs = Date.now();
    for (const [k, arr] of this.map) {
      this._trim(arr, this.maxWindow || 60_000, nowMs);
      if (!arr.length) this.map.delete(k);
    }
  }
  close() { clearInterval(this.timer); }
}

/** Sliding-window limiter with named buckets. */
export function createLimiter({ store = new MemoryStore(), windowSec = config.rate.windowSec, buckets } = {}) {
  const max = config.rate.max;
  const defs = buckets || {
    default: max,
    auth: config.rate.authMax,
    heavy: Math.max(1, Math.ceil(max / 4)),
  };
  const windowMs = windowSec * 1000;
  return {
    store,
    async check(bucket, ip) {
      const limit = defs[bucket] ?? defs.default;
      const nowMs = Date.now();
      const { count, oldest } = await store.hit(`${bucket}:${ip || 'unknown'}`, windowMs, nowMs);
      const allowed = count <= limit;
      return { allowed, limit, remaining: Math.max(0, limit - count), retryAfter: allowed ? 0 : Math.max(1, Math.ceil(((oldest || nowMs) + windowMs - nowMs) / 1000)) };
    },
    /** Generic keyed limiter for e.g. per-account login attempts. */
    async hitKey(key, limit, windowMsOverride) {
      const nowMs = Date.now();
      const { count } = await store.hit(key, windowMsOverride, nowMs);
      return { allowed: count <= limit, count };
    },
    async peekKey(key, limit, windowMsOverride) {
      const { count } = await store.peek(key, windowMsOverride, Date.now());
      return { allowed: count < limit, count };
    },
    async resetKey(key) { await store.reset?.(key); },
  };
}
