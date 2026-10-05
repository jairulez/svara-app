import { IntegrationProvider } from './provider.js';

/** Declarative placeholders. Each becomes a NotImplemented stub provider with status 'planned'. */
const DECLARATIONS = [
  { id: 'apple_health', name: 'Apple Health', category: 'health_platform', description: 'Read sleep, activity and heart-rate summaries from Apple Health on iOS (via the native app).', dataTypes: ['sleep', 'activity', 'heart_rate'], requiresConsent: ['health_data_sync'] },
  { id: 'google_health_connect', name: 'Google Health Connect', category: 'health_platform', description: 'Read sleep and activity summaries from Health Connect on Android (via the native app).', dataTypes: ['sleep', 'activity'], requiresConsent: ['health_data_sync'] },
  { id: 'wearables', name: 'Wearables', category: 'device', description: 'Aggregated readings from smart rings, watches and bands through vendor APIs.', dataTypes: ['sleep', 'activity', 'hrv'], requiresConsent: ['health_data_sync'] },
  { id: 'sleep_trackers', name: 'Sleep trackers', category: 'tracker', description: 'Nightly sleep duration and consistency from bedside or under-mattress trackers.', dataTypes: ['sleep'], requiresConsent: ['health_data_sync'] },
  { id: 'fitness_trackers', name: 'Fitness trackers', category: 'tracker', description: 'Workout and movement summaries to give context to recovery check-ins.', dataTypes: ['activity', 'workouts'], requiresConsent: ['health_data_sync'] },
  { id: 'nutrition_trackers', name: 'Nutrition trackers', category: 'tracker', description: 'Optional meal-timing and hydration context from nutrition apps.', dataTypes: ['nutrition'], requiresConsent: ['health_data_sync'] },
  { id: 'clinician_networks', name: 'Clinician networks', category: 'clinical', description: 'Directory and credential verification for external licensed clinicians.', dataTypes: ['clinician_profiles'], requiresConsent: [], direction: 'inbound' },
  { id: 'telemedicine', name: 'Telemedicine', category: 'clinical', description: 'Video consultation scheduling and hand-off for consented clinician reports.', dataTypes: ['appointments'], requiresConsent: ['clinician_sharing'], direction: 'bidirectional' },
  { id: 'payments', name: 'Payments', category: 'commerce', description: 'Payment processing. Disabled until regulatory approvals are in place.', dataTypes: ['payment_intents'], requiresConsent: [], direction: 'outbound' },
  { id: 'ecommerce', name: 'E-commerce', category: 'commerce', description: 'Catalogue, orders and fulfilment for approved products only.', dataTypes: ['orders', 'inventory'], requiresConsent: [], direction: 'bidirectional' },
  { id: 'subscriptions', name: 'Subscriptions', category: 'commerce', description: 'Membership billing and entitlements.', dataTypes: ['subscriptions'], requiresConsent: [], direction: 'bidirectional' },
  { id: 'lab_results', name: 'Lab results', category: 'clinical', description: 'User-initiated import of lab reports for sharing with a consented clinician.', dataTypes: ['lab_reports'], requiresConsent: ['lab_data_import', 'clinician_sharing'] },
  { id: 'voice_ai', name: 'Voice AI', category: 'ai', description: 'Spoken check-ins and guide conversations with the same safety and claim guards as text.', dataTypes: ['audio_transcripts'], requiresConsent: ['ai_processing'], direction: 'bidirectional' },
  { id: 'whatsapp', name: 'WhatsApp', category: 'messaging', description: 'Opt-in reminders and one-question check-ins over WhatsApp Business.', dataTypes: ['messages'], requiresConsent: ['messaging_opt_in'], direction: 'bidirectional' },
  { id: 'mobile_apps', name: 'Mobile apps', category: 'client', description: 'Native iOS and Android clients using this same API.', dataTypes: [], requiresConsent: [], direction: 'bidirectional' },
];

export const stubProviders = DECLARATIONS.map((d) => new IntegrationProvider(d));
