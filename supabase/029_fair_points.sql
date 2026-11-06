-- 029: fair points. A workout only earns points (its day, its week, its PRs) when it was saved
-- within 2 days of the day it's dated, so imports from Strong or Hevy and workouts added for
-- older days stay in the log and the charts but can't climb the monthly board (the top 3 win a
-- free month). Live logging and yesterday's catch-up count as before. points.js says the same.
-- Replaces month_points from 009; same signature, so leaderboard() and close_month() pick it up.
-- Safe to re-run.
CREATE OR REPLACE FUNCTION public.month_points(p_month date)
RETURNS TABLE (user_id uuid, points int, workout_days int, full_weeks int, prs int, together int, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT date_trunc('month', p_month)::date AS m0,
           (date_trunc('month', p_month) + interval '1 month')::date AS m1
  ),
  logs AS (
    SELECT w.id, w.user_id, w.date::date AS d, w.created_at,
           CASE WHEN jsonb_typeof(w.sets::jsonb) = 'array' THEN w.sets::jsonb ELSE '[]'::jsonb END AS sets,
           -- saved within 2 days of the day it's dated: live logs and yesterday's catch-up count,
           -- imports and workouts added for older days don't
           w.created_at::date <= w.date::date + 2 AS fresh
    FROM workout_logs w
  ),
  days AS (
    SELECT l.user_id, l.d, max(l.created_at) AS at
    FROM logs l, b
    WHERE l.d >= b.m0 AND l.d < b.m1 AND l.fresh AND jsonb_array_length(l.sets) >= 3
    GROUP BY l.user_id, l.d
  ),
  day_count AS (SELECT d.user_id, count(*)::int AS n, max(d.at) AS at FROM days d GROUP BY d.user_id),
  weeks AS (
    SELECT x.user_id, count(*)::int AS n
    FROM (SELECT d.user_id FROM days d GROUP BY d.user_id, date_trunc('week', d.d) HAVING count(*) >= 3) x
    GROUP BY x.user_id
  ),
  tops AS (
    SELECT l.user_id, l.d, l.created_at, l.fresh, e->>'ex' AS ex,
           max(CASE WHEN jsonb_typeof(e->'weight') = 'number' THEN (e->>'weight')::numeric END) AS top
    FROM logs l, b, jsonb_array_elements(l.sets) e
    WHERE l.d < b.m1 AND l.user_id IN (SELECT d.user_id FROM days d)
    GROUP BY l.id, l.user_id, l.d, l.created_at, l.fresh, e->>'ex'
  ),
  pr AS (
    SELECT x.user_id, LEAST(count(*), 10)::int AS n
    FROM (
      SELECT t.user_id, t.d, t.fresh, t.top > max(t.top) OVER (
               PARTITION BY t.user_id, t.ex ORDER BY t.created_at
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS is_pr
      FROM tops t
    ) x, b
    WHERE x.is_pr AND x.fresh AND x.d >= b.m0
    GROUP BY x.user_id
  ),
  tog AS (
    SELECT g.user_id, count(DISTINCT g.logged_at::date)::int AS n, max(g.logged_at) AS at
    FROM group_sets g, b
    WHERE g.logged_at >= b.m0 AND g.logged_at < b.m1
      AND EXISTS (SELECT 1 FROM group_sets o WHERE o.session_id = g.session_id AND o.user_id <> g.user_id)
    GROUP BY g.user_id
  ),
  people AS (SELECT dc.user_id FROM day_count dc UNION SELECT t.user_id FROM tog t)
  SELECT p.user_id,
         (COALESCE(dc.n, 0) * 10 + COALESCE(wk.n, 0) * 20 + COALESCE(pr.n, 0) * 5 + COALESCE(tg.n, 0) * 15)::int,
         COALESCE(dc.n, 0), COALESCE(wk.n, 0), COALESCE(pr.n, 0), COALESCE(tg.n, 0),
         GREATEST(dc.at, tg.at)
  FROM people p
  LEFT JOIN day_count dc ON dc.user_id = p.user_id
  LEFT JOIN weeks wk     ON wk.user_id = p.user_id
  LEFT JOIN pr           ON pr.user_id = p.user_id
  LEFT JOIN tog tg       ON tg.user_id = p.user_id
$$;
REVOKE ALL ON FUNCTION public.month_points(date) FROM PUBLIC, anon, authenticated;
