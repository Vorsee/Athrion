-- 024: the coach's leaderboard ranks within a distance, so a 50 sprint never beats a 400.
-- my_team_prs now returns each active swimmer's best pace per stroke AND per distance group:
-- sprint under 150 m, middle 150-399 m, distance 400 m and up (DISTANCE_BANDS in src/lib/swim.js;
-- 100 yd = 91 m and 500 yd = 457 m fall in the same groups). Same columns as 020, so the app
-- works before and after this runs. Apply after 020. Safe to re-run.
CREATE OR REPLACE FUNCTION public.my_team_prs()
RETURNS TABLE (user_id uuid, stroke text, distance_m numeric, seconds int, date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (c.user_id, c.stroke, CASE WHEN c.distance_m < 150 THEN 1 WHEN c.distance_m < 400 THEN 2 ELSE 3 END)
         c.user_id, c.stroke, c.distance_m, c.seconds, c.date
  FROM swim_teams t
  JOIN swim_team_members m ON m.team_id = t.id AND m.status = 'active'
  JOIN cardio_logs c ON c.user_id = m.user_id AND c.kind = 'swim' AND c.stroke IS NOT NULL AND c.distance_m >= 25
  WHERE t.coach_id = auth.uid()
  ORDER BY c.user_id, c.stroke, CASE WHEN c.distance_m < 150 THEN 1 WHEN c.distance_m < 400 THEN 2 ELSE 3 END,
           c.seconds / c.distance_m, c.date;
$$;
REVOKE ALL ON FUNCTION public.my_team_prs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_prs() TO authenticated;
