# Train together: notes against the build spec

This compares *ATHRION build spec: train together + tracking* (written without seeing the code) with the app as of Nov 11, 2026 (commit `2340122`, branch `progress-update-v1`). It lists what the app already has, what's missing, where the spec doesn't fit, and a revised milestone list. **No app code changes until the owner approves the list. No deploys or live database changes without the owner's OK.**

## 1. What the app is (spec section 0.2 and questions 1–3)

| Spec asks | Answer |
|---|---|
| **Stack** | PWA: React 18 + Vite + Tailwind on Vercel (static site plus `api/` routes). No App Store or Play Store app yet; the Capacitor wrappers in `ios/` and `android/` have never been built. |
| **Backend** | Supabase: Postgres with row-level security, SECURITY DEFINER functions, triggers, Edge Functions (Deno), pg_cron. Stripe for Pro. |
| **Where rooms live** | Tables `group_sessions` (room, 6-letter `code`, `status` lobby / active / done, `plan`), `group_participants` and `group_sets` (`supabase/schema.sql`, sections 001c, 007 and 013). Client: `src/pages/Group.jsx`, `src/lib/groupApi.js`, `groupPlan.js`, `groupStandings.js`. |
| **How live sets travel** | Each set is a row inserted into `group_sets`. Clients subscribe to Supabase Realtime (`subscribeToGroupSession`) **and** poll every 3 s. Migration 012, which adds the tables to the realtime publication, has never been confirmed as run. So today the worst case is about 3 s, not about 1 s. |
| **Analytics** | None, on purpose. The privacy policy says "We don't use analytics trackers, advertising IDs, fingerprinting or location tracking", and CLAUDE.md says to keep it that way. |
| **Attribution / deep links** | None. Web paths kept through sign-up in localStorage play that role: `/add/<nickname>` (friends), `/swim/<code>` (swim team), `/trainer/<code>` (coach), `/shop/...` (with a signed-out preview from `api/shop-preview.js`). |
| **Push** | Web Push from the `send-reminders` Edge Function (rows in `notifications` with `push = true`; daily reminder, Sunday recap, "your workout is still open"). Settings has one on/off switch. Not yet tested on a real phone. |

## 2. Spec vs. code, feature by feature

Key: **Have** = exists and roughly meets the spec · **Part** = exists but short of the spec · **No** = missing · **Change** = the spec doesn't fit; see section 3.

### Feature A: train together in 3 taps

