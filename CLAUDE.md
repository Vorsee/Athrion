# ATHRION

Fitness PWA: AI training plans, workout logging, calorie tracking, progress. Live at https://athrion.app.

## Stack
- React 18 + Vite 5 + Tailwind. Pages lazy-loaded in `src/App.jsx` (Workout is eager).
- Supabase: Postgres with RLS, Edge Functions (Deno), Storage, pg_cron. Project ref `dbpxxhqcsfypxjcdalca`.
- Vercel: static site + `api/` routes for Stripe (checkout, cancel, webhook).
- Claude API in `supabase/functions/generate-fitness-plan` (model `claude-opus-5-5`) and `analyze-meal`.
- Capacitor wrappers in `android/` and `ios/` (not built yet; needs Xcode / Android Studio).

## Commands
- `npm run dev` · `npm test` · `npm run coverage` · `npm run build`
- `npm run icons` after adding any `mdi:` icon (icons are bundled offline in `src/lib/icons.json`; a test fails if one is missing)

## Deploying (always ask the user first)
- Site: `vercel --prod --yes` (CLI deploys; not connected to git).
- Functions: `supabase functions deploy <name>`; `send-reminders` needs `--no-verify-jwt` (cron calls it with `x-cron-secret`).
- Migrations: `supabase db query --linked -f supabase/NNN_*.sql`. Live DB changes need the user's explicit OK. Mind order when the app and DB must change together (e.g. 006 before 007).
- GitHub `Vorsee/Athrion` is PUBLIC. Working branch `progress-update-v1`. Never commit secrets (`.env.local` is ignored).
- Backup tags: `backup-2frame-demos`, `backup-old-design`.

## Layout
- `src/pages`, `src/components`, `src/lib` (data access in `api.js`, `fitnessApi.js`, `progressApi.js`, `groupApi.js`).
- Edge Function logic lives in plain modules (`plan.ts`, `reminders.ts`) so Vitest can test it; `vite.config.js` aliases the Deno imports.
- `tests/`: Vitest + Testing Library, TZ forced to America/New_York. Supabase mock: `tests/helpers/supabaseMock.js`.

## Conventions
- Dates: use `todayKey()` / `localDateKey()` from `src/lib/data.js`, never `toISOString().slice(0, 10)` (UTC bug).
- Pro features are gated twice: UI via `components/ProLock.jsx`, and server-side in the Edge Function. "Get Pro" goes straight to Stripe (`goUpgrade` in App).
- Design: sentence-case text, no emoji in UI, `mdi:` line icons, minimum text-gray-400 and 11-12px, no glows. Colours unchanged (neon `#C8F135` on dark). Light theme overrides live in `src/index.css`; add a mapping when using a new grey.
- Bottom nav has 4 tabs; Library and Group open from Workout (`PARENT_TAB` in `components/Nav.jsx`).
- The exercise demo animation is commented out on purpose in `ExerciseDemo.jsx` until an ExerciseDB HD licence is bought.

## Open items
- Check Stripe webhook failed deliveries (payment routes were broken until Oct 2026 by a bad `SUPABASE_URL` on Vercel).
- Privacy policy (`public/privacypolicy.html`) is a draft.
- Not yet tested on a real device: push notifications, barcode camera, health sync.
