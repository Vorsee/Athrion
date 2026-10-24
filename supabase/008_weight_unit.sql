-- 008: remember whether the person uses lb or kg. Weights stay stored in lb;
-- this only drives display and input. Run before deploying the app that writes it.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS weight_unit text NOT NULL DEFAULT 'lb'
  CHECK (weight_unit IN ('lb', 'kg'));
