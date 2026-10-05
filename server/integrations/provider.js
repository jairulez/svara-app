/**
 * Integration provider abstraction.
 * Every external connection (health platforms, wearables, payments, messaging, ...) implements this
 * interface. All current providers are placeholders with status 'planned'; none move any data.
 * Real implementations must: obtain explicit user consent per data type, minimise data, store tokens
 * encrypted outside this repo's DB, and write audit entries for connect/disconnect/sync.
 */
export class NotImplementedError extends Error {
  constructor(provider, method) {
    super(`Integration "${provider}" is planned and does not implement ${method}() yet.`);
    this.name = 'NotImplementedError';
    this.status = 501;
    this.code = 'not_implemented';
  }
}

export const STATUSES = ['planned', 'in_development', 'beta', 'live', 'disabled'];

export class IntegrationProvider {
  /** @param {{id:string,name:string,category:string,description:string,dataTypes?:string[],requiresConsent?:string[],direction?:string}} meta */
  constructor(meta) {
    this.id = meta.id; this.name = meta.name; this.category = meta.category; this.description = meta.description;
    this.dataTypes = meta.dataTypes || []; this.requiresConsent = meta.requiresConsent || [];
    this.direction = meta.direction || 'inbound';
    this.status = 'planned';
  }
  /** Begin linking a user's account. Returns { redirectUrl } or { connected }. */
  async connect(_userId, _options) { throw new NotImplementedError(this.id, 'connect'); }
  async disconnect(_userId) { throw new NotImplementedError(this.id, 'disconnect'); }
  /** Pull (or push) data since a cursor. Returns { records, cursor }. */
  async sync(_userId, _cursor) { throw new NotImplementedError(this.id, 'sync'); }
  /** Handle provider webhooks / callbacks after signature verification. */
  async handleWebhook(_headers, _rawBody) { throw new NotImplementedError(this.id, 'handleWebhook'); }
  describe() {
    return { id: this.id, name: this.name, category: this.category, status: this.status, description: this.description, data_types: this.dataTypes, requires_consent: this.requiresConsent, direction: this.direction };
  }
}
