-- ATHRION database: every migration that is applied to the live project, in the order it ran.
-- The live database already has all of this. Run it only to set up a new, empty Supabase project
-- (SQL editor, in one go). It needs the 'reminders_cron_secret' Vault secret first (see 005).
--
-- New changes: write them as supabase/NNN_name.sql, apply them, then fold them in at the end
-- here under their own heading and delete the file. Files still in supabase/ are not applied yet.
-- Each section below is the original file, unchanged; its heading is the file it came from.

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 001_base · workout logs, calorie logs, custom workouts
-- ═══════════════════════════════════════════════════════════════════════════

-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

create table workout_logs (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  date          text not null,
  name          text not null,
  duration      text,
  volume        float,
  sets          jsonb,
  created_at    timestamptz default now()
);

alter table workout_logs enable row level security;

create policy "Users manage own workout logs"
  on workout_logs for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table calorie_logs (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  date            text not null,
  foods           jsonb,
  total_calories  int,
  created_at      timestamptz default now()
);

alter table calorie_logs enable row level security;

create policy "Users manage own calorie logs"
  on calorie_logs for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table custom_workouts (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  exercises   jsonb not null default '[]',
  created_at  timestamptz default now()
);

alter table custom_workouts enable row level security;

create policy "Users manage own custom workouts"
  on custom_workouts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 001b_subscriptions · Stripe subscription state
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Subscriptions table ───────────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor (Database → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status                  text        NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'pro')),
  stripe_customer_id      text        UNIQUE,
  stripe_subscription_id  text        UNIQUE,
  period_end              timestamptz,
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own row
CREATE POLICY "read own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only your backend (service-role key / Stripe webhook) can write
-- No INSERT/UPDATE policy for anon/authenticated — handled server-side


-- ── Auto-create a free row on every new sign-up ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_subscription();


-- ── Backfill existing users (run once) ────────────────────────────────────────
INSERT INTO public.subscriptions (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 001c_group_workouts · Train together rooms
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Group Workout Tables ──────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor → New query

-- Workout rooms
CREATE TABLE IF NOT EXISTS public.group_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text        NOT NULL UNIQUE,
  exercises   text[]      NOT NULL DEFAULT '{}',
  total_sets  int         NOT NULL DEFAULT 3,
  rest_secs   int         NOT NULL DEFAULT 60,
  status      text        NOT NULL DEFAULT 'lobby'
                          CHECK (status IN ('lobby','active','done')),
  created_at  timestamptz DEFAULT now()
);

-- Who is in each room
CREATE TABLE IF NOT EXISTS public.group_participants (
  session_id   uuid  NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  user_id      uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text  NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

-- Every set logged by every participant
CREATE TABLE IF NOT EXISTS public.group_sets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id),
  display_name text        NOT NULL,
  exercise     text        NOT NULL,
  set_num      int         NOT NULL,
  weight       numeric     NOT NULL,
  reps         int         NOT NULL,
  logged_at    timestamptz DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.group_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_sets         ENABLE ROW LEVEL SECURITY;

-- group_sessions: any auth user can read (code is the secret gate)
CREATE POLICY "auth users can read sessions"
  ON public.group_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth users can create sessions"
  ON public.group_sessions FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "host can update session"
  ON public.group_sessions FOR UPDATE
  USING (auth.uid() = host_id);

-- group_participants: join yourself; read if you are a participant
CREATE POLICY "users can join"
  ON public.group_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Membership check that bypasses RLS, so policies on group_participants don't recurse
CREATE OR REPLACE FUNCTION public.is_group_participant(p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_participants WHERE session_id = p_session_id AND user_id = auth.uid());
$$;

CREATE POLICY "participants can read room members"
  ON public.group_participants FOR SELECT
  USING (
    user_id = auth.uid() OR public.is_group_participant(session_id)
  );

-- group_sets: log your own; read all sets in sessions you're part of
CREATE POLICY "users can log own sets"
  ON public.group_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "participants can read all sets"
  ON public.group_sets FOR SELECT
  USING (public.is_group_participant(session_id));

-- ── Enable Realtime ───────────────────────────────────────────────────────────
-- In Supabase dashboard: Database → Replication → enable realtime for:
--   public.group_sessions
--   public.group_participants
--   public.group_sets

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 002_fitness_tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Fitness Tables Migration ─────────────────────────────────────────────────
-- Run in Supabase SQL Editor: Database → SQL Editor → New query
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks)

-- ── Make sure user_profiles table exists ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sex          text,
  height_cm    int,
  weight_lb    numeric,
  age          int,
  calorie_goal int,
  protein_goal int,
  carb_goal    int,
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles' AND policyname = 'Users manage own profile'
  ) THEN
    CREATE POLICY "Users manage own profile"
      ON public.user_profiles FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── Fitness Profiles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fitness_profiles (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_goal               text        NOT NULL,
  secondary_goals            text[]      NOT NULL DEFAULT '{}',
  activity_level             text        NOT NULL DEFAULT 'moderately_active',
  experience_level           text        NOT NULL DEFAULT 'beginner',
  target_weight_lb           numeric,
  avg_daily_steps            int,
  workout_days_per_week      int         NOT NULL DEFAULT 3,
  preferred_session_duration int         DEFAULT 60,
  workout_location           text        NOT NULL DEFAULT 'gym',
  available_equipment        text[]      NOT NULL DEFAULT '{}',
  preferred_workout_types    text[]      NOT NULL DEFAULT '{}',
  liked_exercises            text        DEFAULT '',
  disliked_exercises         text        DEFAULT '',
  preferred_training_days    text[]      NOT NULL DEFAULT '{}',
  preferred_rest_days        text[]      NOT NULL DEFAULT '{}',
  session_preference         text        NOT NULL DEFAULT 'both',
  injuries                   text        DEFAULT '',
  limitations                text        DEFAULT '',
  medical_notes              text        DEFAULT '',
  onboarding_completed       boolean     NOT NULL DEFAULT false,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

ALTER TABLE public.fitness_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fitness_profiles' AND policyname = 'Users manage own fitness_profiles'
  ) THEN
    CREATE POLICY "Users manage own fitness_profiles"
      ON public.fitness_profiles FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── Nutrition Targets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nutrition_targets (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calorie_target       int         NOT NULL,
  protein_grams        int         NOT NULL,
  carb_grams           int         NOT NULL,
  fat_grams            int         NOT NULL,
  bmr                  numeric,
  tdee                 numeric,
  goal_adjustment      int         DEFAULT 0,
  activity_multiplier  numeric,
  calculation_formula  text        DEFAULT 'mifflin_st_jeor',
  calculation_version  int         DEFAULT 1,
  safety_flags         text[]      DEFAULT '{}',
  effective_from       date        DEFAULT current_date,
  effective_to         date,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nutrition_targets' AND policyname = 'Users manage own nutrition_targets'
  ) THEN
    CREATE POLICY "Users manage own nutrition_targets"
      ON public.nutrition_targets FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── Fitness Plans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fitness_plans (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                   text        NOT NULL,
  primary_goal           text        NOT NULL,
  status                 text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  duration_weeks         int         NOT NULL,
  start_date             date        DEFAULT current_date,
  training_days_per_week int         NOT NULL,
  ai_model               text,
  prompt_version         int         DEFAULT 1,
  generation_status      text        NOT NULL DEFAULT 'completed' CHECK (generation_status IN ('pending', 'completed', 'failed')),
  plan_data              jsonb,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE public.fitness_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fitness_plans' AND policyname = 'Users manage own fitness_plans'
  ) THEN
    CREATE POLICY "Users manage own fitness_plans"
      ON public.fitness_plans FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── Progress Check-ins ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.progress_checkins (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fitness_plan_id    uuid        REFERENCES public.fitness_plans(id) ON DELETE SET NULL,
  weight_lb          numeric,
  energy_level       int         CHECK (energy_level BETWEEN 1 AND 5),
  sleep_quality      int         CHECK (sleep_quality BETWEEN 1 AND 5),
  hunger_level       int         CHECK (hunger_level BETWEEN 1 AND 5),
  soreness_level     int         CHECK (soreness_level BETWEEN 1 AND 5),
  stress_level       int         CHECK (stress_level BETWEEN 1 AND 5),
  workouts_completed int,
  adherence_pct      int         CHECK (adherence_pct BETWEEN 0 AND 100),
  notes              text,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE public.progress_checkins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'progress_checkins' AND policyname = 'Users manage own progress_checkins'
  ) THEN
    CREATE POLICY "Users manage own progress_checkins"
      ON public.progress_checkins FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 004_progress_features
-- ═══════════════════════════════════════════════════════════════════════════

-- Progress tracking, health data, badges and push reminders.
-- Additive only: no existing tables are changed.

-- ── Body measurements (weight trend + tape measurements) ─────────────────────
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date        NOT NULL,
  weight_lb     numeric(5,1),
  body_fat_pct  numeric(4,1),
  waist_in      numeric(4,1),
  chest_in      numeric(4,1),
  hips_in       numeric(4,1),
  arm_in        numeric(4,1),
  thigh_in      numeric(4,1),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- ── Progress photos (files live in the progress-photos storage bucket) ───────
CREATE TABLE IF NOT EXISTS public.progress_photos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date        NOT NULL,
  pose          text        NOT NULL DEFAULT 'front',
  storage_path  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Daily health data (manual entry, HealthKit or Health Connect) ────────────
