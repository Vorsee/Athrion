-- 027: swimmers see their team: teammates and the team's results. Apply after 026. Safe to re-run.
-- A swimmer is shown to teammates (name, photo, 30-day distance and best paces) only while
-- show_to_team is on. Swimmers who joined before this (told "your coach sees… nothing else") start
-- hidden and can turn it on; anyone joining from now on starts shown, and the join card says so.
-- The app works before and after this runs: before it, the swimmer's Team tab shows no teammates.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'swim_team_members' AND column_name = 'show_to_team') THEN
    ALTER TABLE public.swim_team_members ADD COLUMN show_to_team boolean NOT NULL DEFAULT false;
    ALTER TABLE public.swim_team_members ALTER COLUMN show_to_team SET DEFAULT true;
  END IF;
END $$;

-- Turn being shown to teammates on or off (the caller's own membership)
CREATE OR REPLACE FUNCTION public.set_swim_team_visible(p_show boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  UPDATE swim_team_members SET show_to_team = coalesce(p_show, false) WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You''re not on a team' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_swim_team_visible(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_swim_team_visible(boolean) TO authenticated;

-- The caller's team as a swimmer, now with whether they're shown to teammates
DROP FUNCTION IF EXISTS public.my_swim_team();
CREATE FUNCTION public.my_swim_team()
RETURNS TABLE (id uuid, name text, coach_nickname text, coach_id uuid, coach_photo text, status text, my_name text, visible boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, s.nickname, t.coach_id, p.photo_path, m.status, m.display_name, m.show_to_team
  FROM swim_team_members m JOIN swim_teams t ON t.id = m.team_id
  LEFT JOIN social_profiles s ON s.user_id = t.coach_id
  LEFT JOIN swim_profiles p ON p.user_id = t.coach_id
  WHERE m.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_swim_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_swim_team() TO authenticated;

-- Teammates of an active swimmer: everyone active and shown on the same team, and the caller
-- (is_me). Same columns as my_swim_roster where they overlap, so the app reuses its views.
CREATE OR REPLACE FUNCTION public.my_teammates()
RETURNS TABLE (user_id uuid, nickname text, display_name text, photo_path text, status text,
               swims_30d int, metres_30d numeric, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.user_id, s.nickname, o.display_name, p.photo_path, o.status,
         (SELECT count(*)::int FROM cardio_logs c WHERE c.user_id = o.user_id AND c.kind = 'swim' AND c.date > current_date - 30),
         (SELECT coalesce(sum(c.distance_m), 0) FROM cardio_logs c WHERE c.user_id = o.user_id AND c.kind = 'swim' AND c.date > current_date - 30),
         o.user_id = auth.uid()
  FROM swim_team_members me
  JOIN swim_team_members o ON o.team_id = me.team_id AND o.status = 'active' AND (o.show_to_team OR o.user_id = me.user_id)
  LEFT JOIN social_profiles s ON s.user_id = o.user_id
  LEFT JOIN swim_profiles p ON p.user_id = o.user_id
  WHERE me.user_id = auth.uid() AND me.status = 'active'
  ORDER BY coalesce(o.display_name, s.nickname);
$$;
REVOKE ALL ON FUNCTION public.my_teammates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_teammates() TO authenticated;

-- The team's results for a swimmer: each shown teammate's best pace per stroke and distance group,
-- the same rule as the coach's board (50 m or more; sprint / middle / distance)
CREATE OR REPLACE FUNCTION public.my_teammates_prs()
RETURNS TABLE (user_id uuid, stroke text, distance_m numeric, seconds int, date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (c.user_id, c.stroke, CASE WHEN c.distance_m < 150 THEN 1 WHEN c.distance_m < 400 THEN 2 ELSE 3 END)
         c.user_id, c.stroke, c.distance_m, c.seconds, c.date
  FROM swim_team_members me
  JOIN swim_team_members o ON o.team_id = me.team_id AND o.status = 'active' AND (o.show_to_team OR o.user_id = me.user_id)
  JOIN cardio_logs c ON c.user_id = o.user_id AND c.kind = 'swim' AND c.stroke IS NOT NULL AND c.distance_m >= 50
  WHERE me.user_id = auth.uid() AND me.status = 'active'
  ORDER BY c.user_id, c.stroke, CASE WHEN c.distance_m < 150 THEN 1 WHEN c.distance_m < 400 THEN 2 ELSE 3 END,
           c.seconds / c.distance_m, c.date;
$$;
REVOKE ALL ON FUNCTION public.my_teammates_prs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_teammates_prs() TO authenticated;

-- Photos: teammates who are both active and shown can see each other's swimmer photo
DROP POLICY IF EXISTS "swimmer photos: read" ON storage.objects;
CREATE POLICY "swimmer photos: read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'swimmer-photos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.swim_team_members m JOIN public.swim_teams t ON t.id = m.team_id
               WHERE t.coach_id = auth.uid() AND m.user_id::text = (storage.foldername(name))[1])
    OR EXISTS (SELECT 1 FROM public.swim_team_members m JOIN public.swim_teams t ON t.id = m.team_id
               WHERE m.user_id = auth.uid() AND t.coach_id::text = (storage.foldername(name))[1])
    OR EXISTS (SELECT 1 FROM public.swim_team_members me JOIN public.swim_team_members o ON o.team_id = me.team_id
               WHERE me.user_id = auth.uid() AND me.status = 'active'
                 AND o.status = 'active' AND o.show_to_team AND o.user_id::text = (storage.foldername(name))[1])
  ));