| Spec item | Status | What's there now |
|---|---|---|
| "Train together" button on Train | **No** | The Train together card was removed from Train. Rooms live on their own bottom tab, Together (Rooms / Friends / Leaderboard). `InviteFriendsCard` on Train offers the `/add` link to anyone without a friend. |
| After a solo workout: "Next time, train with someone" | **No** | Workout's done screen has share and save only. |
| Onboarding last step: "Who do you train with?" | **No** | Onboarding starts with the nickname step (so people are on the board from sign-up), then age (with the parent gate for 13–15), then stats. |
| Host: pick workout (today's plan / repeat last / empty) | **Part** | The host builds the room in the lobby by picking exercises and editing sets and rests (013), or makes it a free workout where everyone picks their own. There's no "use today's plan" or "repeat last workout" shortcut. |
| Host: tap Invite, which creates the room and opens the share sheet | **Part** | Create room makes it at once. The lobby has a **Copy code** button only: no share sheet, no link. |
| Codes: 6 characters from A–Z and 2–9, no 0/O, 1/I/L | **Have** | `SAFE_CHARS` in `groupApi.js` (no 0, O, 1, I; L is allowed). The code is unique across **all** rooms ever (a column constraint), and a collision isn't retried. |
| Code expires 12 h after last activity | **No** | Rooms stay lobby or active until the host ends them, and a room whose host walks away stays joinable forever. |
| Waiting screen: big code, copy, share again, who's joined | **Part** | Big code, Copy and the participant list are there. There's no share. Participants show as names with a Host tag, not avatars. |
| "Start now" with no one joined | **Have** | The host can start as soon as the plan has an exercise (a free room needs none). |
| Partners join mid-workout | **Part** | `join_group_session` accepts active rooms and polling moves a joiner from the lobby into training. Not tested end to end. |
| Universal links / app links | **Change** | It's a PWA: a web link `athrion.app/r/CODE` instead (see 3.1). |
| Install via store, code survives (deferred deep link) | **Change** | No store. The code is kept in localStorage through sign-up, as `/add` and `/swim` do (see 3.1). |
| Join with code field | **Part** | It's on Together → Rooms and uppercases what's typed. It doesn't advance by itself after 6 characters, and it isn't on Train. |
| Fast sign-up for joiners: Apple / Google, first name only, the rest later | **Part / Change** | Google and Apple buttons exist behind `VITE_OAUTH_PROVIDERS` but are switched off. Sign-up needs the two consent boxes, and onboarding needs a nickname and **age** before the app opens. Age can't be skipped (minimum 13, with a parent's approval for 13–15). Body stats, goals and the plan could wait (see 3.4). |
| Room preview before sign-up ("@alex invited you · Push day · 2 training") | **No** | The pattern exists: `ShopPreview.jsx` with `api/shop-preview.js` (service key, returns only public fields). |
| Live feed within about 1 s | **Part** | Live standings (`LiveBoard`) show where everyone is; the per-exercise board is there too. The speed depends on realtime (012). |
| Partner status ("Alex · Bench press · set 3") | **Have** | `standings()` gives each person's current exercise and set. |
| Reactions | **No / Change** | Nothing yet. The design rules allow no emoji in the UI, so reactions would use icons (for example `mdi:arm-flex`, `mdi:fire`, `mdi:skull-outline`). |
| Haptics | **Change** | `navigator.vibrate` works in Android Chrome only; iPhone Safari has no web haptics. |
| Different exercises allowed | **Have** | Free rooms: everyone picks their own (`PickerScreen`). Planned rooms keep everyone on the host's plan, but people can move on at their own pace. |
| Offline queue, no duplicates (client set id) | **No** | A room set is a direct insert; if it fails, it's only logged to the console. (Solo workouts do have an offline queue, `pendingWorkouts.js`.) `group_sets` has no client id column. |
| Room size up to 8 | **No** | No limit. |
| Host leaves → new host | **No** | Only the host can edit or end the room. If the host leaves, the room never ends. |
| Remove member, block, report | **No** | Friends can be removed. Rooms have no remove, and the app has no block or report anywhere. |
| Shared summary card 1080×1920 | **Part** | `lib/shareCard.js` and `ShareSheet` already draw story cards for solo workouts, swims and runs. The room's done screen has final standings but no share. |
| "Same time next week?" + 1-hour reminder | **No** | Push and pg_cron are ready to carry it. |
| "Beat it next time" (partner's numbers beside yours) | **Part** | The room keeps every person's sets, and `buildExerciseLeaderboard` ranks them per exercise. There's no comparison against your last session together. |
| Nudges: live / missed / solo after 3rd workout | **No** | The infrastructure is there: `notifications` rows with push, triggers and limits like the daily reminder's one a day. |
| Minors | (not in spec) | Under 16 can't host or join rooms (032/033 triggers). A minor opening a room link must get a clear message, not an error. |

### Feature B: invites and rewards

| Spec item | Status | What's there now |
|---|---|---|
| Personal invite link `athrion.app/i/<handle>` | **Have, different path** | `athrion.app/add/<nickname>`, shared from Friends and `InviteFriendsCard`. Keep `/add` (links are already out there). |
| Joining from it auto-adds the inviter | **Part** | The invitee sees "@x invited you" and taps Add, which sends a **request the inviter still has to accept** (`send_friend_request`). Since the inviter shared the link themselves, accepting at once would be fair. |
| Per-share `invite_id`, `channel` | **Change** | The Web Share API doesn't say which app was picked, so `channel` can only be `share_sheet` or `copy` (plus the `utm_source` if the person edits nothing). An `invite_id` in the link (`?i=<id>`) works fine. |
| Reward: free Pro for both after the first paired workout | **Part** | Free Pro by hand exists: `subscriptions.comp_pro_until` (used by the monthly prize, checked by `fetchProState` and both AI functions). For Stripe payers, `api/monthly-prizes.js` pushes the next charge back with `trial_end`. Nothing gives it for invites yet. |
| Fraud: same device, self-invite, N a month, 15 min and 6 sets each | **Part / Change** | Self-invite is already refused (`That's your own nickname`). "Same device" in a browser can only be a random id in localStorage (cleared with site data) plus the sign-up IP; weaker than a native device ID, and that should be said plainly. The rest can be checked on the server from `group_sets` (timestamps and counts per person). |
| Invites screen (sent → joined → trained together, rewards) | **No** | |
| Remote config for reward length and N | **No** | There's no config table. Either a small `app_config` table read by the server, or constants in one file. |

### Feature C: analytics

| Spec item | Status | What's there now |
|---|---|---|
| PostHog SDK, identify, super properties | **Change** | It conflicts with the privacy policy ("no analytics trackers") and the "no third-party trackers" rule. See 3.2 for a first-party option. |
| Event list | **No** | Much of it can already be counted from tables we keep: rooms, participants, sets, workouts, friendships, subscriptions, notifications. |
| North star: weekly paired workouts | **Countable today** | A room with sets from at least 2 people, by week. The `tog` part of `month_points` already finds "trained in a room with someone". |
| UTM tags through to the store | **Change** | No store. Keep `utm_*` through sign-up (localStorage, like the invite paths) and save it on the profile as the acquisition source. |
| Dashboards | **No** | Without PostHog these would be SQL views plus a page that only admins can see. |
| Opt-out, delete with the account | **Part** | Delete account removes every user table (`USER_ROWS` in `api/delete-account.js`), so a first-party events table gets the same treatment. |

## 3. Where the spec doesn't fit (decisions for the owner)

### 3.1 Room links in a PWA (replaces universal links, Branch, Play Install Referrer, clipboard)
- **The route:** `athrion.app/r/<CODE>`. It works the same way as `/add`, `/swim` and `/trainer`:
  - App.jsx matches the path.
  - It keeps the code in localStorage (`athrion_room_invite`) and clears the URL.
  - Signed out, it shows a room preview with Create account / Sign in.
  - Signed in, or right after sign-up and onboarding, it joins the room and opens it.
- **Gap 1, the email confirmation link.** If sign-up asks people to confirm their email, the link they tap may open in another browser or in Gmail's in-app browser, where the localStorage code is gone. Fix: also save the code in the sign-up `user_metadata` (as the consent flags are), and read it on first sign-in.
- **Gap 2, iPhone home-screen apps.** A PWA added to the home screen has its own storage, separate from Safari. A link tapped in Messages opens in Safari, not in the home-screen app. So joining happens in Safari, which is acceptable: the person is signed in there after sign-up. Worth saying in the preview ("Open in Safari" is fine).
- **No new SDKs.** No Branch, AppsFlyer, ATT or IDFA. When the native app comes, `/r/CODE` can become a universal link through `apple-app-site-association` on the same paths, so the links already shared keep working.

### 3.2 Analytics without a third-party tracker (replaces PostHog)
- **Recommended:** a first-party `app_events` table in Supabase (`user_id`, `name`, `props jsonb` with internal IDs only, `created_at`), written through one helper (`track(name, props)`), with RLS allowing insert-own only. Server-side events (room started, paired workout, reward) get written by triggers, so they can't be skipped.
  - Dashboards become SQL views plus an admin-only page. The headline charts are the paired-vs-solo retention and weekly paired workouts.
- **What changes in the policy:** the privacy policy needs a sentence like "we record which features you use, in our own database, to improve the app", plus an opt-out in Settings. That still keeps "no third-party trackers" true.
- **If PostHog is still wanted:** the policy, the "no trackers" claim on the landing page (trust tile) and the FAQ all have to change, and it needs a consent choice. That's an owner decision.

### 3.3 Reward and the leaderboard prize
- **Paying users:** `comp_pro_until` already gives Pro to people who don't pay. For Stripe payers, reuse the `monthly-prizes` approach (push the next charge with `trial_end`).
- **Owner decides:** the reward length and N a month.
- **Who's in the room:** the reward should count only the inviter and invitee being in the same room, not any two people.
- **Minors:** under 16 can't be in rooms, so they can't earn it. That's consistent with 032.

### 3.4 Fast sign-up for joiners
- **Can't be dropped:**
  - The two consent boxes (terms, health data).
  - The nickname (the leaderboard and room names use it).
  - Age, because of the 13+ minimum and the parent gate for 13–15.
- **Can wait until after the first room workout:** body stats, goals and the plan, along with everything else that comes after age in onboarding. That means letting someone with no fitness profile into Together, which the app shell currently doesn't expect, so it needs care and tests.

### 3.5 Smaller conflicts
- **Reactions:** use icons, not emoji (design rule).
- **iPhone haptics:** not possible on iPhone web.
- **Share-sheet channel:** the web can't detect it.
- **"Avatars":** profile photos exist only for swim teams. Rooms would show initials in a coloured circle, as the landing page does.
- **Spec's "Home screen":** this is the Train tab.
- **Realtime:** run 012 (and add `group_sessions` if it's missing) before promising about 1 s; keep the 3-second polling as the fallback.

## 4. Revised milestones

Each one is its own commit set on `progress-update-v1`. Each runs the tests before push, and goes live only with the owner's OK. Database changes are new `supabase/NNN_*.sql` files the owner runs.

| # | Milestone | Contents | Database | Done when |
|---|---|---|---|---|
| **R0** | Make rooms solid | <ul><li>Confirm 012 (realtime) and run it if missing.</li><li>Retry on a code collision.</li><li>`last_activity_at`, so a room with no activity for 12 h ends: checked when joining, plus an hourly pg_cron sweep.</li><li>Max 8 people.</li><li>The host can remove someone.</li><li>If the host leaves, the earliest joiner becomes host.</li><li>A clear "This room has ended. Start your own" message.</li><li>A clear message for minors.</li></ul> | 034 | A dead or full room never shows a blank screen. Two browsers see each other's sets in 2 s or less. |
| **R1** | Room sets offline | <ul><li>A `client_id` on `group_sets` (unique per session).</li><li>Sets queue on the device and send in order on reconnect, like solo workouts.</li></ul> | 035 | Airplane mode mid-set loses nothing and makes no duplicates. |
| **R2** | Room links + preview | <ul><li>`/r/<CODE>` route, kept through sign-up (localStorage plus `user_metadata`).</li><li>`api/room-preview.js` returns the host's nickname, the workout name, the number training and whether the room is still open; no other personal data.</li><li>Signed-out preview page.</li><li>Lobby: **Share** (Web Share API with the link and code, text from the spec) next to Copy.</li><li>Join field: advances by itself at 6 characters.</li></ul> | none | Opening a link signed out → sign up → you're in the room. Opening it signed in → you're in the room. |
| **R3** | 3-tap host flow | <ul><li>A "Train together" button on Train above the solo start.</li><li>Pick: today's plan workout / repeat last / free workout.</li><li>Invite: creates the room, fills the plan and opens the share sheet in one go.</li><li>A "Join with code" row on Train.</li></ul> | none | From Train, the share sheet is open in 3 taps. |
| **R4** | Friends from invites | <ul><li>An `/add` link from someone you didn't already know makes you friends straight away (the inviter shared it).</li><li>"Train together now?" after it.</li><li>Room-mates can add each other from the done screen.</li></ul> | 036 (`accept_invite`) | Opening a friend's link ends with both as friends, no second accept. |
| **R5** | Fast join for new people | <ul><li>Arriving from a room link: consent, nickname and age only, then straight into the room.</li><li>The rest of onboarding comes after their first workout.</li><li>Turn on Google / Apple sign-in once they're set up in Supabase (owner).</li></ul> | none | A new person is in the room within 60 s of opening the link. |
| **R6** | Inside the room | <ul><li>Icon reactions on a set: toast for the receiver, vibration where the browser allows.</li><li>A "partner finished a set" vibration with an off switch.</li><li>Block and report (report goes to admins as a notification).</li></ul> | 037 | Reactions arrive within the realtime time. A blocked person can't join your rooms or send requests. |
| **R7** | End of session | <ul><li>A room share card (`kind: 'room'`): names, sets, volume, time, best set, athrion.app.</li><li>"Beat it next time": the partner's last numbers beside yours on shared exercises.</li><li>"Same time next week?" saves a `scheduled_sessions` row and pushes both people 1 h before, with a fresh room link.</li></ul> | 038 | The card shares as a story image. The reminder arrives in a test. |
| **R8** | Measuring (first-party) | <ul><li>`app_events` plus the `track()` helper.</li><li>Events from the spec's list that matter for the funnel, with internal IDs only.</li><li>Server triggers for room and paired-workout events.</li><li>UTM kept through sign-up onto the profile.</li><li>Opt-out in Settings.</li><li>Privacy policy sentence; data included in export and deletion.</li></ul> | 039 | Test events show up. Opt-out stops them. Delete account removes them. |
| **R9** | Invite rewards | <ul><li>`invite_id` in shared links.</li><li>A reward when the invitee's first paired workout with the inviter meets the rules (15 min, 6 sets each).</li><li>Same-device and monthly-N checks, logged when blocked.</li><li>Reward length and N in `app_config`.</li><li>`comp_pro_until`, or a `trial_end` push for Stripe payers.</li><li>An Invites screen in You.</li></ul> | 040 | A test invite gives the reward once to both. A same-device test is blocked and logged. |
| **R10** | Nudges | <ul><li>Live: "@alex started a workout. Join?" to past room-mates only, at most 1 a day per pair.</li><li>Missed scheduled session.</li><li>Solo user after their 3rd workout.</li><li>Each follows the notification switch.</li></ul> | 041 | Each fires once in a test and respects its limit. |
| **R11** | Dashboards | <ul><li>An admin-only page from SQL views: activation, K-factor, paired vs solo retention (headline), weekly paired workouts and pairs, sources, rewards.</li></ul> | 042 | Every chart shows test data. |

### Why this order
- **R0–R2 come first.** Rooms that end cleanly, keep sets offline and can be shared by link are the base everything else stands on, and they're useful on their own.
- **Measuring (R8) comes before rewards (R9),** so the reward can be judged. It's later than the spec's M1 because it now depends on the owner's privacy decision (3.2), and the room work doesn't need to wait for that.
- **The spec's M9 UTM part moves into R8.**

## 5. Owner's decisions (Nov 11, 2026)
1. **Analytics:** our own events table in Supabase (R8 as written). No PostHog.
2. **3-tap start:** yes, build the Train together start on Train (R3).
3. **Reward:** one month of Pro, after which they pay as normal. **No monthly limit** on invites for now (keep the limit possible in `app_config`, off).
4. **Fast join:** people from a room link just create an account (consent, nickname, age stay, as the law needs), **no body stats**. A pop-up later reminds them to add their stats. Also: the BMI gauge with "Overweight / Obese" scared people, so it's removed from You (done, along with the BMI tile).
5. **Room size:** 6 for now. Gym classes come later.
6. **Reactions:** three icons: laughing with tears, like, dumbbell (`mdi:emoticon-lol-outline`, `mdi:thumb-up-outline`, `mdi:dumbbell`).
7. **Invites:** the inviter still accepts first. R4 drops "friends straight away" and keeps only "Train together now?" and adding room-mates from the done screen.
8. **Realtime:** 012 has been run.

## 6. Progress
- **R0** (rooms that end cleanly): done; 034 applied Nov 12 2026 and folded into `schema.sql`.
  - 12 hours of no activity ends a room: checked on join, plus an hourly `end-stale-rooms` cron.
  - 6 people at most.
  - The host can remove someone from the lobby, and they can't rejoin.
  - Leaving the lobby gives up your seat. A host who leaves or finishes hands the room to the earliest joiner, or it ends if nobody's left.
  - Code clashes retry.
  - Clear messages for ended, full and removed rooms, and for minors.
- **R1** (sets logged without signal): done; 035 applied Nov 12 2026.
  - A set shows in the room and the rest starts the moment it's logged; it's sent in the background.
  - Without signal it waits on the phone (survives a reload) with a "waiting for signal" note, and is sent in order once back online.
  - Each set has its own id from the phone, so a set sent twice is stored once (after 035).
  - A queued set keeps the time it was logged, never later than now or before the room was made.
- **R2** (room links): done.
  - `athrion.app/r/CODE`: signed out, a preview ("@alex invited you", the workout, how many are in) with Join free; an ended room says so and offers your own.
  - The code is kept through sign-up on the phone and in the new account (for an email confirmed on another device), for 12 hours; the room opens right after onboarding.
  - The lobby has Invite friends (share sheet with the link) and Copy code.
  - The code field is six boxes and joins on the 6th character.
- **R3** (3-tap start): done. Train → Train together → pick today's workout, your last one or a free workout → Invite friends: the room is made with that workout and the share sheet opens. On iPhone the share sheet may need one more tap on Invite friends in the room, since the browser only opens it straight from a tap.
- **R4** (friends from rooms): done. "Train together now?" right after becoming friends or asking from an invite (Open a room shares its link); the room's done screen lists who you trained with, each with Add friend (they still accept).
- **R5** (fast join): done. From a room link a new account picks a nickname and its age (13+, under 16 still needs a parent), then the room opens. Body stats wait: a "Finish your profile" pop-up once a day outside workouts, and Food and Plan ask for them first. Google / Apple sign-in still needs the owner to switch the providers on in Supabase and set `VITE_OAUTH_PROVIDERS`.
