# ATHRION

Fitness PWA: AI training plans, workout logging, calorie tracking, progress. Live at https://athrion.app.

## Stack
- React 18 + Vite 5 + Tailwind. Pages lazy-loaded in `src/App.jsx` (Workout is eager).
- Supabase: Postgres with RLS, Edge Functions (Deno), Storage, pg_cron. Project ref `dbpxxhqcsfypxjcdalca`.
- Vercel: static site + `api/` routes for Stripe (checkout, cancel, webhook). Checkout sells `monthly` / `annual` from `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` (live prices $7.99 / $59.99) with a 7-day trial for first-time subscribers. Displayed prices live in `src/lib/pricing.js` and must match Stripe.
- Claude API in `supabase/functions/generate-fitness-plan` (model `claude-opus-5-5`) and `analyze-meal`.
- Capacitor wrappers in `android/` and `ios/` (not built yet; needs Xcode / Android Studio).

## Commands
- `npm run dev` · `npm test` · `npm run coverage` · `npm run build`
- `npm run icons` after adding any `mdi:` icon (icons are bundled offline in `src/lib/icons.json`; a test fails if one is missing)

## Deploying (always ask the user first)
- Site: `vercel --prod --yes` (CLI deploys; not connected to git).
- Functions: `supabase functions deploy <name>`; `send-reminders` needs `--no-verify-jwt` (cron calls it with `x-cron-secret`).
- Migrations: `supabase db query --linked -f supabase/NNN_*.sql` (from Claude's shell this times out; the user pastes the SQL into the dashboard SQL editor). Live DB changes need the user's explicit OK. Mind order when the app and DB must change together (e.g. 006 before 007). Latest applied: 008 (`user_profiles.weight_unit`).
- GitHub `Vorsee/Athrion` is PUBLIC. Working branch `progress-update-v1`. Never commit secrets (`.env.local` is ignored).
- Backup tags: `backup-2frame-demos`, `backup-old-design`.

## Layout
- `src/pages`, `src/components`, `src/lib` (data access in `api.js`, `fitnessApi.js`, `progressApi.js`, `groupApi.js`).
- Edge Function logic lives in plain modules (`plan.ts`, `reminders.ts`) so Vitest can test it; `vite.config.js` aliases the Deno imports.
- `tests/`: Vitest + Testing Library, TZ forced to America/New_York. Supabase mock: `tests/helpers/supabaseMock.js`.

## Conventions
- Dates: use `todayKey()` / `localDateKey()` from `src/lib/data.js`, never `toISOString().slice(0, 10)` (UTC bug).
- Pro features are gated twice: UI (`components/ProLock.jsx`, or an inline Pro tag), and server-side in the Edge Function. Pro = AI plan, adaptive targets, AI photo meal scan, unlimited saved workouts; one list in `PRO_FEATURES` (`src/lib/pricing.js`). Calorie logging, barcode and targets are free. "Get Pro" opens `UpgradeSheet` (`goUpgrade` in App), which then goes to Stripe.
- Weights are stored in lb everywhere; show and read them through `useUnit()` / `fromLb` / `toLb` in `src/lib/units.js` (the person's `weight_unit`), never hardcode "lb".
- Design: sentence-case text, no emoji in UI, `mdi:` line icons, text 12px minimum (`text-2xs` 11px only for chart axes and tags), no glows. Colours are CSS variable tokens in `src/index.css` (dark on `:root`, light on `.light`), used through Tailwind names (`bg-surface`, `text-ink`, `text-muted`, `text-neon-ink`…); no raw hex or `text-gray-*` in JSX. Neon `#C8F135` stays the accent. Shared building blocks are in `src/components/ui/`; spec and rubric in `.design/` (gitignored).
- Brand is written "ATHRION" everywhere in the UI.
- Bottom nav has 4 tabs: Train, Plan, Food, Progress (page keys `workout`, `plan`, `calories`, `progress`). Library and Group open from Train (`PARENT_TAB` in `components/Nav.jsx`). Pushed sub-screens use `useBackHandler` from `src/lib/shell.js` (header back and the phone's back gesture), not their own back buttons.
- The exercise demo animation is commented out on purpose in `ExerciseDemo.jsx` until an ExerciseDB HD licence is bought.

## Open items
- Check Stripe webhook failed deliveries (payment routes were broken until Oct 2026 by a bad `SUPABASE_URL` on Vercel).
- After the first deploy with the new checkout works, remove `VITE_STRIPE_PRICE_ID` from Vercel. Confirm `STRIPE_SECRET_KEY` there is the live key.
- Not built yet: RPE / warm-up sets / supersets, Strong/Hevy import, Apple/Google sign-in, a 1200x630 `og:image`.
- Privacy policy (`public/privacypolicy.html`) is a draft.
- Not yet tested on a real device: push notifications, barcode camera, health sync.
