import { IntegrationProvider } from './provider.js';
import { stubProviders } from './stubs.js';

const providers = new Map();

export function register(provider) {
  if (!(provider instanceof IntegrationProvider)) throw new TypeError('provider must extend IntegrationProvider');
  providers.set(provider.id, provider);
  return provider;
}
export const get = (id) => providers.get(id) || null;
export const list = () => [...providers.values()].map((p) => p.describe());

for (const p of stubProviders) register(p);
