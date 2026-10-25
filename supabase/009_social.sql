-- 009: nicknames, friends, and the monthly points leaderboard.
-- Run before deploying the app that uses them, then redeploy generate-fitness-plan
-- and analyze-meal (they read comp_pro_until). Safe to re-run.
--
-- Points per calendar month, from data the app already stores:
--   10 per workout day (a logged workout with 3+ sets; one counted per day)
--   20 per week with 3+ workout days
--    5 per personal record (heaviest set of an exercise so far), at most 10 a month
--   15 per day you trained in a room with someone else
-- On the 1st, close_month() saves last month's scores; the top 3 on the Everyone
-- board get a medal and a free month of Pro (subscriptions.comp_pro_until).

-- ── Nicknames: public, unique, lowercase ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_profiles (
  user_id        uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname       text        NOT NULL CHECK (nickname ~ '^[a-z0-9_]{3,20}$'
                               AND nickname NOT IN ('athrion', 'admin', 'support', 'official', 'help')),
  on_leaderboard boolean     NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS social_profiles_nickname_key ON public.social_profiles (nickname);
ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signed-in users read nicknames" ON public.social_profiles;
CREATE POLICY "signed-in users read nicknames" ON public.social_profiles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "users add own nickname" ON public.social_profiles;
CREATE POLICY "users add own nickname" ON public.social_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users edit own nickname" ON public.social_profiles;
CREATE POLICY "users edit own nickname" ON public.social_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Friends: one row per pair; written only through the functions below ─────
CREATE TABLE IF NOT EXISTS public.friendships (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz DEFAULT now(),
  CHECK (requester <> addressee)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_key
  ON public.friendships (LEAST(requester, addressee), GREATEST(requester, addressee));
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY; -- no policies: functions only

-- ── Closed months ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_scores (
  user_id      uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month        date    NOT NULL,           -- first day of the month
  points       int     NOT NULL,
  workout_days int     NOT NULL,
  rank         int,                        -- place on the Everyone board; null if hidden
  prize_pro    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, month)
);
ALTER TABLE public.monthly_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own scores" ON public.monthly_scores;
CREATE POLICY "read own scores" ON public.monthly_scores
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Prize Pro, separate from Stripe so the webhook never overwrites it ──────
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS comp_pro_until timestamptz;

-- ── Points for one month, everyone (internal) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.month_points(p_month date)
RETURNS TABLE (user_id uuid, points int, workout_days int, full_weeks int, prs int, together int, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT date_trunc('month', p_month)::date AS m0,
           (date_trunc('month', p_month) + interval '1 month')::date AS m1
  ),
  logs AS (
    SELECT w.id, w.user_id, w.date::date AS d, w.created_at,
           CASE WHEN jsonb_typeof(w.sets::jsonb) = 'array' THEN w.sets::jsonb ELSE '[]'::jsonb END AS sets
    FROM workout_logs w
  ),
  days AS (
    SELECT l.user_id, l.d, max(l.created_at) AS at
    FROM logs l, b
    WHERE l.d >= b.m0 AND l.d < b.m1 AND jsonb_array_length(l.sets) >= 3
    GROUP BY l.user_id, l.d
  ),
  day_count AS (SELECT d.user_id, count(*)::int AS n, max(d.at) AS at FROM days d GROUP BY d.user_id),
  weeks AS (
    SELECT x.user_id, count(*)::int AS n
    FROM (SELECT d.user_id FROM days d GROUP BY d.user_id, date_trunc('week', d.d) HAVING count(*) >= 3) x
    GROUP BY x.user_id
  ),
  tops AS (
    SELECT l.user_id, l.d, l.created_at, e->>'ex' AS ex,
           max(CASE WHEN jsonb_typeof(e->'weight') = 'number' THEN (e->>'weight')::numeric END) AS top
    FROM logs l, b, jsonb_array_elements(l.sets) e
    WHERE l.d < b.m1 AND l.user_id IN (SELECT d.user_id FROM days d)
    GROUP BY l.id, l.user_id, l.d, l.created_at, e->>'ex'
  ),
  pr AS (
    SELECT x.user_id, LEAST(count(*), 10)::int AS n
    FROM (
      SELECT t.user_id, t.d, t.top > max(t.top) OVER (
               PARTITION BY t.user_id, t.ex ORDER BY t.created_at
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS is_pr
      FROM tops t
    ) x, b
    WHERE x.is_pr AND x.d >= b.m0
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

-- ── Leaderboard: 'friends' (you + accepted friends) or 'everyone' (listed people) ──
-- Only nicknames and points leave the database.
CREATE OR REPLACE FUNCTION public.leaderboard(p_scope text, p_month date DEFAULT NULL)
RETURNS TABLE (place int, nickname text, points int, workout_days int, lifetime int, medals int, is_me boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  me uuid := auth.uid();
  m  date := date_trunc('month', COALESCE(p_month, current_date))::date;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH pool AS (
    SELECT sp.user_id, sp.nickname,
           (p_scope = 'friends' OR sp.on_leaderboard) AS listed
    FROM social_profiles sp
    WHERE sp.user_id = me
       OR (p_scope = 'friends' AND EXISTS (
             SELECT 1 FROM friendships f
             WHERE f.status = 'accepted'
               AND ((f.requester = me AND f.addressee = sp.user_id) OR (f.addressee = me AND f.requester = sp.user_id))))
       OR (p_scope <> 'friends' AND sp.on_leaderboard)
  ),
  pts AS (SELECT * FROM month_points(m)),
  hist AS (
    SELECT ms.user_id, sum(ms.points)::int AS total, (count(*) FILTER (WHERE ms.rank <= 3))::int AS medals
    FROM monthly_scores ms
    WHERE ms.month < m AND ms.user_id IN (SELECT pool.user_id FROM pool)
    GROUP BY ms.user_id
  ),
  ranked AS (
    SELECT pool.user_id, pool.nickname, pool.listed,
           COALESCE(t.points, 0) AS pts, COALESCE(t.workout_days, 0) AS days,
           row_number() OVER (PARTITION BY pool.listed
                              ORDER BY COALESCE(t.points, 0) DESC, t.last_at ASC NULLS LAST, pool.nickname)::int AS rn
    FROM pool LEFT JOIN pts t ON t.user_id = pool.user_id
  )
  SELECT CASE WHEN r.listed THEN r.rn END, r.nickname, r.pts, r.days,
         (COALESCE(h.total, 0) + r.pts)::int, COALESCE(h.medals, 0), r.user_id = me
  FROM ranked r LEFT JOIN hist h ON h.user_id = r.user_id
  WHERE (r.listed AND r.rn <= 100) OR r.user_id = me
  ORDER BY r.listed DESC, r.rn;
END $$;

-- ── Your own month so far, with the breakdown ───────────────────────────────
CREATE OR REPLACE FUNCTION public.my_points(p_month date DEFAULT NULL)
RETURNS TABLE (points int, workout_days int, full_weeks int, prs int, together int, lifetime int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  me uuid := auth.uid();
  m  date := date_trunc('month', COALESCE(p_month, current_date))::date;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT COALESCE(t.points, 0), COALESCE(t.workout_days, 0), COALESCE(t.full_weeks, 0),
         COALESCE(t.prs, 0), COALESCE(t.together, 0),
         (COALESCE((SELECT sum(ms.points) FROM monthly_scores ms WHERE ms.user_id = me AND ms.month < m), 0)
           + COALESCE(t.points, 0))::int
  FROM (SELECT me AS uid) x
  LEFT JOIN month_points(m) t ON t.user_id = x.uid;
END $$;

-- ── Friend requests ─────────────────────────────────────────────────────────
-- Returns 'pending' (request sent) or 'friends' (they had already asked you, or you're friends)
CREATE OR REPLACE FUNCTION public.send_friend_request(p_nickname text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  them uuid;
  f public.friendships;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM social_profiles WHERE user_id = me) THEN
    RAISE EXCEPTION 'Pick a nickname first' USING ERRCODE = 'P0001';
  END IF;
  SELECT user_id INTO them FROM social_profiles WHERE nickname = lower(ltrim(trim(p_nickname), '@'));
  IF them IS NULL THEN RAISE EXCEPTION 'No one has that nickname' USING ERRCODE = 'P0002'; END IF;
  IF them = me THEN RAISE EXCEPTION 'That''s your own nickname' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO f FROM friendships
  WHERE LEAST(requester, addressee) = LEAST(me, them) AND GREATEST(requester, addressee) = GREATEST(me, them);
  IF FOUND THEN
    IF f.status = 'pending' AND f.addressee = me THEN
      UPDATE friendships SET status = 'accepted' WHERE id = f.id;
      RETURN 'friends';
    END IF;
    RETURN CASE WHEN f.status = 'accepted' THEN 'friends' ELSE 'pending' END;
  END IF;

  IF (SELECT count(*) FROM friendships WHERE requester = me AND status = 'pending') >= 50 THEN
    RAISE EXCEPTION 'Too many open requests. Wait for some to be accepted.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO friendships (requester, addressee) VALUES (me, them);
  RETURN 'pending';
END $$;

-- Accept or decline a request sent to you
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_accept THEN
    UPDATE friendships SET status = 'accepted' WHERE id = p_id AND addressee = auth.uid() AND status = 'pending';
  ELSE
    DELETE FROM friendships WHERE id = p_id AND addressee = auth.uid() AND status = 'pending';
  END IF;
END $$;

-- Unfriend, or cancel a request you sent
CREATE OR REPLACE FUNCTION public.remove_friend(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM friendships WHERE id = p_id AND auth.uid() IN (requester, addressee);
$$;

CREATE OR REPLACE FUNCTION public.my_friends()
RETURNS TABLE (id uuid, nickname text, status text, incoming boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, sp.nickname, f.status, f.addressee = auth.uid()
  FROM friendships f
  JOIN social_profiles sp
    ON sp.user_id = CASE WHEN f.requester = auth.uid() THEN f.addressee ELSE f.requester END
  WHERE auth.uid() IN (f.requester, f.addressee)
  ORDER BY f.status, sp.nickname
$$;

-- ── Month end: save scores, rank the Everyone board, give the top 3 a Pro month ──
CREATE OR REPLACE FUNCTION public.close_month(p_month date DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m date := date_trunc('month', COALESCE(p_month, current_date - interval '1 month'))::date;
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM monthly_scores WHERE month = m) THEN RETURN 0; END IF; -- already closed

  INSERT INTO monthly_scores (user_id, month, points, workout_days, rank)
  SELECT t.user_id, m, t.points, t.workout_days,
         CASE WHEN sp.on_leaderboard IS TRUE THEN
           row_number() OVER (PARTITION BY sp.on_leaderboard IS TRUE ORDER BY t.points DESC, t.last_at ASC NULLS LAST)
         END
  FROM month_points(m) t
  LEFT JOIN social_profiles sp ON sp.user_id = t.user_id
  WHERE t.points > 0;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE monthly_scores SET prize_pro = true WHERE month = m AND rank <= 3;
  UPDATE subscriptions s
     SET comp_pro_until = GREATEST(COALESCE(s.comp_pro_until, now()), now()) + interval '1 month',
         updated_at = now()
    FROM monthly_scores ms
   WHERE ms.month = m AND ms.prize_pro AND ms.user_id = s.user_id;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.close_month(date) FROM PUBLIC, anon, authenticated;

-- Signed-in users only
REVOKE ALL ON FUNCTION public.leaderboard(text, date)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_points(date)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_friend_request(text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_friend_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_friend(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_friends()                          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard(text, date)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_points(date)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_friends()                          TO authenticated;

-- 12:00 UTC on the 1st, once every time zone has finished the month
SELECT cron.schedule('close-month', '0 12 1 * *', $$SELECT public.close_month()$$);
