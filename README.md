# SVARA — *Your inner rhythm, understood.*

AI-assisted personal wellness intelligence platform (working preview / MVP). SVARA helps people **notice their own patterns** through lightweight check-ins, longitudinal data, reflective guidance, routines and optional clinician review.

> SVARA is **not** an AI doctor. It does not diagnose, prescribe, determine dosage, or claim that any product treats a condition. Clinicians retain professional authority. All products in this preview are **DEMO — NOT FOR SALE**.

## Run locally

Requires Node.js ≥ 22.13 (uses built-in `node:sqlite`; **zero npm dependencies**).

```bash
cd svara
cp .env.example .env        # optional; defaults work for the preview
npm run setup               # migrate + seed reference data + synthetic demo data
npm start                   # http://localhost:3000
```

`npm run seed -- --reset` rebuilds demo data. `npm test` runs engine + API tests. `npm run build` syntax-checks and produces `dist/`.

### Demo credentials (synthetic, `DEMO_MODE=true`)

Password for all: `SvaraDemo!2025`

| Role | Email | Notes |
|---|---|---|
| User A | maya@svara.demo | high energy, low relaxation, heavy workload; completed clinician consult → product-eligible (demo) |
| User B | arjun@svara.demo | good sleep, variable motivation; clinician report pending |
| User C | neha@svara.demo | variable sleep, high work stress |
| User D | rohan@svara.demo | balanced profile |
| Clinician | clinician@svara.demo | demo clinician portal |
| Admin | admin@svara.demo | admin dashboard |

Or click **Explore Svara** (`/explore`) for one-click demo sessions.

## Environment variables
See [.env.example](.env.example). Key ones: `APP_SECRET` (required in production), `DATABASE_PATH`, `DEMO_MODE`, `COMMERCE_ENABLED`, `LLM_PROVIDER` / `ANTHROPIC_API_KEY` / `LLM_MODEL` (optional — the preview runs on a deterministic engine with no paid integrations), rate-limit knobs.

## Folder structure
```
server/
  index.js            HTTP server, static + SPA fallback, security headers
  lib/                config, db (SQLite adapter), auth (scrypt, sessions), http router, rate limit, validation
  db/                 SQL migrations, seed.js, seed-data/ (questions, routines, content, products, rules)
  engine/             intelligence engine + AI agents (see below)
  routes/             REST API by area (public, auth, user, pro, admin, privacy)
  integrations/       provider interfaces + stubs (Apple Health, wearables, payments, WhatsApp…)
public/               vanilla ES-module SPA (no build step): index.html, styles.css, app.css, js/*
scripts/              migrate, seed, build
test/                 node:test suites
docs/                 CONTRACT.md (API + module contract), this architecture detail
```

## Architecture overview
- **Frontend**: dependency-free SPA, history-API router, role-aware shell, hand-rolled SVG charts, light/dark, mobile-first.
- **Backend**: `node:http` + small router; JSON API; sessions in HttpOnly cookies; CSRF header; RBAC (`USER`/`CLINICIAN`/`ADMIN`).
- **Database**: relational schema ([server/db/001_init.sql](server/db/001_init.sql)), UUID PKs, timestamps on every table. SQLite for the preview; the thin `db.js` adapter and portable SQL types map to PostgreSQL for production.
- **Intelligence engine** (`server/engine`): deterministic by default; optional LLM behind strict JSON-schema validation. Raw LLM output never writes to important records.

### AI agent architecture
`onboarding_agent · question_selection_agent · wellness_summary_agent · routine_agent · conversation_agent · report_agent · safety_agent · claim_compliance_agent` — each a module with input/output schemas ([agents.js](server/engine/agents.js)). Guide pipeline:

`user message → safety_agent (classify) → [non-normal: templated safe reply + log] → intent routing → memory.buildContext (only relevant slice) → generator (deterministic | LLM) → schema validation → claim_compliance_agent → output safety check → user`

Question selection only **selects** from the approved library; it never invents questions. Memory is structured (PROFILE, GOALS, PREFERENCES, WELLNESS_HISTORY, ROUTINES, CLINICIAN_CONTEXT, PRODUCT_CONTEXT, CONVERSATION_MEMORY) and retrieved per purpose.

