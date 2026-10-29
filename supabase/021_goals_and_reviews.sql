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
