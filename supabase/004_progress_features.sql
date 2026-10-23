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