### Product-discovery rule
`goal → education → context → optional clinician pathway → eligibility → appropriate product`. A low score never triggers a product. In commerce mode (`COMMERCE_ENABLED=true`) only products with `regulatory_status=APPROVED` **and** a licence reference are ever listed.

## API
See [docs/CONTRACT.md](docs/CONTRACT.md) for every endpoint, role and payload. Health: `GET /api/health`.

## Security architecture
scrypt password hashing (per-user salt, timing-safe compare); opaque session tokens (only HMAC stored), HttpOnly+SameSite cookies (Secure in prod); CSRF token on mutating requests; strict RBAC and per-object ownership checks; parameterised SQL only; schema validation on all inputs; output escaping (no innerHTML of data) + CSP; per-IP rate limiting (pluggable store); body-size caps; audit log for sensitive actions; generic errors; secrets from environment only; encryption-ready (field-level encryption hook via `APP_SECRET`-derived keys; use KMS in production).

## Privacy architecture
Consent rows are versioned history (latest wins). Clinician sharing is a per-report, explicit, revocable snapshot. Analytics use a salted-hash anonymous id and a whitelist of events/props (no PII, no health values). Users can export, delete (real cascade), toggle AI processing/marketing/analytics, and see who accessed their data. AI processing off ⇒ no AI features and no data to any LLM. Wellness data is never sold or used for advertising.

## Regulatory assumptions (preview)
- Positioned as **general wellness**, not a medical device or SaMD; no diagnosis, treatment recommendation, dosing or medication advice. Safety engine routes such questions to professionals.
- No product is assumed lawful anywhere. Demo products carry fabricated-free metadata and `DEMO_NOT_APPROVED`.
- Claim compliance is rule-based and configurable; it is a safety net, not legal approval.

## Deployment
Docker: `docker build -t svara . && docker run -p 3000:3000 -e APP_SECRET=... -e NODE_ENV=production -v svara-data:/app/data svara`. Any container PaaS (Cloud Run, Fly, Render, ECS, Railway) works; mount a persistent volume for SQLite **or** swap the adapter for managed PostgreSQL (recommended). Put behind TLS; set `NODE_ENV=production`, a strong `APP_SECRET`, `DEMO_MODE=false`, and run `npm run migrate`. Health check: `/api/health`.

## Must be replaced / completed before commercial launch
1. SQLite → managed PostgreSQL; add backups, PITR, field-level encryption with KMS.
2. In-memory rate limiter / sessions hygiene → Redis; add account lockout, email verification, password reset, MFA (esp. clinicians/admins).
3. Real magic-link (email provider) and Google OAuth (currently architecture stubs).
4. Real clinician onboarding: licence verification, credentialing, e-sign, telemedicine, e-prescription workflows (not built).
5. Real product data, licences, lab reports, batch records; payments, e-commerce, subscriptions (not built).
6. LLM provider contract (DPA, zero-retention), red-team evals for the safety classifier, clinician-reviewed crisis protocols and region-specific helplines.
7. Content medical review + references; localisation.
8. Observability, WAF, pen test, SOC2/ISO 27001 posture.

### Mock / demo integrations
Demo users and 90 days of synthetic history; demo clinician and consultations (no video/telemedicine); demo products (not for sale); payments, subscriptions, e-commerce (absent); Apple Health, Google Health Connect, wearables, trackers, nutrition, labs, WhatsApp, voice AI, mobile apps, clinician networks (stubs in `server/integrations`); Google OAuth and magic link (disabled stubs); LLM (optional, off by default); notifications are in-app only.

### Legal / regulatory reviews still required
Indian: DPDP Act 2023 (consent, children, cross-border, DPO), Telemedicine Practice Guidelines 2020 & NMC rules, Drugs & Cosmetics Act / AYUSH licensing, NDPS Act (cannabis/Vijaya/hemp — state-specific), FSSAI (if ingestibles), Consumer Protection Act & ASCI/DMRC (Drugs and Magic Remedies) advertising rules, CDSCO medical-device (SaMD) classification review. International: GDPR/UK GDPR, HIPAA applicability (if US), FDA/FTC claims rules, EU MDR, local cannabis/hemp rules. Also: terms, privacy policy, clinician agreements, liability/insurance, accessibility (WCAG) audit.
