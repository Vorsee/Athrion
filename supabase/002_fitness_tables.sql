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
