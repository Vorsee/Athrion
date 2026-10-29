-- 023: lift targets for building muscle or strength, shown as progress on Plan:
-- [{ "name": "Bench Press", "startLb": 176, "targetLb": 198 }], at most three. Best set of 5 reps.
-- Apply before the app version that sets them (it saves this column). Safe to re-run.
ALTER TABLE public.fitness_profiles ADD COLUMN IF NOT EXISTS goal_lifts jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.fitness_profiles DROP CONSTRAINT IF EXISTS fitness_profiles_goal_lifts_check;
ALTER TABLE public.fitness_profiles ADD CONSTRAINT fitness_profiles_goal_lifts_check
  CHECK (jsonb_typeof(goal_lifts) = 'array' AND jsonb_array_length(goal_lifts) <= 3);
