# ATHRION

Fitness PWA: AI training plans, workout logging, calorie tracking, progress. Live at https://athrion.app.

## Stack
- React 18 + Vite 5 + Tailwind. Pages lazy-loaded in `src/App.jsx` (Workout is eager).
- Supabase: Postgres with RLS, Edge Functions (Deno), Storage, pg_cron. Project ref `dbpxxhqcsfypxjcdalca`.
- Vercel: static site + `api/` routes for Stripe (checkout, cancel, webhook). Checkout sells `monthly` / `annual` from `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` (live prices $4.99 / $49.99 since Oct 27 2026, before that $7.99 / $59.99; `scripts/move-to-new-prices.mjs` moves older subscriptions) with a 7-day trial for first-time subscribers. Displayed prices live in `src/lib/pricing.js` and must match Stripe.
- Claude API in `supabase/functions/generate-fitness-plan` (model `claude-opus-5-5`) and `analyze-meal`.
- Capacitor wrappers in `android/` and `ios/` (not built yet; needs Xcode / Android Studio).

## Commands
- `npm run dev` · `npm test` · `npm run coverage` · `npm run build`
- `npm run icons` after adding any `mdi:` icon (icons are bundled offline in `src/lib/icons.json`; a test fails if one is missing)

## Deploying (always ask the user first)
- Site: `vercel --prod --yes` (CLI deploys; not connected to git).
- Functions: `supabase functions deploy <name>`; `send-reminders` needs `--no-verify-jwt` (cron calls it with `x-cron-secret`).
- Migrations: `supabase db query --linked -f supabase/NNN_*.sql` (from Claude's shell this times out; the user pastes the SQL into the dashboard SQL editor). Live DB changes need the user's explicit OK. Mind order when the app and DB must change together (e.g. 006 before 007). Latest applied: 009 (`009_social.sql`: nicknames, friends, monthly points, `close-month` cron on the 1st at 12:00 UTC). 010 (prizes for people already paying) applied. 011 (notifications) applied. Written, not yet applied: 012 (`012_group_realtime.sql`, realtime for Train together rooms; rooms also poll every 3 s, so the app works without it), 013 (`013_group_set_plan.sql`, rooms planned set by set; optional, the app falls back to the old columns), 014 (`014_coaches.sql`, coaches and the shop; apply before deploying the shop, then add yourself to `app_admins`), 015 (`015_cardio.sql`, runs and swims on Progress > Cardio; apply before deploying it).
- GitHub `Vorsee/Athrion` is PUBLIC. Working branch `progress-update-v1`. Never commit secrets (`.env.local` is ignored).
- Backup tags: `backup-2frame-demos`, `backup-old-design`.

## Layout
- `src/pages`, `src/components`, `src/lib` (data access in `api.js`, `fitnessApi.js`, `progressApi.js`, `groupApi.js`).
- Edge Function logic lives in plain modules (`plan.ts`, `reminders.ts`) so Vitest can test it; `vite.config.js` aliases the Deno imports.
- `tests/`: Vitest + Testing Library, TZ forced to America/New_York. Supabase mock: `tests/helpers/supabaseMock.js`.

## Conventions
- Dates: use `todayKey()` / `localDateKey()` from `src/lib/data.js`, never `toISOString().slice(0, 10)` (UTC bug).
- Train together (`pages/Group.jsx`) has Rooms / Leaderboard / Friends tabs (`components/Social.jsx`, `lib/socialApi.js`). Points are counted on the server (`month_points` in 009) and the rules are repeated in `src/lib/points.js`; change both together. On the 1st, `close_month()` saves the month; the top 3 on Everyone win a free month. Non-paying winners get `subscriptions.comp_pro_until`; winners paying through Stripe are handled by `api/monthly-prizes.js` (Vercel cron, daily 14:00 UTC, needs `CRON_SECRET`), which moves their next charge a month later via `trial_end`. `monthly_scores.prize_given_at` marks a prize as handed out. Pro = Stripe `status='pro'` or `comp_pro_until` in the future (`fetchProState` in `api.js`, both AI Edge Functions). Invite links: `/add/<nickname>`. Free plan page: `/workout` (`pages/Guide.jsx`).
- Train together rooms are planned set by set: `group_sessions.plan` = `[{ name, sets: [{ reps, rest }] }]` (013), helpers in `src/lib/groupPlan.js`; rest is the seconds after that set, so a last set's rest is the break before the next exercise. Only the host edits the room. `saveSessionPlan` also writes `exercises` / `total_sets` / `rest_secs` for older clients.
- Coaches and the shop (014): `pages/Coach.jsx` (apply, dashboard, editor, admin review of applications), `components/Shop.jsx` (Library → Coaches tab), data in `src/lib/coachApi.js`. Coaches apply (`coach_profiles.status` pending → an admin in `app_admins` approves via `review_coach`), then publish `coach_products` (workout or 7-day plan, free or $2.99-$500). The listing (with `outline`) is public to signed-in users; `coach_product_content` (sets, tips, video paths) and the private `coach-videos` bucket (`<coach id>/<product id>-<time>.<ext>`) are readable only through `can_view_product` (owner, buyer, or free). `coach_profiles` has column grants: never `select('*')`, use `COACH_COLUMNS`. Paid sales: `api/coach-connect.js` (Stripe Connect Express onboarding, status, dashboard link) and `api/coach-checkout.js` (destination charge, `application_fee_amount` = `COACH_FEE_RATE` 20%, in `api/_coach-fee.js` and `src/lib/pricing.js`, a test keeps them equal). The webhook records `coach_purchases` for sessions with `metadata.kind = 'coach_product'` (and never treats them as Pro), and marks them refunded on `charge.refunded`. Bought workouts start like plan days (`toPlanDay` → `handleStartPlanDay`), carrying `coachTip` / `coachVideo` into `Workout.jsx` (`CoachNote`). Links: `/?open=coach`, `/?open=shop&product=<id>[&paid=1]`.
- Notifications: every event is a row in `notifications` (the header bell, `components/NotificationsSheet.jsx`, `lib/notifications.js`), written by database triggers in 011 (friend request/accept, badge, 12-day target, month result). Rows with `push` true are pushed by `send-reminders` (`{ deliver: id }`), which also sends the daily reminder with a short summary and the Sunday recap (hourly cron), and "your workout is still open" (`{ open: true }`, every 15 min) from `open_workouts`, which `Workout.jsx` mirrors via `syncOpenWorkout`. Per-type push switches are `reminder_settings.notify_*`. A notification links to `/?open=friends|ranks|workout|progress|notifications`, handled by `openTarget` in App. Badge names are repeated in 011 (a test checks them against `lib/badges.js`).
- Pro features are gated twice: UI (`components/ProLock.jsx`, or an inline Pro tag), and server-side in the Edge Function. Pro = AI plan, adaptive targets, AI photo meal scan, unlimited saved workouts; one list in `PRO_FEATURES` (`src/lib/pricing.js`). Calorie logging, barcode and targets are free. "Get Pro" opens `UpgradeSheet` (`goUpgrade` in App), which then goes to Stripe.
- Weights are stored in lb everywhere; show and read them through `useUnit()` / `fromLb` / `toLb` in `src/lib/units.js` (the person's `weight_unit`), never hardcode "lb".
- Design: sentence-case text, no emoji in UI, `mdi:` line icons, text 12px minimum (`text-2xs` 11px only for chart axes and tags), no glows. Colours are CSS variable tokens in `src/index.css` (dark on `:root`, light on `.light`), used through Tailwind names (`bg-surface`, `text-ink`, `text-muted`, `text-neon-ink`…); no raw hex or `text-gray-*` in JSX. Neon `#C8F135` stays the accent. Shared building blocks are in `src/components/ui/` (`PageHeader`, `ExerciseRow`, `ActionRow`, `BigNumber`, `StatTiles`, `InfoButton`/`Fact`): big title with neon fact chips, one-line rows, explanations behind ⓘ rather than on the page; spec and rubric in `.design/` (gitignored).
- Brand is written "ATHRION" everywhere in the UI.
- Bottom nav has 4 tabs: Train, Plan, Food, Progress (page keys `workout`, `plan`, `calories`, `progress`). Library and Group open from Train (`PARENT_TAB` in `components/Nav.jsx`). Pushed sub-screens use `useBackHandler` from `src/lib/shell.js` (header back and the phone's back gesture), not their own back buttons.
- The exercise demo animation is commented out on purpose in `ExerciseDemo.jsx` until an ExerciseDB HD licence is bought.

## Legal
- Operator: BABUSHKAKNOWSBETTER LLC (Georgia, US); contact athrionsportapp@gmail.com. Pages: `public/privacypolicy.html` (also `/privacy`, with the consumer health data section at `#health-data`, linked from the landing footer as Washington's law asks) and `public/terms.html` (`/terms`).
- Sign-up needs two boxes (terms, and explicit health-data consent); saved in `user_metadata` via `consentMetadata()` in `src/lib/legal.js`. Bump `LEGAL_VERSION` there after a material policy change: everyone then sees the one-time `ConsentScreen` (`components/LegalConsent.jsx`). Keep the test user's version in `tests/helpers/supabaseMock.js` in step.
- Profile → Your data: Import from Strong or Hevy (`src/lib/importWorkouts.js`: CSV → `workout_logs`, names matched to `EXERCISES`, skips day+name duplicates; imported workouts count toward points like any log), Download my data (`src/lib/account.js`, client-side JSON) and Delete account (`api/delete-account.js`: cancels Stripe now, removes photos and every user table, then the auth user). A new user table must be added to `USER_ROWS` there and `EXPORT_TABLES` in `account.js`.
- Minimum age 16 (onboarding age picker); coaches 18+ (coach terms checkbox). Terms: shop at `#shop`, coaches at `#coaches`.
- No third-party trackers or Google Fonts (DM Sans is bundled via `@fontsource-variable/dm-sans`); keep it that way or the policy and cookie stance change.

## Open items
- Live checkout and webhook verified Oct 2026 (webhook secret replaced with the live endpoint's). Payment calls go through `postAsUser` in `src/lib/stripe.js`, which renews an expired token.
- After the first deploy with the new checkout works, remove `VITE_STRIPE_PRICE_ID` from Vercel. Confirm `STRIPE_SECRET_KEY` there is the live key.
- Plan generation takes 30-60s (Opus, ~3.5-4.5k output tokens). Ideas: `AI_MODEL=claude-sonnet-5-5` secret, drop the nutrition section the server overwrites anyway, shorten per-exercise notes, show progress steps.
- Coach shop setup in Stripe: turn on Connect (Express) for the platform, and add `charge.refunded` to the webhook's events. Refund coach sales from the Stripe dashboard with "reverse transfer" so the coach's share comes back. Check the Supabase Storage global file size limit allows 100 MB videos.
- Not built yet: RPE / warm-up sets / supersets, Apple/Google sign-in.
- Not yet tested on a real device: push notifications, barcode camera, health sync.
