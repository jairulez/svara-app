-- SVARA schema v1. UUID text primary keys, timestamps everywhere (ISO-8601 UTC).
-- Written for SQLite in the preview; types map 1:1 to PostgreSQL (uuid, timestamptz, jsonb).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,                       -- scrypt; NULL for magic-link/OAuth-only accounts
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','CLINICIAN','ADMIN')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  auth_provider TEXT NOT NULL DEFAULT 'password',   -- password | google | magic_link
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,          -- HMAC of cookie token; raw token never stored
  csrf_token TEXT NOT NULL,
  ip_hash TEXT, user_agent TEXT,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT, age_range TEXT, timezone TEXT DEFAULT 'UTC',
  lifestyle TEXT DEFAULT '{}',              -- JSON: activity_level, work_pattern, sleep_schedule
  preferences TEXT DEFAULT '{}',            -- JSON: checkin_frequency, questions_per_day, notifications, focus_areas, max_sensitivity
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('terms','privacy','ai_processing','clinician_sharing','marketing','analytics')),
  granted INTEGER NOT NULL,
  version TEXT NOT NULL DEFAULT '2025-01',
  detail TEXT DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_consents_user ON consents(user_id, type, created_at);

CREATE TABLE wellness_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_key TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, goal_key)
);

CREATE TABLE wellness_dimensions (
  id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, label TEXT NOT NULL, description TEXT,
  in_snapshot INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  pool TEXT NOT NULL CHECK (pool IN ('assessment','daily')),
  dimension TEXT NOT NULL,
  question TEXT NOT NULL,
  response_type TEXT NOT NULL CHECK (response_type IN ('scale5','slider','emoji','choice')),
  options TEXT NOT NULL DEFAULT '[]',       -- JSON array of 5 labels, ordered low->high value (1..5)
  reverse INTEGER NOT NULL DEFAULT 0,       -- 1 = a high answer means a *worse* state (score is inverted)
  sensitivity_level TEXT NOT NULL DEFAULT 'low' CHECK (sensitivity_level IN ('low','medium','high')),
  allowed_frequency_days INTEGER NOT NULL DEFAULT 3,
  active INTEGER NOT NULL DEFAULT 1,
  safety_category TEXT NOT NULL DEFAULT 'general_wellness',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE check_ins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES questions(id),
  dimension TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('assessment','baseline','daily')),
  raw_value INTEGER NOT NULL CHECK (raw_value BETWEEN 1 AND 5),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),  -- normalised, higher = feels better
  note TEXT,
  day TEXT NOT NULL,                        -- YYYY-MM-DD in user's local day
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_checkins_user_day ON check_ins(user_id, day);

CREATE TABLE daily_context (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  workload TEXT CHECK (workload IN ('light','moderate','heavy')),
  exercised INTEGER, late_screens INTEGER, note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, day)
);

CREATE TABLE wellness_scores (            -- one rolled-up score per user / dimension / day
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL, day TEXT NOT NULL, score REAL NOT NULL, samples INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, dimension, day)
);

CREATE TABLE trend_snapshots (            -- cached computed trends per window
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL, window_days INTEGER NOT NULL,
  current_score REAL, baseline_score REAL, change REAL, variability REAL, consistency REAL, direction TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, dimension, window_days)
);

CREATE TABLE routines (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT NOT NULL, duration_min INTEGER NOT NULL,
  steps TEXT NOT NULL, frequency TEXT NOT NULL, source_metadata TEXT DEFAULT '{}', safety_notes TEXT,
  dimensions TEXT DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE routine_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id TEXT NOT NULL REFERENCES routines(id),
  status TEXT NOT NULL CHECK (status IN ('started','completed','skipped')),
  day TEXT NOT NULL, started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE weekly_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL, content TEXT NOT NULL, viewed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, week_start)
);

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT, summary TEXT,                 -- rolling summary = CONVERSATION_MEMORY
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL, safety_category TEXT, meta TEXT DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE clinicians (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL, specialty TEXT, licence_reference TEXT, bio TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE clinician_assignments (
  id TEXT PRIMARY KEY,
  clinician_id TEXT NOT NULL REFERENCES clinicians(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(clinician_id, user_id)
);
CREATE TABLE clinician_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinician_id TEXT NOT NULL REFERENCES clinicians(id),
  range_days INTEGER,                       -- NULL = full history
  content TEXT NOT NULL,                    -- JSON snapshot at time of consented sharing
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','scheduled','in_consultation','completed','closed','revoked')),
  scheduled_for TEXT, consent_id TEXT REFERENCES consents(id), revoked_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE clinician_notes (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES clinician_reports(id) ON DELETE CASCADE,
  clinician_id TEXT NOT NULL REFERENCES clinicians(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note','decision','next_step','document')),
  body TEXT, file_name TEXT, file_path TEXT, visible_to_user INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, manufacturer TEXT,
  ingredients TEXT DEFAULT '[]', formulation TEXT, description TEXT,
  regulatory_category TEXT, regulatory_status TEXT NOT NULL DEFAULT 'DEMO_NOT_APPROVED',
  licence_reference TEXT, approved_claims TEXT DEFAULT '[]', restricted_claims TEXT DEFAULT '[]',
  required_disclaimer TEXT, lab_report_url TEXT, batch_information TEXT,
  price REAL, currency TEXT DEFAULT 'INR', stock INTEGER DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE product_batches (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_code TEXT NOT NULL, manufactured_on TEXT, expires_on TEXT, lab_report_url TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE product_regulatory_metadata (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  jurisdiction TEXT NOT NULL, authority TEXT, category TEXT, status TEXT, reference TEXT,
  valid_until TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE product_claims (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  claim TEXT NOT NULL, claim_type TEXT NOT NULL CHECK (claim_type IN ('approved','restricted')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE content (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, category TEXT NOT NULL,
  summary TEXT, body TEXT NOT NULL, read_minutes INTEGER DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','blocked')),
  claim_check TEXT DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE content_claims (
  id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  excerpt TEXT NOT NULL, rule_id TEXT, severity TEXT, resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE claim_rules (               -- configurable blocklist, edited from Admin without deploys
  id TEXT PRIMARY KEY, label TEXT NOT NULL, pattern TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'block',
  reason TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE safety_rules (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('EMERGENCY','POTENTIAL_CRISIS','ADVERSE_REACTION','PRODUCT_DOSAGE','MEDICATION_QUESTION','MEDICAL_QUESTION')),
  label TEXT NOT NULL, pattern TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE safety_events (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL, rule_label TEXT, source TEXT, excerpt TEXT, action TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY, actor_id TEXT, actor_role TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, subject_user_id TEXT,   -- subject_user_id powers "view access history"
  ip_hash TEXT, detail TEXT DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_audit_subject ON audit_logs(subject_user_id, created_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, read_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE analytics_events (          -- no PII: anonymous id is a salted hash of user id
  id TEXT PRIMARY KEY, name TEXT NOT NULL, anon_id TEXT, props TEXT DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_events_name ON analytics_events(name, created_at);

CREATE TABLE snapshot_shares (           -- public share cards: aggregate dimension scores only
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, scores TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE app_settings (              -- AI configuration and feature flags (Admin-editable)
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
