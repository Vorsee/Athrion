-- 013: Train together rooms planned set by set. plan = [{ name, sets: [{ reps, rest }] }]:
-- a reps target (null = any) and the rest after each set. The old columns (exercises,
-- total_sets, rest_secs) are still written, so older app versions keep working.
-- Safe to re-run; the app works before this is applied (rooms then use the same sets for every exercise).
ALTER TABLE public.group_sessions ADD COLUMN IF NOT EXISTS plan jsonb;

ALTER TABLE public.group_sessions DROP CONSTRAINT IF EXISTS group_sessions_plan_shape;
ALTER TABLE public.group_sessions ADD CONSTRAINT group_sessions_plan_shape
  CHECK (plan IS NULL OR (jsonb_typeof(plan) = 'array' AND jsonb_array_length(plan) <= 40 AND pg_column_size(plan) < 64000));