CREATE TABLE IF NOT EXISTS public.daily_health (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date             date        NOT NULL,
  steps            integer,
  sleep_hours      numeric(3,1),
  resting_hr       integer,
  active_calories  integer,
  source           text        NOT NULL DEFAULT 'manual',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- ── Earned badges ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   text        NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

-- ── Web push subscriptions and reminder preferences ──────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL UNIQUE,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reminder_settings (
  user_id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled          boolean     NOT NULL DEFAULT true,
  reminder_hour    integer     NOT NULL DEFAULT 18 CHECK (reminder_hour BETWEEN 0 AND 23),
  timezone         text        NOT NULL DEFAULT 'UTC',
  streak_warnings  boolean     NOT NULL DEFAULT true,
  last_sent_date   date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Row level security: each user manages only their own rows ────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['body_measurements','progress_photos','daily_health','user_badges','push_subscriptions','reminder_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Users manage own ' || t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
        'Users manage own ' || t, t);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS body_measurements_user_date ON public.body_measurements (user_id, date DESC);
CREATE INDEX IF NOT EXISTS progress_photos_user_date   ON public.progress_photos (user_id, date DESC);
CREATE INDEX IF NOT EXISTS daily_health_user_date      ON public.daily_health (user_id, date DESC);

-- ── Private storage bucket for progress photos, one folder per user ──────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users manage own progress photos') THEN
    CREATE POLICY "Users manage own progress photos" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'progress-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'progress-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 005_reminder_cron
-- ═══════════════════════════════════════════════════════════════════════════

-- Hourly trigger for the send-reminders Edge Function.
-- Before running, store the function's CRON_SECRET in Vault (once):
--   select vault.create_secret('<CRON_SECRET value>', 'reminders_cron_secret');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('send-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-reminders');

SELECT cron.schedule(
  'send-reminders',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dbpxxhqcsfypxjcdalca.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 006_security_fixes
-- ═══════════════════════════════════════════════════════════════════════════

-- Security and data-integrity fixes from the October 2026 review.
-- Safe to re-run. Rules that need the updated app are in 007_group_lockdown.sql.

-- ── Shared helpers: pin search_path on SECURITY DEFINER functions ─────────────
ALTER FUNCTION public.is_group_participant(uuid) SET search_path = public;
ALTER FUNCTION public.handle_new_user_subscription() SET search_path = public;

-- ── group_sets: only members of a room can read or log its sets ──────────────
-- The old policy compared gp.session_id with itself, so every participant of any
-- room could read every room's sets.
DROP POLICY IF EXISTS "participants can read all sets" ON public.group_sets;
CREATE POLICY "participants can read all sets" ON public.group_sets
  FOR SELECT USING (public.is_group_participant(session_id));

DROP POLICY IF EXISTS "users can log own sets" ON public.group_sets;
CREATE POLICY "users can log own sets" ON public.group_sets
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_group_participant(session_id));

-- ── group_sessions: only the host changes room settings ─────────────────────
DROP POLICY IF EXISTS "host can update session" ON public.group_sessions;
CREATE POLICY "host can update session" ON public.group_sessions
  FOR UPDATE USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

-- Members may edit the exercise list in the lobby, nothing else
CREATE OR REPLACE FUNCTION public.guard_group_session_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.host_id AND (
       NEW.host_id    IS DISTINCT FROM OLD.host_id
    OR NEW.code       IS DISTINCT FROM OLD.code
    OR NEW.status     IS DISTINCT FROM OLD.status
    OR NEW.total_sets IS DISTINCT FROM OLD.total_sets
    OR NEW.rest_secs  IS DISTINCT FROM OLD.rest_secs
  ) THEN
    RAISE EXCEPTION 'Only the host can change room settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_group_session_update ON public.group_sessions;
CREATE TRIGGER guard_group_session_update BEFORE UPDATE ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_session_update();

-- ── Join by code without being able to list other rooms ─────────────────────
-- Join a room by its code without being able to list other rooms
CREATE OR REPLACE FUNCTION public.join_group_session(p_code text, p_display_name text)
RETURNS public.group_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.group_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.group_sessions
   WHERE code = upper(trim(p_code)) AND status IN ('lobby', 'active')
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found — check the code and try again' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.group_participants (session_id, user_id, display_name)
  VALUES (s.id, auth.uid(), left(coalesce(nullif(trim(p_display_name), ''), 'Athlete'), 40))
  ON CONFLICT (session_id, user_id) DO NOTHING;
  RETURN s;
END $$;

REVOKE ALL ON FUNCTION public.join_group_session(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_group_session(text, text) TO authenticated;

-- ── calorie_logs: one log per user per day ───────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calorie_logs_user_date_key') THEN
    ALTER TABLE public.calorie_logs ADD CONSTRAINT calorie_logs_user_date_key UNIQUE (user_id, date);
  END IF;
END $$;

-- ── Plan generation: atomic per-user rate limit ──────────────────────────────
ALTER TABLE public.fitness_profiles ADD COLUMN IF NOT EXISTS plan_requested_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 007_group_lockdown
-- ═══════════════════════════════════════════════════════════════════════════

-- Apply after the app version that joins rooms with join_group_session() is live.
-- Safe to re-run.

-- ── group_sessions: visible to the host and members only ─────────────────────
DROP POLICY IF EXISTS "auth users can read sessions" ON public.group_sessions;
CREATE POLICY "members can read sessions" ON public.group_sessions
  FOR SELECT USING (auth.uid() = host_id OR public.is_group_participant(id));

-- ── group_participants: hosts add themselves; everyone else joins by code ────
DROP POLICY IF EXISTS "users can join" ON public.group_participants;
CREATE POLICY "host can join own room" ON public.group_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.group_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 008_weight_unit
-- ═══════════════════════════════════════════════════════════════════════════

-- 008: remember whether the person uses lb or kg. Weights stay stored in lb;
-- this only drives display and input. Run before deploying the app that writes it.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS weight_unit text NOT NULL DEFAULT 'lb'
  CHECK (weight_unit IN ('lb', 'kg'));

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 009_social
-- ═══════════════════════════════════════════════════════════════════════════

-- 009: nicknames, friends, and the monthly points leaderboard.
-- Run before deploying the app that uses them, then redeploy generate-fitness-plan
-- and analyze-meal (they read comp_pro_until). Safe to re-run.
--
-- Points per calendar month, from data the app already stores:
--   10 per workout day (a logged workout with 3+ sets; one counted per day)
--   20 per week with 3+ workout days
--    5 per personal record (heaviest set of an exercise so far), at most 10 a month
--   15 per day you trained in a room with someone else
-- On the 1st, close_month() saves last month's scores; the top 3 on the Everyone
-- board get a medal and a free month of Pro (subscriptions.comp_pro_until).

-- ── Nicknames: public, unique, lowercase ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_profiles (
  user_id        uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname       text        NOT NULL CHECK (nickname ~ '^[a-z0-9_]{3,20}$'
                               AND nickname NOT IN ('athrion', 'admin', 'support', 'official', 'help')),
  on_leaderboard boolean     NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS social_profiles_nickname_key ON public.social_profiles (nickname);
ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signed-in users read nicknames" ON public.social_profiles;
CREATE POLICY "signed-in users read nicknames" ON public.social_profiles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "users add own nickname" ON public.social_profiles;
CREATE POLICY "users add own nickname" ON public.social_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users edit own nickname" ON public.social_profiles;
CREATE POLICY "users edit own nickname" ON public.social_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Friends: one row per pair; written only through the functions below ─────
CREATE TABLE IF NOT EXISTS public.friendships (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz DEFAULT now(),
  CHECK (requester <> addressee)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_key
  ON public.friendships (LEAST(requester, addressee), GREATEST(requester, addressee));
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY; -- no policies: functions only

-- ── Closed months ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_scores (
  user_id      uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month        date    NOT NULL,           -- first day of the month
  points       int     NOT NULL,
  workout_days int     NOT NULL,
  rank         int,                        -- place on the Everyone board; null if hidden
  prize_pro    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, month)
);
ALTER TABLE public.monthly_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own scores" ON public.monthly_scores;
CREATE POLICY "read own scores" ON public.monthly_scores
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Prize Pro, separate from Stripe so the webhook never overwrites it ──────
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS comp_pro_until timestamptz;

-- ── Points for one month, everyone (internal) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.month_points(p_month date)
RETURNS TABLE (user_id uuid, points int, workout_days int, full_weeks int, prs int, together int, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT date_trunc('month', p_month)::date AS m0,
           (date_trunc('month', p_month) + interval '1 month')::date AS m1
  ),
  logs AS (
    SELECT w.id, w.user_id, w.date::date AS d, w.created_at,
           CASE WHEN jsonb_typeof(w.sets::jsonb) = 'array' THEN w.sets::jsonb ELSE '[]'::jsonb END AS sets
    FROM workout_logs w
  ),
  days AS (
    SELECT l.user_id, l.d, max(l.created_at) AS at
    FROM logs l, b
    WHERE l.d >= b.m0 AND l.d < b.m1 AND jsonb_array_length(l.sets) >= 3
    GROUP BY l.user_id, l.d
  ),
  day_count AS (SELECT d.user_id, count(*)::int AS n, max(d.at) AS at FROM days d GROUP BY d.user_id),
  weeks AS (
    SELECT x.user_id, count(*)::int AS n
    FROM (SELECT d.user_id FROM days d GROUP BY d.user_id, date_trunc('week', d.d) HAVING count(*) >= 3) x
    GROUP BY x.user_id
  ),
  tops AS (
    SELECT l.user_id, l.d, l.created_at, e->>'ex' AS ex,
           max(CASE WHEN jsonb_typeof(e->'weight') = 'number' THEN (e->>'weight')::numeric END) AS top
    FROM logs l, b, jsonb_array_elements(l.sets) e
    WHERE l.d < b.m1 AND l.user_id IN (SELECT d.user_id FROM days d)
    GROUP BY l.id, l.user_id, l.d, l.created_at, e->>'ex'
  ),
  pr AS (
    SELECT x.user_id, LEAST(count(*), 10)::int AS n
    FROM (
      SELECT t.user_id, t.d, t.top > max(t.top) OVER (
               PARTITION BY t.user_id, t.ex ORDER BY t.created_at
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS is_pr
      FROM tops t
    ) x, b
    WHERE x.is_pr AND x.d >= b.m0
    GROUP BY x.user_id
  ),
  tog AS (
    SELECT g.user_id, count(DISTINCT g.logged_at::date)::int AS n, max(g.logged_at) AS at
    FROM group_sets g, b
    WHERE g.logged_at >= b.m0 AND g.logged_at < b.m1
      AND EXISTS (SELECT 1 FROM group_sets o WHERE o.session_id = g.session_id AND o.user_id <> g.user_id)
    GROUP BY g.user_id
  ),
  people AS (SELECT dc.user_id FROM day_count dc UNION SELECT t.user_id FROM tog t)
  SELECT p.user_id,
         (COALESCE(dc.n, 0) * 10 + COALESCE(wk.n, 0) * 20 + COALESCE(pr.n, 0) * 5 + COALESCE(tg.n, 0) * 15)::int,
         COALESCE(dc.n, 0), COALESCE(wk.n, 0), COALESCE(pr.n, 0), COALESCE(tg.n, 0),
         GREATEST(dc.at, tg.at)
  FROM people p
  LEFT JOIN day_count dc ON dc.user_id = p.user_id
  LEFT JOIN weeks wk     ON wk.user_id = p.user_id
  LEFT JOIN pr           ON pr.user_id = p.user_id
  LEFT JOIN tog tg       ON tg.user_id = p.user_id
$$;
REVOKE ALL ON FUNCTION public.month_points(date) FROM PUBLIC, anon, authenticated;

-- ── Leaderboard: 'friends' (you + accepted friends) or 'everyone' (listed people) ──
-- Only nicknames and points leave the database.
CREATE OR REPLACE FUNCTION public.leaderboard(p_scope text, p_month date DEFAULT NULL)
RETURNS TABLE (place int, nickname text, points int, workout_days int, lifetime int, medals int, is_me boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  me uuid := auth.uid();
  m  date := date_trunc('month', COALESCE(p_month, current_date))::date;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH pool AS (
    SELECT sp.user_id, sp.nickname,
           (p_scope = 'friends' OR sp.on_leaderboard) AS listed
    FROM social_profiles sp
    WHERE sp.user_id = me
       OR (p_scope = 'friends' AND EXISTS (
             SELECT 1 FROM friendships f
             WHERE f.status = 'accepted'
               AND ((f.requester = me AND f.addressee = sp.user_id) OR (f.addressee = me AND f.requester = sp.user_id))))
       OR (p_scope <> 'friends' AND sp.on_leaderboard)
  ),
  pts AS (SELECT * FROM month_points(m)),
  hist AS (
    SELECT ms.user_id, sum(ms.points)::int AS total, (count(*) FILTER (WHERE ms.rank <= 3))::int AS medals
    FROM monthly_scores ms
    WHERE ms.month < m AND ms.user_id IN (SELECT pool.user_id FROM pool)
    GROUP BY ms.user_id
  ),
  ranked AS (
    SELECT pool.user_id, pool.nickname, pool.listed,
           COALESCE(t.points, 0) AS pts, COALESCE(t.workout_days, 0) AS days,
           row_number() OVER (PARTITION BY pool.listed
                              ORDER BY COALESCE(t.points, 0) DESC, t.last_at ASC NULLS LAST, pool.nickname)::int AS rn
    FROM pool LEFT JOIN pts t ON t.user_id = pool.user_id
  )
  SELECT CASE WHEN r.listed THEN r.rn END, r.nickname, r.pts, r.days,
         (COALESCE(h.total, 0) + r.pts)::int, COALESCE(h.medals, 0), r.user_id = me
  FROM ranked r LEFT JOIN hist h ON h.user_id = r.user_id
  WHERE (r.listed AND r.rn <= 100) OR r.user_id = me
  ORDER BY r.listed DESC, r.rn;
END $$;

-- ── Your own month so far, with the breakdown ───────────────────────────────
CREATE OR REPLACE FUNCTION public.my_points(p_month date DEFAULT NULL)
RETURNS TABLE (points int, workout_days int, full_weeks int, prs int, together int, lifetime int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  me uuid := auth.uid();
  m  date := date_trunc('month', COALESCE(p_month, current_date))::date;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT COALESCE(t.points, 0), COALESCE(t.workout_days, 0), COALESCE(t.full_weeks, 0),
         COALESCE(t.prs, 0), COALESCE(t.together, 0),
         (COALESCE((SELECT sum(ms.points) FROM monthly_scores ms WHERE ms.user_id = me AND ms.month < m), 0)
           + COALESCE(t.points, 0))::int
  FROM (SELECT me AS uid) x
  LEFT JOIN month_points(m) t ON t.user_id = x.uid;
END $$;

-- ── Friend requests ─────────────────────────────────────────────────────────
-- Returns 'pending' (request sent) or 'friends' (they had already asked you, or you're friends)
CREATE OR REPLACE FUNCTION public.send_friend_request(p_nickname text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  them uuid;
  f public.friendships;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM social_profiles WHERE user_id = me) THEN
    RAISE EXCEPTION 'Pick a nickname first' USING ERRCODE = 'P0001';
  END IF;
  SELECT user_id INTO them FROM social_profiles WHERE nickname = lower(ltrim(trim(p_nickname), '@'));
  IF them IS NULL THEN RAISE EXCEPTION 'No one has that nickname' USING ERRCODE = 'P0002'; END IF;
  IF them = me THEN RAISE EXCEPTION 'That''s your own nickname' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO f FROM friendships
  WHERE LEAST(requester, addressee) = LEAST(me, them) AND GREATEST(requester, addressee) = GREATEST(me, them);
  IF FOUND THEN
    IF f.status = 'pending' AND f.addressee = me THEN
      UPDATE friendships SET status = 'accepted' WHERE id = f.id;
      RETURN 'friends';
    END IF;
    RETURN CASE WHEN f.status = 'accepted' THEN 'friends' ELSE 'pending' END;
  END IF;

  IF (SELECT count(*) FROM friendships WHERE requester = me AND status = 'pending') >= 50 THEN
    RAISE EXCEPTION 'Too many open requests. Wait for some to be accepted.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO friendships (requester, addressee) VALUES (me, them);
  RETURN 'pending';
END $$;

-- Accept or decline a request sent to you
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_accept THEN
    UPDATE friendships SET status = 'accepted' WHERE id = p_id AND addressee = auth.uid() AND status = 'pending';
  ELSE
    DELETE FROM friendships WHERE id = p_id AND addressee = auth.uid() AND status = 'pending';
  END IF;
END $$;

-- Unfriend, or cancel a request you sent
CREATE OR REPLACE FUNCTION public.remove_friend(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM friendships WHERE id = p_id AND auth.uid() IN (requester, addressee);
$$;

CREATE OR REPLACE FUNCTION public.my_friends()
RETURNS TABLE (id uuid, nickname text, status text, incoming boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, sp.nickname, f.status, f.addressee = auth.uid()
  FROM friendships f
  JOIN social_profiles sp
    ON sp.user_id = CASE WHEN f.requester = auth.uid() THEN f.addressee ELSE f.requester END
  WHERE auth.uid() IN (f.requester, f.addressee)
  ORDER BY f.status, sp.nickname
$$;

-- ── Month end: save scores, rank the Everyone board, give the top 3 a Pro month ──
CREATE OR REPLACE FUNCTION public.close_month(p_month date DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m date := date_trunc('month', COALESCE(p_month, current_date - interval '1 month'))::date;
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM monthly_scores WHERE month = m) THEN RETURN 0; END IF; -- already closed

  INSERT INTO monthly_scores (user_id, month, points, workout_days, rank)
  SELECT t.user_id, m, t.points, t.workout_days,
         CASE WHEN sp.on_leaderboard IS TRUE THEN
           row_number() OVER (PARTITION BY sp.on_leaderboard IS TRUE ORDER BY t.points DESC, t.last_at ASC NULLS LAST)
         END
  FROM month_points(m) t
  LEFT JOIN social_profiles sp ON sp.user_id = t.user_id
  WHERE t.points > 0;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE monthly_scores SET prize_pro = true WHERE month = m AND rank <= 3;
  UPDATE subscriptions s
     SET comp_pro_until = GREATEST(COALESCE(s.comp_pro_until, now()), now()) + interval '1 month',
         updated_at = now()
    FROM monthly_scores ms
   WHERE ms.month = m AND ms.prize_pro AND ms.user_id = s.user_id;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.close_month(date) FROM PUBLIC, anon, authenticated;

-- Signed-in users only
REVOKE ALL ON FUNCTION public.leaderboard(text, date)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_points(date)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_friend_request(text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_friend_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_friend(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_friends()                          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard(text, date)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_points(date)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_friends()                          TO authenticated;

-- 12:00 UTC on the 1st, once every time zone has finished the month
SELECT cron.schedule('close-month', '0 12 1 * *', $$SELECT public.close_month()$$);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 010_prize_for_subscribers
-- ═══════════════════════════════════════════════════════════════════════════

-- 010: a top-3 finish is a real free month for everyone, including people already paying.
-- close_month() still gives non-paying winners subscriptions.comp_pro_until. Winners with an
-- active Stripe subscription are left for /api/monthly-prizes (Vercel cron), which moves their
-- next charge a month later. prize_given_at marks a prize as handed out. Safe to re-run.

ALTER TABLE public.monthly_scores ADD COLUMN IF NOT EXISTS prize_given_at timestamptz;

CREATE OR REPLACE FUNCTION public.close_month(p_month date DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m date := date_trunc('month', COALESCE(p_month, current_date - interval '1 month'))::date;
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM monthly_scores WHERE month = m) THEN RETURN 0; END IF; -- already closed

  INSERT INTO monthly_scores (user_id, month, points, workout_days, rank)
  SELECT t.user_id, m, t.points, t.workout_days,
         CASE WHEN sp.on_leaderboard IS TRUE THEN
           row_number() OVER (PARTITION BY sp.on_leaderboard IS TRUE ORDER BY t.points DESC, t.last_at ASC NULLS LAST)
         END
  FROM month_points(m) t
  LEFT JOIN social_profiles sp ON sp.user_id = t.user_id
  WHERE t.points > 0;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE monthly_scores SET prize_pro = true WHERE month = m AND rank <= 3;

  -- Not paying through Stripe: a free Pro month on top of any they already have
  UPDATE subscriptions s
     SET comp_pro_until = GREATEST(COALESCE(s.comp_pro_until, now()), now()) + interval '1 month',
         updated_at = now()
    FROM monthly_scores ms
   WHERE ms.month = m AND ms.prize_pro AND ms.user_id = s.user_id
     AND NOT (s.status = 'pro' AND s.stripe_subscription_id IS NOT NULL);
  UPDATE monthly_scores ms
     SET prize_given_at = now()
    FROM subscriptions s
   WHERE ms.month = m AND ms.prize_pro AND s.user_id = ms.user_id
     AND NOT (s.status = 'pro' AND s.stripe_subscription_id IS NOT NULL);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.close_month(date) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 011_notifications
-- ═══════════════════════════════════════════════════════════════════════════

-- 011: notifications. Every event lands in an in-app inbox (the bell); the ones worth a push
-- are handed to the send-reminders Edge Function, which checks the person's switches.
-- Needs the 'reminders_cron_secret' Vault secret from 005. Safe to re-run.
--
--   friend_request, friend_accepted   instant, push (switch: notify_friends)
--   month_result                      on the 1st, push (notify_achievements)
--   badge, target                     the moment they're earned, in-app only (you're in the app)
--   recap                             Sunday, written by send-reminders, push (notify_recap)
-- Daily reminders and "your workout is still open" are push-only, also from send-reminders.

-- ── Inbox ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text        NOT NULL,
  title      text        NOT NULL,
  body       text        NOT NULL DEFAULT '',
  url        text        NOT NULL DEFAULT '/',
  push       boolean     NOT NULL DEFAULT true,
  read_at    timestamptz,
  pushed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created ON public.notifications (user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own notifications" ON public.notifications;
CREATE POLICY "read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "mark own notifications read" ON public.notifications;
CREATE POLICY "mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Only read_at may change from the app
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

-- The bell updates live
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ── Switches (push only; the inbox always gets friend and achievement events) ──
ALTER TABLE public.reminder_settings
  ADD COLUMN IF NOT EXISTS notify_friends      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_workout_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_achievements boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_recap        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_recap_date     date;

-- ── A workout left open: the app mirrors it here while it runs ──────────────
CREATE TABLE IF NOT EXISTS public.open_workouts (
  user_id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  sets_done        int         NOT NULL DEFAULT 0,
  exercises_done   int         NOT NULL DEFAULT 0,
  exercises_total  int         NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  notified_at      timestamptz
);
ALTER TABLE public.open_workouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own open_workouts" ON public.open_workouts;
CREATE POLICY "Users manage own open_workouts" ON public.open_workouts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Writing a notification (server only) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_push boolean DEFAULT true)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notifications (user_id, kind, title, body, url, push) VALUES (p_user, p_kind, p_title, p_body, p_url, p_push);
$$;
REVOKE ALL ON FUNCTION public.notify(uuid, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- New pushable notification → send-reminders delivers it. A failure here never blocks the insert.
CREATE OR REPLACE FUNCTION public.push_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.push THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://dbpxxhqcsfypxjcdalca.supabase.co/functions/v1/send-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')),
        body    := jsonb_build_object('deliver', NEW.id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'push_notification: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notifications_push ON public.notifications;
CREATE TRIGGER notifications_push AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.push_notification();

-- ── Friends ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.friendship_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT nickname INTO who FROM social_profiles WHERE user_id = NEW.requester;
    PERFORM notify(NEW.addressee, 'friend_request', 'New friend request',
      '@' || COALESCE(who, 'someone') || ' wants to be friends.', '/?open=friends');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT nickname INTO who FROM social_profiles WHERE user_id = NEW.addressee;
    PERFORM notify(NEW.requester, 'friend_accepted', '@' || COALESCE(who, 'someone') || ' accepted your request',
      'You''re friends now. See where you both stand this month.', '/?open=ranks');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS friendships_notify ON public.friendships;
CREATE TRIGGER friendships_notify AFTER INSERT OR UPDATE OF status ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.friendship_notify();

-- ── Month results (close_month inserts one row per person with points) ──────
CREATE OR REPLACE FUNCTION public.month_result_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mon text := to_char(NEW.month, 'FMMonth');
  medal text := CASE NEW.rank WHEN 1 THEN 'Gold' WHEN 2 THEN 'Silver' WHEN 3 THEN 'Bronze' END;
BEGIN
  IF medal IS NOT NULL THEN
    PERFORM notify(NEW.user_id, 'month_result', medal || ' medal for ' || mon,
      'You finished #' || NEW.rank || ' on Everyone with ' || NEW.points || ' pts. Your free Pro month is on its way.', '/?open=ranks');
  ELSIF NEW.workout_days >= 12 THEN
    PERFORM notify(NEW.user_id, 'month_result', mon || ': 12-day month',
      NEW.points || ' pts over ' || NEW.workout_days || ' workout days. Badge earned. New month starts now.', '/?open=ranks');
  ELSE
    PERFORM notify(NEW.user_id, 'month_result', mon || ' is done',
      'You scored ' || NEW.points || ' pts over ' || NEW.workout_days || ' workout day' ||
      CASE WHEN NEW.workout_days = 1 THEN '' ELSE 's' END || '. Points reset today.', '/?open=ranks');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS monthly_scores_notify ON public.monthly_scores;
CREATE TRIGGER monthly_scores_notify AFTER INSERT ON public.monthly_scores
  FOR EACH ROW EXECUTE FUNCTION public.month_result_notify();

-- ── Badges (names match BADGES in src/lib/badges.js; a test keeps them in step) ──
CREATE OR REPLACE FUNCTION public.badge_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE badge text := CASE NEW.badge_id
  WHEN 'first_workout' THEN 'First Rep'
  WHEN 'workouts_10'   THEN 'Getting Serious'
  WHEN 'workouts_50'   THEN 'Half Century'
  WHEN 'workouts_100'  THEN 'Centurion'
  WHEN 'streak_4'      THEN 'On Fire'
  WHEN 'streak_12'     THEN 'Unstoppable'
  WHEN 'first_pr'      THEN 'New Best'
  WHEN 'prs_25'        THEN 'PR Machine'
  WHEN 'volume_10k'    THEN 'Ten Tonner'
  WHEN 'early_bird'    THEN 'Early Bird'
  WHEN 'night_owl'     THEN 'Night Owl'
  WHEN 'weigh_in_10'   THEN 'Data Driven'
  WHEN 'first_photo'   THEN 'Snapshot'
  ELSE 'New badge' END;
BEGIN
  PERFORM notify(NEW.user_id, 'badge', 'Badge earned: ' || badge, 'See all your badges on Progress.', '/?open=progress', false);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_badges_notify ON public.user_badges;
CREATE TRIGGER user_badges_notify AFTER INSERT ON public.user_badges
  FOR EACH ROW EXECUTE FUNCTION public.badge_notify();

-- ── The 12th workout day of a month ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.target_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m0 date := date_trunc('month', NEW.date::date)::date;
  days int;
BEGIN
  IF jsonb_typeof(NEW.sets::jsonb) <> 'array' OR jsonb_array_length(NEW.sets::jsonb) < 3 THEN RETURN NEW; END IF;
  SELECT count(DISTINCT w.date::date) INTO days FROM workout_logs w
   WHERE w.user_id = NEW.user_id AND w.date::date >= m0 AND w.date::date < (m0 + interval '1 month')::date
     AND jsonb_typeof(w.sets::jsonb) = 'array' AND jsonb_array_length(w.sets::jsonb) >= 3;
  IF days >= 12 AND NOT EXISTS (
    SELECT 1 FROM notifications n WHERE n.user_id = NEW.user_id AND n.kind = 'target' AND n.created_at >= m0
  ) THEN
    PERFORM notify(NEW.user_id, 'target', to_char(m0, 'FMMonth') || ' badge earned',
      '12 workout days this month. Every extra day still adds points.', '/?open=ranks', false);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workout_logs_target_notify ON public.workout_logs;
CREATE TRIGGER workout_logs_target_notify AFTER INSERT ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.target_notify();

-- ── For send-reminders: one person's month so far and place among friends ──
CREATE OR REPLACE FUNCTION public.points_summary(p_user uuid)
RETURNS TABLE (points int, workout_days int, friends_place int, friends int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pts AS (SELECT * FROM month_points(current_date)),
  circle AS (
    SELECT p_user AS uid
    UNION SELECT CASE WHEN f.requester = p_user THEN f.addressee ELSE f.requester END
      FROM friendships f WHERE f.status = 'accepted' AND p_user IN (f.requester, f.addressee)
  ),
  ranked AS (
    SELECT c.uid, COALESCE(t.points, 0) AS pts, COALESCE(t.workout_days, 0) AS days,
           rank() OVER (ORDER BY COALESCE(t.points, 0) DESC)::int AS place
    FROM circle c LEFT JOIN pts t ON t.user_id = c.uid
  )
  SELECT r.pts, r.days, r.place, (SELECT count(*)::int - 1 FROM circle)
  FROM ranked r WHERE r.uid = p_user
$$;
REVOKE ALL ON FUNCTION public.points_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.points_summary(uuid) TO service_role;

-- ── Every 15 minutes: "your workout is still open" ─────────────────────────
SELECT cron.schedule(
  'open-workouts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dbpxxhqcsfypxjcdalca.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')),
    body    := '{"open": true}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 013_group_set_plan
-- ═══════════════════════════════════════════════════════════════════════════

-- 013: Train together rooms planned set by set. plan = [{ name, sets: [{ reps, rest }] }]:
-- a reps target (null = any) and the rest after each set. The old columns (exercises,
-- total_sets, rest_secs) are still written, so older app versions keep working.
-- Safe to re-run; the app works before this is applied (rooms then use the same sets for every exercise).
ALTER TABLE public.group_sessions ADD COLUMN IF NOT EXISTS plan jsonb;

ALTER TABLE public.group_sessions DROP CONSTRAINT IF EXISTS group_sessions_plan_shape;
ALTER TABLE public.group_sessions ADD CONSTRAINT group_sessions_plan_shape
  CHECK (plan IS NULL OR (jsonb_typeof(plan) = 'array' AND jsonb_array_length(plan) <= 40 AND pg_column_size(plan) < 64000));

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 014_coaches
-- ═══════════════════════════════════════════════════════════════════════════

-- 014: coaches and the shop. Coaches apply, an admin approves them, then they publish
-- workouts and week plans (free or paid) with tips and how-to videos. Paid ones are sold
-- through Stripe Connect (api/coach-checkout.js); the webhook records each purchase here.
-- Apply before the app version with the shop. Safe to re-run.
--
-- After applying, make yourself an admin (in the SQL editor, with your own email):
--   INSERT INTO public.app_admins (user_id) SELECT id FROM auth.users WHERE email = 'you@example.com';

-- ── Admins ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "see own admin row" ON public.app_admins;
CREATE POLICY "see own admin row" ON public.app_admins FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.app_admins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid());
$$;

-- ── Coach profiles ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_profiles (
  user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      text        NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 40),
  bio               text        NOT NULL DEFAULT '' CHECK (char_length(bio) <= 1000),
  credentials       text        NOT NULL DEFAULT '' CHECK (char_length(credentials) <= 500),
  specialties       text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(specialties) <= 6),
  links             text        NOT NULL DEFAULT '' CHECK (char_length(links) <= 300),
  avatar_path       text        CHECK (char_length(avatar_path) <= 200),
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  review_note       text        CHECK (char_length(review_note) <= 500),
  stripe_account_id text        UNIQUE,
  charges_enabled   boolean     NOT NULL DEFAULT false,
  applied_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_at       timestamptz
);
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_approved_coach()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM coach_profiles WHERE user_id = auth.uid() AND status = 'approved');
$$;

DROP POLICY IF EXISTS "read approved coaches, own row, admins all" ON public.coach_profiles;
CREATE POLICY "read approved coaches, own row, admins all" ON public.coach_profiles FOR SELECT TO authenticated
  USING (status = 'approved' OR user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "apply as yourself" ON public.coach_profiles;
CREATE POLICY "apply as yourself" ON public.coach_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "edit own profile" ON public.coach_profiles;
CREATE POLICY "edit own profile" ON public.coach_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- People write only their own profile text; status, review and Stripe fields are server-only.
-- The Stripe account id isn't readable from the app at all.
REVOKE ALL ON public.coach_profiles FROM anon, authenticated;
GRANT SELECT (user_id, display_name, bio, credentials, specialties, links, avatar_path, status, review_note, charges_enabled, applied_at, reviewed_at)
  ON public.coach_profiles TO authenticated;
GRANT INSERT (user_id, display_name, bio, credentials, specialties, links, avatar_path) ON public.coach_profiles TO authenticated;
GRANT UPDATE (display_name, bio, credentials, specialties, links, avatar_path) ON public.coach_profiles TO authenticated;

-- A turned-down coach can apply again after changing their profile
CREATE OR REPLACE FUNCTION public.reapply_coach()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE coach_profiles SET status = 'pending', review_note = NULL, applied_at = now(), reviewed_at = NULL
  WHERE user_id = auth.uid() AND status = 'rejected';
$$;
REVOKE ALL ON FUNCTION public.reapply_coach() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reapply_coach() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_coach(p_user uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can review coaches' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('approved', 'rejected', 'suspended') THEN RAISE EXCEPTION 'Unknown status %', p_status; END IF;
  UPDATE coach_profiles
     SET status = p_status, review_note = CASE WHEN p_status = 'approved' THEN NULL ELSE left(p_note, 500) END, reviewed_at = now()
   WHERE user_id = p_user;
END $$;
REVOKE ALL ON FUNCTION public.review_coach(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_coach(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_review_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Set up payouts and publish your first workout.', '/?open=coach');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM notify(NEW.user_id, 'coach', 'Your coach application', 'It wasn''t approved this time. Open it to see why and apply again.', '/?open=coach');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS coach_profiles_notify ON public.coach_profiles;
CREATE TRIGGER coach_profiles_notify AFTER UPDATE OF status ON public.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.coach_review_notify();

-- ── Products: what's on sale. Anyone signed in sees the listing; the content is separate ──
CREATE TABLE IF NOT EXISTS public.coach_products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid        NOT NULL REFERENCES public.coach_profiles(user_id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('workout', 'plan')),
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
  summary     text        NOT NULL DEFAULT '' CHECK (char_length(summary) <= 160),
  description text        NOT NULL DEFAULT '' CHECK (char_length(description) <= 3000),
  level       text        NOT NULL DEFAULT 'All levels' CHECK (level IN ('Beginner', 'Intermediate', 'Advanced', 'All levels')),
  price_cents int         NOT NULL DEFAULT 0 CHECK (price_cents = 0 OR price_cents BETWEEN 299 AND 50000),
  minutes     int         CHECK (minutes BETWEEN 1 AND 300),
  outline     jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(outline) = 'array' AND pg_column_size(outline) < 8000),
  published   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_products_coach ON public.coach_products (coach_id);
ALTER TABLE public.coach_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read published products" ON public.coach_products;
CREATE POLICY "read published products" ON public.coach_products FOR SELECT TO authenticated
  USING (
    coach_id = auth.uid() OR public.is_admin()
    OR (published AND EXISTS (SELECT 1 FROM coach_profiles c WHERE c.user_id = coach_products.coach_id AND c.status = 'approved'))
  );
DROP POLICY IF EXISTS "approved coaches add products" ON public.coach_products;
CREATE POLICY "approved coaches add products" ON public.coach_products FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.is_approved_coach());
DROP POLICY IF EXISTS "approved coaches edit products" ON public.coach_products;
CREATE POLICY "approved coaches edit products" ON public.coach_products FOR UPDATE TO authenticated
  USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid() AND public.is_approved_coach());

-- ── Purchases (written by the Stripe webhook, or claim_free_product) ─────────
CREATE TABLE IF NOT EXISTS public.coach_purchases (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            uuid        REFERENCES public.coach_products(id) ON DELETE SET NULL,
  coach_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 text        NOT NULL,
  amount_cents          int         NOT NULL DEFAULT 0,
  fee_cents             int         NOT NULL DEFAULT 0,
  status                text        NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  stripe_session_id     text        UNIQUE,
  stripe_payment_intent text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS coach_purchases_coach ON public.coach_purchases (coach_id);
ALTER TABLE public.coach_purchases ENABLE ROW LEVEL SECURITY;
-- Coaches see their sales (amounts and dates, not who bought)
DROP POLICY IF EXISTS "buyers and coaches read purchases" ON public.coach_purchases;
CREATE POLICY "buyers and coaches read purchases" ON public.coach_purchases FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR coach_id = auth.uid() OR public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.coach_purchases FROM anon, authenticated;

-- Something people bought can only be unpublished, so buyers keep it
DROP POLICY IF EXISTS "delete unsold products" ON public.coach_products;
CREATE POLICY "delete unsold products" ON public.coach_products FOR DELETE TO authenticated
  USING (coach_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM coach_purchases p WHERE p.product_id = coach_products.id));

-- Can the caller open this product's workouts, tips and videos?
CREATE OR REPLACE FUNCTION public.can_view_product(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM coach_products pr
    WHERE pr.id = p_id AND (
      pr.coach_id = auth.uid()
      OR (pr.price_cents = 0 AND pr.published AND EXISTS (SELECT 1 FROM coach_profiles c WHERE c.user_id = pr.coach_id AND c.status = 'approved'))
      OR EXISTS (SELECT 1 FROM coach_purchases pu WHERE pu.product_id = pr.id AND pu.buyer_id = auth.uid() AND pu.status = 'paid')
    )
  );
$$;

-- Free products go into "Your workouts" like bought ones
CREATE OR REPLACE FUNCTION public.claim_free_product(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr coach_products;
BEGIN
  SELECT * INTO pr FROM coach_products WHERE id = p_id;
  IF pr.id IS NULL OR pr.price_cents <> 0 OR NOT pr.published
     OR NOT EXISTS (SELECT 1 FROM coach_profiles c WHERE c.user_id = pr.coach_id AND c.status = 'approved') THEN
    RAISE EXCEPTION 'This workout isn''t free' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO coach_purchases (product_id, coach_id, buyer_id, title)
  VALUES (pr.id, pr.coach_id, auth.uid(), pr.title)
  ON CONFLICT (product_id, buyer_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.claim_free_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_free_product(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_sale_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.amount_cents > 0 AND NEW.coach_id IS NOT NULL THEN
    PERFORM notify(NEW.coach_id, 'sale', 'You made a sale',
      format('%s · you earn $%s', NEW.title, to_char((NEW.amount_cents - NEW.fee_cents) / 100.0, 'FM999990.00')), '/?open=coach');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS coach_purchases_notify ON public.coach_purchases;
CREATE TRIGGER coach_purchases_notify AFTER INSERT ON public.coach_purchases
  FOR EACH ROW EXECUTE FUNCTION public.coach_sale_notify();

-- ── Content: exercises, sets, tips and video paths. Only owners and buyers read it ──
CREATE TABLE IF NOT EXISTS public.coach_product_content (
  product_id uuid  PRIMARY KEY REFERENCES public.coach_products(id) ON DELETE CASCADE,
  content    jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(content) = 'object' AND pg_column_size(content) < 400000)
);
ALTER TABLE public.coach_product_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners and buyers read content" ON public.coach_product_content;
CREATE POLICY "owners and buyers read content" ON public.coach_product_content FOR SELECT TO authenticated
  USING (public.can_view_product(product_id));
DROP POLICY IF EXISTS "coaches write own content" ON public.coach_product_content;
CREATE POLICY "coaches write own content" ON public.coach_product_content FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM coach_products pr WHERE pr.id = coach_product_content.product_id AND pr.coach_id = auth.uid()))
  WITH CHECK (public.is_approved_coach() AND EXISTS (SELECT 1 FROM coach_products pr WHERE pr.id = coach_product_content.product_id AND pr.coach_id = auth.uid()));

-- ── Storage: public avatars; private videos at <coach id>/<product id>-<name> ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('coach-avatars', 'coach-avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('coach-videos', 'coach-videos', false, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_view_coach_video(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid text := substring(storage.filename(p_name) FROM 1 FOR 36);
BEGIN
  IF (storage.foldername(p_name))[1] = auth.uid()::text THEN RETURN true; END IF;
  IF pid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  RETURN public.can_view_product(pid::uuid);
END $$;

DROP POLICY IF EXISTS "coaches upload own avatar" ON storage.objects;
CREATE POLICY "coaches upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'coach-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "coaches change own avatar" ON storage.objects;
CREATE POLICY "coaches change own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'coach-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "coaches delete own avatar" ON storage.objects;
CREATE POLICY "coaches delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'coach-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "approved coaches upload videos" ON storage.objects;
CREATE POLICY "approved coaches upload videos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'coach-videos' AND (storage.foldername(name))[1] = auth.uid()::text AND public.is_approved_coach());
DROP POLICY IF EXISTS "owners and buyers watch videos" ON storage.objects;
CREATE POLICY "owners and buyers watch videos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'coach-videos' AND public.can_view_coach_video(name));
DROP POLICY IF EXISTS "coaches delete own videos" ON storage.objects;
CREATE POLICY "coaches delete own videos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'coach-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 015_cardio
-- ═══════════════════════════════════════════════════════════════════════════

-- 015: runs and swims, logged on Progress > Cardio. Distance in metres, time in seconds.
-- Apply before the app version with the Cardio tab. Safe to re-run.
CREATE TABLE IF NOT EXISTS public.cardio_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  kind       text        NOT NULL CHECK (kind IN ('run', 'swim')),
  distance_m numeric(8,1) NOT NULL CHECK (distance_m > 0 AND distance_m <= 500000),
  seconds    int         NOT NULL CHECK (seconds > 0 AND seconds <= 172800),
  notes      text        NOT NULL DEFAULT '' CHECK (char_length(notes) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cardio_logs_user_date ON public.cardio_logs (user_id, date DESC);
ALTER TABLE public.cardio_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cardio_logs" ON public.cardio_logs;
CREATE POLICY "Users manage own cardio_logs" ON public.cardio_logs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 016_nickname_signs
-- ═══════════════════════════════════════════════════════════════════════════

-- 016: nicknames may also use "." and "-" (still 3-20 characters, lowercase), and need at least
-- one letter or number. Only signs that are safe in invite links (athrion.app/add/<nickname>).
-- The app checks the same rule (NICKNAME_RE in src/lib/points.js); until this runs, a nickname
-- with "." or "-" is refused with "That nickname is not allowed".
ALTER TABLE public.social_profiles DROP CONSTRAINT IF EXISTS social_profiles_nickname_check;
ALTER TABLE public.social_profiles ADD CONSTRAINT social_profiles_nickname_check CHECK (
  nickname ~ '^[a-z0-9._-]{3,20}$'
  AND nickname ~ '[a-z0-9]'
  AND nickname NOT IN ('athrion', 'admin', 'support', 'official', 'help')
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 017_swim_teams
-- ═══════════════════════════════════════════════════════════════════════════

-- 017: the Swim tab. Swims get a stroke, swimmers a photo, and anyone can start a swim team
-- as its coach. Swimmers join with the coach's invite link (athrion.app/swim/<code>, straight in)
-- or by finding the team in search (a request the coach accepts). The coach sees each
-- swimmer's photo and swims; nothing else of theirs. Apply before the app version with the
-- Swim tab. Safe to re-run.

-- ── Stroke per swim (older swims keep none) ────────────────────────────────
ALTER TABLE public.cardio_logs ADD COLUMN IF NOT EXISTS stroke text;
ALTER TABLE public.cardio_logs DROP CONSTRAINT IF EXISTS cardio_logs_stroke_check;
ALTER TABLE public.cardio_logs ADD CONSTRAINT cardio_logs_stroke_check
  CHECK (stroke IS NULL OR (kind = 'swim' AND stroke IN ('free', 'back', 'breast', 'fly', 'im')));

-- ── Swimmer photo ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swim_profiles (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_path text        CHECK (char_length(photo_path) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.swim_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own swim profile" ON public.swim_profiles;
CREATE POLICY "own swim profile" ON public.swim_profiles
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Teams: one per coach. Read and written only through the functions below ──
CREATE TABLE IF NOT EXISTS public.swim_teams (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 40),
  code       text        NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 10),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.swim_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coach sees own team" ON public.swim_teams;
CREATE POLICY "coach sees own team" ON public.swim_teams
  FOR SELECT TO authenticated USING (coach_id = auth.uid());

-- One team per swimmer: a request (pending) or a place on it (active)
CREATE TABLE IF NOT EXISTS public.swim_team_members (
  team_id    uuid        NOT NULL REFERENCES public.swim_teams(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE public.swim_team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "see own membership" ON public.swim_team_members;
CREATE POLICY "see own membership" ON public.swim_team_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── Coach ──────────────────────────────────────────────────────────────────
-- Start a team, or rename yours. Returns { id, name, code }.
CREATE OR REPLACE FUNCTION public.save_swim_team(p_name text)
RETURNS TABLE (id uuid, name text, code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM social_profiles s WHERE s.user_id = me) THEN
    RAISE EXCEPTION 'Pick a nickname first' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO swim_teams (coach_id, name) VALUES (me, btrim(p_name))
  ON CONFLICT (coach_id) DO UPDATE SET name = btrim(p_name);
  RETURN QUERY SELECT t.id, t.name, t.code FROM swim_teams t WHERE t.coach_id = me;
END $$;

-- The caller's own team, as its coach (no rows when they don't coach one)
CREATE OR REPLACE FUNCTION public.my_coached_team()
RETURNS TABLE (id uuid, name text, code text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.code FROM swim_teams t WHERE t.coach_id = auth.uid();
$$;

-- A fresh invite code; the old link stops working
CREATE OR REPLACE FUNCTION public.new_swim_team_code()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE swim_teams SET code = substr(md5(gen_random_uuid()::text), 1, 10)
  WHERE coach_id = auth.uid() RETURNING code;
$$;

-- Everyone on the coach's team and everyone asking to join, with what the roster shows
CREATE OR REPLACE FUNCTION public.my_swim_roster()
RETURNS TABLE (user_id uuid, nickname text, photo_path text, status text, joined_at timestamptz,
               last_swim date, swims_30d int, metres_30d numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, s.nickname, p.photo_path, m.status, m.created_at,
         (SELECT max(c.date) FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim'),
         (SELECT count(*)::int FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim' AND c.date > current_date - 30),
         (SELECT coalesce(sum(c.distance_m), 0) FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim' AND c.date > current_date - 30)
  FROM swim_teams t
  JOIN swim_team_members m ON m.team_id = t.id
  LEFT JOIN social_profiles s ON s.user_id = m.user_id
  LEFT JOIN swim_profiles p ON p.user_id = m.user_id
  WHERE t.coach_id = auth.uid()
  ORDER BY m.status DESC, s.nickname;
$$;

-- One swimmer's swims, for their coach (active members only)
CREATE OR REPLACE FUNCTION public.swimmer_swims(p_user uuid)
RETURNS SETOF public.cardio_logs LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.* FROM cardio_logs c
  WHERE c.user_id = p_user AND c.kind = 'swim'
    AND EXISTS (SELECT 1 FROM swim_team_members m JOIN swim_teams t ON t.id = m.team_id
                WHERE m.user_id = p_user AND m.status = 'active' AND t.coach_id = auth.uid())
  ORDER BY c.date DESC, c.created_at DESC
  LIMIT 500;
$$;

-- Accept or decline a request; removing an active swimmer uses the same call with false
CREATE OR REPLACE FUNCTION public.respond_swim_request(p_user uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE team uuid;
BEGIN
  SELECT id INTO team FROM swim_teams WHERE coach_id = auth.uid();
  IF team IS NULL THEN RAISE EXCEPTION 'You don''t coach a team' USING ERRCODE = '42501'; END IF;
  IF p_accept THEN
    UPDATE swim_team_members SET status = 'active' WHERE team_id = team AND user_id = p_user;
  ELSE
    DELETE FROM swim_team_members WHERE team_id = team AND user_id = p_user;
  END IF;
END $$;

-- ── Swimmer ────────────────────────────────────────────────────────────────
-- Teams by name or coach nickname, for the search bar
CREATE OR REPLACE FUNCTION public.search_swim_teams(p_q text)
RETURNS TABLE (id uuid, name text, coach_nickname text, swimmers int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, s.nickname,
         (SELECT count(*)::int FROM swim_team_members m WHERE m.team_id = t.id AND m.status = 'active')
  FROM swim_teams t LEFT JOIN social_profiles s ON s.user_id = t.coach_id
  WHERE char_length(btrim(p_q)) >= 2 AND t.coach_id <> auth.uid()
    AND (t.name ILIKE '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
         OR s.nickname ILIKE replace(replace(replace(lower(ltrim(btrim(p_q), '@')), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ORDER BY t.name
  LIMIT 20;
$$;

-- What an invite link points to, before joining
CREATE OR REPLACE FUNCTION public.swim_team_by_code(p_code text)
RETURNS TABLE (id uuid, name text, coach_nickname text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, s.nickname FROM swim_teams t LEFT JOIN social_profiles s ON s.user_id = t.coach_id
  WHERE t.code = lower(btrim(p_code));
$$;

-- Join: with the invite code straight onto the team, from search as a request.
-- Returns 'active' or 'pending'. Asking a new team replaces an open request.
CREATE OR REPLACE FUNCTION public.join_swim_team(p_team uuid DEFAULT NULL, p_code text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  t public.swim_teams;
  cur public.swim_team_members;
  st text := CASE WHEN p_code IS NULL THEN 'pending' ELSE 'active' END;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_code IS NOT NULL THEN SELECT * INTO t FROM swim_teams WHERE code = lower(btrim(p_code));
  ELSE SELECT * INTO t FROM swim_teams WHERE id = p_team; END IF;
  IF t.id IS NULL THEN RAISE EXCEPTION 'That team doesn''t exist any more' USING ERRCODE = 'P0002'; END IF;
  IF t.coach_id = me THEN RAISE EXCEPTION 'That''s your own team' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO cur FROM swim_team_members WHERE user_id = me;
  IF FOUND THEN
    IF cur.team_id = t.id THEN
      IF st = 'active' AND cur.status = 'pending' THEN
        UPDATE swim_team_members SET status = 'active' WHERE user_id = me;
        RETURN 'active';
      END IF;
      RETURN cur.status;
    END IF;
    IF cur.status = 'active' THEN
      RAISE EXCEPTION 'Leave your team first' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM swim_team_members WHERE user_id = me;
  END IF;
  INSERT INTO swim_team_members (team_id, user_id, status) VALUES (t.id, me, st);
  RETURN st;
END $$;

-- The caller's team as a swimmer (no rows when they're on none)
CREATE OR REPLACE FUNCTION public.my_swim_team()
RETURNS TABLE (id uuid, name text, coach_nickname text, coach_id uuid, coach_photo text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, s.nickname, t.coach_id, p.photo_path, m.status
  FROM swim_team_members m JOIN swim_teams t ON t.id = m.team_id
  LEFT JOIN social_profiles s ON s.user_id = t.coach_id
  LEFT JOIN swim_profiles p ON p.user_id = t.coach_id
  WHERE m.user_id = auth.uid();
$$;

-- Leave the team, or take back a request
CREATE OR REPLACE FUNCTION public.leave_swim_team()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM swim_team_members WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.save_swim_team(text), public.my_coached_team(), public.new_swim_team_code(), public.my_swim_roster(),
  public.swimmer_swims(uuid), public.respond_swim_request(uuid, boolean), public.search_swim_teams(text),
  public.swim_team_by_code(text), public.join_swim_team(uuid, text), public.my_swim_team(), public.leave_swim_team()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_swim_team(text), public.my_coached_team(), public.new_swim_team_code(), public.my_swim_roster(),
  public.swimmer_swims(uuid), public.respond_swim_request(uuid, boolean), public.search_swim_teams(text),
  public.swim_team_by_code(text), public.join_swim_team(uuid, text), public.my_swim_team(), public.leave_swim_team()
  TO authenticated;

-- ── Storage: private photos at <user id>/photo-<time>.<ext> ────────────────
-- Seen by the swimmer, their coach (also while the request is open), and a swimmer sees their coach's
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('swimmer-photos', 'swimmer-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "swimmer photos: read" ON storage.objects;
CREATE POLICY "swimmer photos: read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'swimmer-photos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.swim_team_members m JOIN public.swim_teams t ON t.id = m.team_id
               WHERE t.coach_id = auth.uid() AND m.user_id::text = (storage.foldername(name))[1])
    OR EXISTS (SELECT 1 FROM public.swim_team_members m JOIN public.swim_teams t ON t.id = m.team_id
               WHERE m.user_id = auth.uid() AND t.coach_id::text = (storage.foldername(name))[1])
  ));
DROP POLICY IF EXISTS "swimmer photos: upload own" ON storage.objects;
CREATE POLICY "swimmer photos: upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'swimmer-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "swimmer photos: delete own" ON storage.objects;
CREATE POLICY "swimmer photos: delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'swimmer-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 018_swim_coach_approval
-- ═══════════════════════════════════════════════════════════════════════════

-- 018: only coaches an admin approved can start or rename a swim team. Swimmers apply from
-- the Swim tab with the same coach application as the shop (014, specialty "Swimming"), and
-- admins approve it in Coach applications as before. Apply after 017. Safe to re-run.

CREATE OR REPLACE FUNCTION public.save_swim_team(p_name text)
RETURNS TABLE (id uuid, name text, code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_approved_coach() THEN
    RAISE EXCEPTION 'Only approved coaches can run a team' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM social_profiles s WHERE s.user_id = me) THEN
    RAISE EXCEPTION 'Pick a nickname first' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO swim_teams (coach_id, name) VALUES (me, btrim(p_name))
  ON CONFLICT (coach_id) DO UPDATE SET name = btrim(p_name);
  RETURN QUERY SELECT t.id, t.name, t.code FROM swim_teams t WHERE t.coach_id = me;
END $$;

-- Swim coaches hear about the review on the Swim tab, shop coaches on their coach page
CREATE OR REPLACE FUNCTION public.coach_review_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE swim boolean := 'Swimming' = ANY (NEW.specialties);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' AND swim THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Start your swim team on the Swim tab.', '/?open=swim');
    ELSIF NEW.status = 'approved' THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Set up payouts and publish your first workout.', '/?open=coach');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM notify(NEW.user_id, 'coach', 'Your coach application', 'It wasn''t approved this time. Open it to see why and apply again.',
        CASE WHEN swim THEN '/?open=swim' ELSE '/?open=coach' END);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 019_team_notifications
-- ═══════════════════════════════════════════════════════════════════════════

-- 019: notifications for swim teams and coach applications. Apply after 018. Safe to re-run.
--
--   team_created                    the coach, when their team is made (in-app only)
--   team_request                    the coach, when someone asks to join from search (push)
--   team_joined                     the coach when someone joins with the link (push);
--                                   the swimmer too, in-app only
--   team_accepted, team_declined    the swimmer, when the coach answers their request (push)
--   team_removed                    the swimmer, when the coach takes them off the team (push)
--   team_left                       the coach, when a swimmer leaves (push)
--   coach_application               every admin, when someone applies or applies again (push)
-- Push switch for the team_* kinds: reminder_settings.notify_team. Links open Swim → Team
-- (/?open=team); admins' coach_application links open it too for swim coaches.

ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS notify_team boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.swim_nick(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce('@' || (SELECT nickname FROM social_profiles WHERE user_id = p_user), 'A swimmer');
$$;
REVOKE ALL ON FUNCTION public.swim_nick(uuid) FROM PUBLIC, anon, authenticated;

-- ── Team made ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.swim_team_created_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM notify(NEW.coach_id, 'team_created', NEW.name || ' is ready',
    'Invite your swimmers with your team link from Swim, Team.', '/?open=team', false);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS swim_teams_notify ON public.swim_teams;
CREATE TRIGGER swim_teams_notify AFTER INSERT ON public.swim_teams
  FOR EACH ROW EXECUTE FUNCTION public.swim_team_created_notify();

-- ── Joining, answers, leaving ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.swim_member_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.swim_teams;
  who uuid := auth.uid();
BEGIN
  SELECT * INTO t FROM swim_teams WHERE id = coalesce(NEW.team_id, OLD.team_id);
  IF t.id IS NULL THEN RETURN NULL; END IF; -- the team itself is being deleted

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      PERFORM notify(t.coach_id, 'team_request', swim_nick(NEW.user_id) || ' wants to join',
        'Accept or decline on Swim, Team. ' || t.name || '.', '/?open=team');
    ELSE
      PERFORM notify(t.coach_id, 'team_joined', swim_nick(NEW.user_id) || ' joined ' || t.name,
        'They joined with your invite link. Their swims show on their page.', '/?open=team');
      PERFORM notify(NEW.user_id, 'team_joined', 'You''re on ' || t.name,
        'Your coach ' || swim_nick(t.coach_id) || ' now sees your photo and swims.', '/?open=team', false);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status = 'active' THEN
      -- Accepted by the coach, or the swimmer used the link after asking
      IF who = t.coach_id THEN
        PERFORM notify(NEW.user_id, 'team_accepted', t.name || ' accepted you',
          'Your coach ' || swim_nick(t.coach_id) || ' now sees your photo and swims.', '/?open=team');
      ELSE
        PERFORM notify(t.coach_id, 'team_joined', swim_nick(NEW.user_id) || ' joined ' || t.name,
          'They joined with your invite link. Their swims show on their page.', '/?open=team');
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF who = t.coach_id THEN
      IF OLD.status = 'pending' THEN
        PERFORM notify(OLD.user_id, 'team_declined', t.name || ' didn''t accept your request',
          'You can ask another team, or use an invite link from your coach.', '/?open=team');
      ELSE
        PERFORM notify(OLD.user_id, 'team_removed', 'You''re no longer on ' || t.name,
          'Your coach took you off the team. Your swims stay yours.', '/?open=team');
      END IF;
    ELSIF who = OLD.user_id AND OLD.status = 'active' THEN
      PERFORM notify(t.coach_id, 'team_left', swim_nick(OLD.user_id) || ' left ' || t.name, '', '/?open=team');
    END IF;
    -- No one signed in (account deleted by the server): nothing to say
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS swim_team_members_notify ON public.swim_team_members;
CREATE TRIGGER swim_team_members_notify AFTER INSERT OR UPDATE OF status OR DELETE ON public.swim_team_members
  FOR EACH ROW EXECUTE FUNCTION public.swim_member_notify();

-- ── Coach applications reach every admin ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.coach_application_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  swim boolean := 'Swimming' = ANY (NEW.specialties);
  a record;
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN
    FOR a IN SELECT user_id FROM app_admins LOOP
      PERFORM notify(a.user_id, 'coach_application', 'New coach application',
        NEW.display_name || CASE WHEN swim THEN ' wants to coach a swim team.' ELSE ' wants to sell workouts.' END,
        CASE WHEN swim THEN '/?open=team' ELSE '/?open=coach' END);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS coach_profiles_application_notify ON public.coach_profiles;
CREATE TRIGGER coach_profiles_application_notify AFTER INSERT OR UPDATE OF status ON public.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.coach_application_notify();

-- Review results for swim coaches open Swim → Team (018 sent them to the My swims side)
CREATE OR REPLACE FUNCTION public.coach_review_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE swim boolean := 'Swimming' = ANY (NEW.specialties);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' AND swim THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Start your swim team on the Swim tab.', '/?open=team');
    ELSIF NEW.status = 'approved' THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Set up payouts and publish your first workout.', '/?open=coach');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM notify(NEW.user_id, 'coach', 'Your coach application', 'It wasn''t approved this time. Open it to see why and apply again.',
        CASE WHEN swim THEN '/?open=team' ELSE '/?open=coach' END);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 020_team_leaderboard
-- ═══════════════════════════════════════════════════════════════════════════

-- 020: the coach's stroke leaderboard. Each active swimmer's PR per stroke: their fastest pace
-- on a swim of at least 25 m (the same rule as the PR tiles, strokeStats in src/lib/swim.js).
-- Apply after 017. Safe to re-run.
CREATE OR REPLACE FUNCTION public.my_team_prs()
RETURNS TABLE (user_id uuid, stroke text, distance_m numeric, seconds int, date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (c.user_id, c.stroke) c.user_id, c.stroke, c.distance_m, c.seconds, c.date
  FROM swim_teams t
  JOIN swim_team_members m ON m.team_id = t.id AND m.status = 'active'
  JOIN cardio_logs c ON c.user_id = m.user_id AND c.kind = 'swim' AND c.stroke IS NOT NULL AND c.distance_m >= 25
  WHERE t.coach_id = auth.uid()
  ORDER BY c.user_id, c.stroke, c.seconds / c.distance_m, c.date;
$$;
REVOKE ALL ON FUNCTION public.my_team_prs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_prs() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 021_goals_and_reviews
-- ═══════════════════════════════════════════════════════════════════════════

-- 021: weight goals on the plan, and app reviews on the landing page. Apply before the app
-- version that sets goals (it saves these columns). Safe to re-run.

-- ── Weight goal: target weight (already there), pace, where and when it started, when it lands ──
ALTER TABLE public.fitness_profiles
  ADD COLUMN IF NOT EXISTS goal_pace            text CHECK (goal_pace IN ('gentle', 'steady', 'fast')),
  ADD COLUMN IF NOT EXISTS goal_start_weight_lb numeric CHECK (goal_start_weight_lb > 0 AND goal_start_weight_lb < 1500),
  ADD COLUMN IF NOT EXISTS goal_start_date      date,
  ADD COLUMN IF NOT EXISTS goal_target_date     date;

-- ── Reviews: one per person, public on the landing page ──────────────────
-- name is what the landing page shows (first name and last initial, chosen in the app).
-- Admins can hide one; hidden reviews leave the page and the average.
CREATE TABLE IF NOT EXISTS public.app_reviews (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  rating     int         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       text        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 600),
  hidden     boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_reviews_shown ON public.app_reviews (created_at DESC) WHERE NOT hidden;
ALTER TABLE public.app_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads shown reviews" ON public.app_reviews;
CREATE POLICY "anyone reads shown reviews" ON public.app_reviews FOR SELECT TO anon USING (NOT hidden);
DROP POLICY IF EXISTS "signed in: shown, own, admins all" ON public.app_reviews;
CREATE POLICY "signed in: shown, own, admins all" ON public.app_reviews FOR SELECT TO authenticated
  USING (NOT hidden OR user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "write own review" ON public.app_reviews;
CREATE POLICY "write own review" ON public.app_reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "edit own review, admins hide" ON public.app_reviews;
CREATE POLICY "edit own review, admins hide" ON public.app_reviews FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "delete own review" ON public.app_reviews;
CREATE POLICY "delete own review" ON public.app_reviews FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- People write their own name, stars and text; only admins change hidden (the trigger below)
REVOKE ALL ON public.app_reviews FROM anon, authenticated;
GRANT SELECT (name, rating, body, created_at) ON public.app_reviews TO anon; -- no ids for the public
GRANT SELECT ON public.app_reviews TO authenticated;
GRANT INSERT (user_id, name, rating, body) ON public.app_reviews TO authenticated;
GRANT UPDATE (name, rating, body, hidden, updated_at) ON public.app_reviews TO authenticated;
GRANT DELETE ON public.app_reviews TO authenticated;

-- Writers can't unhide themselves: an update by the writer keeps hidden as it was
CREATE OR REPLACE FUNCTION public.app_review_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN NEW.hidden := OLD.hidden; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS app_reviews_guard ON public.app_reviews;
CREATE TRIGGER app_reviews_guard BEFORE UPDATE ON public.app_reviews
  FOR EACH ROW EXECUTE FUNCTION public.app_review_guard();

-- The landing page's stars: average and count of shown reviews
CREATE OR REPLACE FUNCTION public.review_summary()
RETURNS TABLE (average numeric, count int) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(avg(rating)::numeric, 1), count(*)::int FROM app_reviews WHERE NOT hidden;
$$;
GRANT EXECUTE ON FUNCTION public.review_summary() TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 022_open_reviews
-- ═══════════════════════════════════════════════════════════════════════════

-- 022: anyone can write a review on the landing page, without an account. Those come in through
-- /api/review (service key, honeypot and a per-visitor limit), hidden until an admin shows them,
-- and every admin is notified. Signed-in reviews (021) still post straight away, one per person.
-- Apply after 021, before the app version with the landing review form. Safe to re-run.

ALTER TABLE public.app_reviews ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.app_reviews DROP CONSTRAINT IF EXISTS app_reviews_pkey;
ALTER TABLE public.app_reviews ADD PRIMARY KEY (id);
ALTER TABLE public.app_reviews ALTER COLUMN user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_reviews_one_per_user ON public.app_reviews (user_id) WHERE user_id IS NOT NULL;
-- A one-way hash of the visitor's address, only to limit how many reviews one visitor sends
ALTER TABLE public.app_reviews ADD COLUMN IF NOT EXISTS ip_hash text CHECK (char_length(ip_hash) <= 64);
CREATE INDEX IF NOT EXISTS app_reviews_ip_recent ON public.app_reviews (ip_hash, created_at) WHERE ip_hash IS NOT NULL;

-- The app reads ids (admins hide or show by id); the public still sees no ids or hashes
REVOKE SELECT ON public.app_reviews FROM authenticated;
GRANT SELECT (id, user_id, name, rating, body, hidden, created_at, updated_at) ON public.app_reviews TO authenticated;

-- A review from someone without an account: tell every admin it is waiting
CREATE OR REPLACE FUNCTION public.app_review_waiting_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF NEW.user_id IS NULL AND NEW.hidden THEN
    FOR a IN SELECT user_id FROM app_admins LOOP
      PERFORM notify(a.user_id, 'review', 'New review to approve',
        NEW.name || ' gave ' || NEW.rating || ' stars: "' || left(NEW.body, 80) || CASE WHEN char_length(NEW.body) > 80 THEN '…"' ELSE '"' END,
        '/?open=review');
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS app_reviews_waiting_notify ON public.app_reviews;
CREATE TRIGGER app_reviews_waiting_notify AFTER INSERT ON public.app_reviews
  FOR EACH ROW EXECUTE FUNCTION public.app_review_waiting_notify();

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 023_lift_goals
-- ═══════════════════════════════════════════════════════════════════════════

-- 023: lift targets for building muscle or strength, shown as progress on Plan:
-- [{ "name": "Bench Press", "startLb": 176, "targetLb": 198 }], at most three. Best set of 5 reps.
-- Apply before the app version that sets them (it saves this column). Safe to re-run.
ALTER TABLE public.fitness_profiles ADD COLUMN IF NOT EXISTS goal_lifts jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.fitness_profiles DROP CONSTRAINT IF EXISTS fitness_profiles_goal_lifts_check;
ALTER TABLE public.fitness_profiles ADD CONSTRAINT fitness_profiles_goal_lifts_check
  CHECK (jsonb_typeof(goal_lifts) = 'array' AND jsonb_array_length(goal_lifts) <= 3);

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 024_leaderboard_distances
-- ═══════════════════════════════════════════════════════════════════════════

-- 024: the coach's leaderboard ranks within a distance, so a 50 sprint never beats a 400.
-- my_team_prs now returns each active swimmer's best pace per stroke AND per distance group:
-- sprint under 150 m, middle 150-399 m, distance 400 m and up (DISTANCE_BANDS in src/lib/swim.js;
-- 100 yd = 91 m and 500 yd = 457 m fall in the same groups). Same columns as 020, so the app
-- works before and after this runs. Apply after 020. Safe to re-run.
CREATE OR REPLACE FUNCTION public.my_team_prs()
RETURNS TABLE (user_id uuid, stroke text, distance_m numeric, seconds int, date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (c.user_id, c.stroke, CASE WHEN c.distance_m < 150 THEN 1 WHEN c.distance_m < 400 THEN 2 ELSE 3 END)
         c.user_id, c.stroke, c.distance_m, c.seconds, c.date
  FROM swim_teams t
  JOIN swim_team_members m ON m.team_id = t.id AND m.status = 'active'
  JOIN cardio_logs c ON c.user_id = m.user_id AND c.kind = 'swim' AND c.stroke IS NOT NULL AND c.distance_m >= 25
  WHERE t.coach_id = auth.uid()
  ORDER BY c.user_id, c.stroke, CASE WHEN c.distance_m < 150 THEN 1 WHEN c.distance_m < 400 THEN 2 ELSE 3 END,
           c.seconds / c.distance_m, c.date;
$$;
REVOKE ALL ON FUNCTION public.my_team_prs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_prs() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ 025_practices_and_meal_plans
-- ═══════════════════════════════════════════════════════════════════════════

-- 025: swim coaches post the day's practice to their team, and Pro members keep an AI meal plan.
-- Apply after 017 and 019. Safe to re-run.

-- ── Team practices ───────────────────────────────────────────────────────────
-- One practice per team per day: warm-up, main and cool-down sets, each
-- { part: 'warmup'|'main'|'cooldown', reps, distance (in the coach's pool unit), unit: 'm'|'yd',
--   stroke, send_off ("1:45" or ""), note }. Swimmers on the team read it; only the coach writes.
CREATE TABLE IF NOT EXISTS public.swim_practices (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid        NOT NULL REFERENCES public.swim_teams(id) ON DELETE CASCADE,
  coach_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  title      text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  items      jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 40),
  notes      text        NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, date)
);
ALTER TABLE public.swim_practices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach writes practices" ON public.swim_practices;
CREATE POLICY "coach writes practices" ON public.swim_practices
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid() AND EXISTS (SELECT 1 FROM swim_teams t WHERE t.id = team_id AND t.coach_id = auth.uid()));

DROP POLICY IF EXISTS "team reads practices" ON public.swim_practices;
CREATE POLICY "team reads practices" ON public.swim_practices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM swim_team_members m WHERE m.team_id = swim_practices.team_id AND m.user_id = auth.uid() AND m.status = 'active'));

-- Swimmers hear about today's (or a coming day's) practice when it's posted, and again if the
-- coach changes the sets on the day. Pushed unless they turned team pushes off (notify_team).
CREATE OR REPLACE FUNCTION public.notify_practice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record;
  team_name text;
  metres int;
  when_text text;
BEGIN
  IF NEW.date < current_date THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.date <> current_date OR (OLD.items = NEW.items AND OLD.title = NEW.title)) THEN RETURN NEW; END IF;
  SELECT name INTO team_name FROM swim_teams WHERE id = NEW.team_id;
  SELECT coalesce(sum((i->>'reps')::numeric * (i->>'distance')::numeric), 0)::int INTO metres
    FROM jsonb_array_elements(NEW.items) i
    WHERE (i->>'reps') ~ '^\d+$' AND (i->>'distance') ~ '^\d+$';
  when_text := CASE WHEN NEW.date = current_date THEN 'Today' WHEN NEW.date = current_date + 1 THEN 'Tomorrow' ELSE to_char(NEW.date, 'Dy Mon DD') END;
  FOR m IN SELECT user_id FROM swim_team_members WHERE team_id = NEW.team_id AND status = 'active' LOOP
    PERFORM notify(m.user_id, 'team_practice',
      CASE WHEN TG_OP = 'UPDATE' THEN 'Practice updated: ' ELSE when_text || ': ' END || NEW.title,
      team_name || CASE WHEN metres > 0 THEN ' · ' || metres || ' total' ELSE '' END || '. Open it to see the sets.',
      '/?open=team');
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS swim_practices_notify ON public.swim_practices;
CREATE TRIGGER swim_practices_notify AFTER INSERT OR UPDATE ON public.swim_practices
  FOR EACH ROW EXECUTE FUNCTION public.notify_practice();

-- ── AI meal plans (Pro) ──────────────────────────────────────────────────────
-- The latest 7-day plan per person, written by the generate-meal-plan Edge Function with the
-- person's own token (so RLS applies), with the preferences it was built from.
CREATE TABLE IF NOT EXISTS public.meal_plans (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan       jsonb       NOT NULL,
  prefs      jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own meal plan" ON public.meal_plans;
CREATE POLICY "own meal plan" ON public.meal_plans
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
