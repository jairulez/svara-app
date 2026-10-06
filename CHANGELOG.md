# Svara app change log (Node app, Render)

No secrets in this file. Times IST.

## v0.1.0 deploy - 2026-10-05
- Source: owner-supplied zip (Claude-built project, package version 0.1.0). 29 of 29 tests pass locally.
- Uploaded 64 source files unchanged. Not uploaded: data/ (SQLite files), __MACOSX, node_modules.
- Added deploy-only files: render.yaml, DEPLOY-NOTES.md, CHANGELOG.md.
- Left as in the zip on purpose (owner instruction "keep exactly"): content and articles including hemp/Vijaya/CBD education, 4 sample products with rupee prices (marked DEMO, not for sale), design, demo personas with the documented synthetic demo password.
- Config: DEMO_MODE on, commerce off, no LLM.
- Related repos: jairulez/svara (Supabase customer app), svara-clinician, svara-admin (separate earlier build, Supabase project epedefnrawpwdbbkyopc).

## Render deploy and live check - 2026-10-06
- Deployed to Render free plan as web service "svara" from this repo via render.yaml Blueprint (commit 46cddd6). Live URL: https://svara-9b5x.onrender.com
- No code or content changes. No card or payment details on the Render account for this service.
- Checked live: /api/health 200; landing, explore, home, check-in, guide, routines, find, weekly, trends, privacy, products, /pro and /admin load at 390px phone width with no horizontal overflow and the demo banner showing; API checks for dashboard, trends, weekly, export, access history, clinician and admin endpoints return 200.
- Privacy delete tested on a throwaway sign-up: wrong password is rejected (403), correct password deletes the account, login afterwards fails.
- Guide: normal question answered from the user's own data; dosage question declined; crisis message returns support and helpline text.
- Known limits: free instance sleeps after idle (first load can take about 50 seconds); SQLite lives in /tmp and resets on restart or redeploy, so data does not persist. Google login and magic link are off (coming soon).
- Rollback: delete the Render service "svara" (or Blueprint "svara-app") in the Render dashboard. The repo is unaffected.
