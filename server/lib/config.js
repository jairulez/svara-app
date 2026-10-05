import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Minimal .env loader (no dependency). Real env vars always win.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(env.PORT || 3000),
  publicUrl: env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`,
  dbPath: path.resolve(ROOT, env.DATABASE_PATH || './data/svara.db'),
  uploadDir: path.resolve(ROOT, 'data', 'uploads'),
  appSecret: env.APP_SECRET || 'dev-only-insecure-secret',
  demoMode: (env.DEMO_MODE ?? 'true') === 'true',
  commerceEnabled: env.COMMERCE_ENABLED === 'true',
  llm: { provider: env.LLM_PROVIDER || 'none', apiKey: env.ANTHROPIC_API_KEY || '', model: env.LLM_MODEL || 'claude-sonnet-5-5' },
  rate: {
    windowSec: Number(env.RATE_LIMIT_WINDOW_SEC || 60),
    max: Number(env.RATE_LIMIT_MAX || 120),
    authMax: Number(env.AUTH_RATE_LIMIT_MAX || 10),
  },
};

if (isProd && config.appSecret === 'dev-only-insecure-secret') {
  throw new Error('APP_SECRET must be set in production');
}
