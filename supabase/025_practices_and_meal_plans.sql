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
