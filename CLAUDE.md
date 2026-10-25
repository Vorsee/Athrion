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
- Migrations: `supabase db query --linked -f supabase/NNN_*.sql` (from Claude's shell this times out; the user pastes the SQL into the dashboard SQL editor). Live DB changes need the user's explicit OK. Mind order when the app and DB must change together (e.g. 006 before 007). Latest applied: 009 (`009_social.sql`: nicknames, friends, monthly points, `close-month` cron on the 1st at 12:00 UTC). Written, not yet applied: 010 (prizes for people already paying).
- GitHub `Vorsee/Athrion` is PUBLIC. Working branch `progress-update-v1`. Never commit secrets (`.env.local` is ignored).
- Backup tags: `backup-2frame-demos`, `backup-old-design`.

## Layout
- `src/pages`, `src/components`, `src/lib` (data access in `api.js`, `fitnessApi.js`, `progressApi.js`, `groupApi.js`).
- Edge Function logic lives in plain modules (`plan.ts`, `reminders.ts`) so Vitest can test it; `vite.config.js` aliases the Deno imports.
- `tests/`: Vitest + Testing Library, TZ forced to America/New_York. Supabase mock: `tests/helpers/supabaseMock.js`.

## Conventions
- Dates: use `todayKey()` / `localDateKey()` from `src/lib/data.js`, never `toISOString().slice(0, 10)` (UTC bug).
- Train together (`pages/Group.jsx`) has Rooms / Leaderboard / Friends tabs (`components/Social.jsx`, `lib/socialApi.js`). Points are counted on the server (`month_points` in 009) and the rules are repeated in `src/lib/points.js`; change both together. On the 1st, `close_month()` saves the month; the top 3 on Everyone win a free month. Non-paying winners get `subscriptions.comp_pro_until`; winners paying through Stripe are handled by `api/monthly-prizes.js` (Vercel cron, daily 14:00 UTC, needs `CRON_SECRET`), which moves their next charge a month later via `trial_end`. `monthly_scores.prize_given_at` marks a prize as handed out. Pro = Stripe `status='pro'` or `comp_pro_until` in the future (`fetchProState` in `api.js`, both AI Edge Functions). Invite links: `/add/<nickname>`. Free plan page: `/workout` (`pages/Guide.jsx`).
- Pro features are gated twice: UI (`components/ProLock.jsx`, or an inline Pro tag), and server-side in the Edge Function. Pro = AI plan, adaptive targets, AI photo meal scan, unlimited saved workouts; one list in `PRO_FEATURES` (`src/lib/pricing.js`). Calorie logging, barcode and targets are free. "Get Pro" opens `UpgradeSheet` (`goUpgrade` in App), which then goes to Stripe.
- Weights are stored in lb everywhere; show and read them through `useUnit()` / `fromLb` / `toLb` in `src/lib/units.js` (the person's `weight_unit`), never hardcode "lb".
- Design: sentence-case text, no emoji in UI, `mdi:` line icons, text 12px minimum (`text-2xs` 11px only for chart axes and tags), no glows. Colours are CSS variable tokens in `src/index.css` (dark on `:root`, light on `.light`), used through Tailwind names (`bg-surface`, `text-ink`, `text-muted`, `text-neon-ink`…); no raw hex or `text-gray-*` in JSX. Neon `#C8F135` stays the accent. Shared building blocks are in `src/components/ui/` (`PageHeader`, `ExerciseRow`, `ActionRow`, `BigNumber`, `StatTiles`, `InfoButton`/`Fact`): big title with neon fact chips, one-line rows, explanations behind ⓘ rather than on the page; spec and rubric in `.design/` (gitignored).
- Brand is written "ATHRION" everywhere in the UI.
- Bottom nav has 4 tabs: Train, Plan, Food, Progress (page keys `workout`, `plan`, `calories`, `progress`). Library and Group open from Train (`PARENT_TAB` in `components/Nav.jsx`). Pushed sub-screens use `useBackHandler` from `src/lib/shell.js` (header back and the phone's back gesture), not their own back buttons.
- The exercise demo animation is commented out on purpose in `ExerciseDemo.jsx` until an ExerciseDB HD licence is bought.

## Open items
- Live checkout and webhook verified Oct 2026 (webhook secret replaced with the live endpoint's). Payment calls go through `postAsUser` in `src/lib/stripe.js`, which renews an expired token.
- After the first deploy with the new checkout works, remove `VITE_STRIPE_PRICE_ID` from Vercel. Confirm `STRIPE_SECRET_KEY` there is the live key.
- Plan generation takes 30-60s (Opus, ~3.5-4.5k output tokens). Ideas: `AI_MODEL=claude-sonnet-5-5` secret, drop the nutrition section the server overwrites anyway, shorten per-exercise notes, show progress steps.
- Not built yet: RPE / warm-up sets / supersets, Strong/Hevy import, Apple/Google sign-in, a 1200x630 `og:image`.
- Privacy policy (`public/privacypolicy.html`) is a draft.
- Not yet tested on a real device: push notifications, barcode camera, health sync.
