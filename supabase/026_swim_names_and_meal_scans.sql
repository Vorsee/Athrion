-- 026: swimmers choose the name their coach sees, a PR needs 50 m or more, and free accounts get
-- one AI photo meal scan a day (Pro is unlimited). Apply after 024 and 025. Safe to re-run.
-- The app works before and after this runs: without it the coach sees @nicknames, and the photo
-- scan stays Pro-only on the server.

-- ── The name a swimmer gives their coach ─────────────────────────────────────
ALTER TABLE public.swim_team_members ADD COLUMN IF NOT EXISTS display_name text
  CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 40);

-- Set (or clear, with '') the name on the caller's own membership
CREATE OR REPLACE FUNCTION public.set_swim_team_name(p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  UPDATE swim_team_members SET display_name = nullif(btrim(left(coalesce(p_name, ''), 40)), '')
  WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You''re not on a team' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_swim_team_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_swim_team_name(text) TO authenticated;

-- The roster and the swimmer's own team now carry that name (new columns, so drop first)
DROP FUNCTION IF EXISTS public.my_swim_roster();
CREATE FUNCTION public.my_swim_roster()
RETURNS TABLE (user_id uuid, nickname text, photo_path text, status text, joined_at timestamptz,
               last_swim date, swims_30d int, metres_30d numeric, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, s.nickname, p.photo_path, m.status, m.created_at,
         (SELECT max(c.date) FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim'),
         (SELECT count(*)::int FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim' AND c.date > current_date - 30),
         (SELECT coalesce(sum(c.distance_m), 0) FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim' AND c.date > current_date - 30),
         m.display_name
  FROM swim_teams t
  JOIN swim_team_members m ON m.team_id = t.id
  LEFT JOIN social_profiles s ON s.user_id = m.user_id
  LEFT JOIN swim_profiles p ON p.user_id = m.user_id
  WHERE t.coach_id = auth.uid()
  ORDER BY m.status DESC, coalesce(m.display_name, s.nickname);
$$;
REVOKE ALL ON FUNCTION public.my_swim_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_swim_roster() TO authenticated;

DROP FUNCTION IF EXISTS public.my_swim_team();
CREATE FUNCTION public.my_swim_team()
RETURNS TABLE (id uuid, name text, coach_nickname text, coach_id uuid, coach_photo text, status text, my_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, s.nickname, t.coach_id, p.photo_path, m.status, m.display_name
  FROM swim_team_members m JOIN swim_teams t ON t.id = m.team_id
  LEFT JOIN social_profiles s ON s.user_id = t.coach_id
  LEFT JOIN swim_profiles p ON p.user_id = t.coach_id
  WHERE m.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_swim_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_swim_team() TO authenticated;

-- ── A PR needs at least 50 m (PR_MIN_M in src/lib/swim.js) ───────────────────
CREATE OR REPLACE FUNCTION public.my_team_prs()
RETURNS TABLE (user_id uuid, stroke text, distance_m numeric, seconds int, date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (c.user_id, c.stroke, CASE WHEN c.distance_m < 150 THEN 1 WHEN c.distance_m < 400 THEN 2 ELSE 3 END)
         c.user_id, c.stroke, c.distance_m, c.seconds, c.date
  FROM swim_teams t
  JOIN swim_team_members m ON m.team_id = t.id AND m.status = 'active'
  JOIN cardio_logs c ON c.user_id = m.user_id AND c.kind = 'swim' AND c.stroke IS NOT NULL AND c.distance_m >= 50
  WHERE t.coach_id = auth.uid()
  ORDER BY c.user_id, c.stroke, CASE WHEN c.distance_m < 150 THEN 1 WHEN c.distance_m < 400 THEN 2 ELSE 3 END,
           c.seconds / c.distance_m, c.date;
$$;
REVOKE ALL ON FUNCTION public.my_team_prs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_prs() TO authenticated;

-- ── Free AI photo scans: one a day ───────────────────────────────────────────
-- Written only by the functions below (no insert or delete policy), so the count can't be reset
-- from the app. The day is UTC, like the server's.
CREATE TABLE IF NOT EXISTS public.meal_scans (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     date NOT NULL DEFAULT current_date,
  used    int  NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.meal_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own meal scans" ON public.meal_scans;
CREATE POLICY "read own meal scans" ON public.meal_scans FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Take today's free scan: true when there was one left. analyze-meal calls it for free accounts.
CREATE OR REPLACE FUNCTION public.claim_meal_scan()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  INSERT INTO meal_scans (user_id, day, used) VALUES (auth.uid(), current_date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET used = meal_scans.used + 1
  RETURNING used INTO n;
  IF n > 1 THEN
    UPDATE meal_scans SET used = used - 1 WHERE user_id = auth.uid() AND day = current_date;
    RETURN false;
  END IF;
  RETURN true;
END $$;
-- Give it back when the scan itself failed, so a broken photo doesn't use up the day
CREATE OR REPLACE FUNCTION public.release_meal_scan()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE meal_scans SET used = greatest(0, used - 1) WHERE user_id = auth.uid() AND day = current_date;
$$;
REVOKE ALL ON FUNCTION public.claim_meal_scan(), public.release_meal_scan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_meal_scan(), public.release_meal_scan() TO authenticated;
