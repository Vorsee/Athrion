-- 020: the coach's stroke leaderboard. Each active swimmer's PR per stroke: their fastest pace
-- on a swim of at least 25 m (the same rule as the PR tiles, strokeStats in src/lib/swim.js).
-- Apply after 017. Safe to re-run.
CREATE OR REPLACE FUNCTION public.my_team_prs()
RETURNS TABLE (user_id uuid, stroke text, distance_m numeric, seconds int, date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (c.user_id, c.stroke) c.user_id, c.stroke, c.distance_m, c.seconds, c.date
  FROM swim_teams t
  JOIN swim_team_members m ON m.team_id = t.id AND m.status = 'active'
  JOIN cardio_logs c ON c.user_id = m.user_id AND c.kind = 'swim' AND c.stroke IS NOT NULL AND c.distance_m >= 25
  WHERE t.coach_id = auth.uid()
  ORDER BY c.user_id, c.stroke, c.seconds / c.distance_m, c.date;
$$;
REVOKE ALL ON FUNCTION public.my_team_prs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_prs() TO authenticated;
