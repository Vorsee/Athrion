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
