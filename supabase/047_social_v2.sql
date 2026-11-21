-- 047: Train together, version 2. Needs 045 and 046. Includes 029 (fair points). Safe to re-run.
--
--   • Moderation: admins read open reports (with the reported message), warn, remove content or
--     ban (api/admin-moderate.js also bans the login); a summary of exit surveys.
--   • Cheat check: a workout, run or step count that can't be real is flagged and earns nothing
--     (no points, no challenge progress, no feed post). It stays in the person's own log.
--   • Points: month_points now comes from points_between(), which leagues use too. Only workouts
--     saved within 2 days of their date count (029), and finished challenges add a bonus:
--     weekly +25, monthly +50, a head-to-head win +20, a group challenge win +30.
--   • Challenges: more kinds (heaviest bench, squat, deadlift, overhead press, most pull-ups,
--     longest plank, longest run, distance run, steps, PRs), seasonal monthly ones with a title,
--     head to head with any kind, and group challenges for 3 to 6 friends.
--   • Leagues: each week you're in a group of up to 20 at your level (Bronze → Diamond); the top 5
--     go up and the bottom 5 go down on Monday.
--   • Activity feed: friends' workouts, PRs, streaks, challenge wins and league moves, with
--     reactions. Friend profiles. Privacy: who can message or challenge you, whether friends see
--     your activity and your best lifts.
--   • Steps from Apple Health (for step challenges), scheduled rooms with friends, chat in
--     realtime (recipients read their own messages, so Supabase Realtime can deliver them).

-- ── Bans and admin checks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_bans (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason     text        NOT NULL DEFAULT '',
  banned_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_bans FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_banned(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_bans WHERE user_id = p_user);
$$;
REVOKE ALL ON FUNCTION public.is_banned(uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.user_reports ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.user_reports ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── Privacy ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.privacy_settings (
  user_id        uuid    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  messages       text    NOT NULL DEFAULT 'friends' CHECK (messages IN ('friends', 'nobody')),
  challenges     text    NOT NULL DEFAULT 'friends' CHECK (challenges IN ('friends', 'nobody')),
  share_activity boolean NOT NULL DEFAULT true,
  show_lifts     boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own privacy settings" ON public.privacy_settings;
CREATE POLICY "own privacy settings" ON public.privacy_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.privacy_of(p_user uuid)
RETURNS public.privacy_settings LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT p FROM privacy_settings p WHERE p.user_id = p_user),
                  ROW(p_user, 'friends', 'friends', true, true, now())::public.privacy_settings);
$$;
REVOKE ALL ON FUNCTION public.privacy_of(uuid) FROM PUBLIC, anon, authenticated;

-- ── Cheat check ─────────────────────────────────────────────────────────────
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS flag_reason text;
ALTER TABLE public.cardio_logs  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;

-- Limits no person reaches: 1,000 lb on a set, 150 reps, a 1-hour hold, 150 sets, 150,000 lb in
-- one workout (lb, as every app saves it)
CREATE OR REPLACE FUNCTION public.check_workout()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s jsonb := CASE WHEN jsonb_typeof(NEW.sets::jsonb) = 'array' THEN NEW.sets::jsonb ELSE '[]'::jsonb END; why text;
BEGIN
  SELECT CASE
    WHEN jsonb_array_length(s) > 150 THEN 'more than 150 sets'
    WHEN coalesce(NEW.volume, 0) > 150000 THEN 'more than 150,000 lb in one workout'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(s) e WHERE jsonb_typeof(e->'weight') = 'number' AND (e->>'weight')::numeric > 1000) THEN 'a set over 1,000 lb'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(s) e WHERE jsonb_typeof(e->'reps') = 'number' AND (e->>'reps')::numeric > 150) THEN 'a set over 150 reps'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(s) e WHERE jsonb_typeof(e->'secs') = 'number' AND (e->>'secs')::numeric > 3600) THEN 'a hold over an hour'
  END INTO why;
  NEW.flagged := why IS NOT NULL;
  NEW.flag_reason := why;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workout_logs_check ON public.workout_logs;
CREATE TRIGGER workout_logs_check BEFORE INSERT OR UPDATE OF sets, volume ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.check_workout();

-- Faster than the world records, for anything over 400 m (run 6.5 m/s, swim 2.4 m/s)
CREATE OR REPLACE FUNCTION public.check_cardio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.flagged := NEW.distance_m > 400 AND NEW.distance_m / NEW.seconds > CASE WHEN NEW.kind = 'swim' THEN 2.4 ELSE 6.5 END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cardio_logs_check ON public.cardio_logs;
CREATE TRIGGER cardio_logs_check BEFORE INSERT OR UPDATE ON public.cardio_logs
  FOR EACH ROW EXECUTE FUNCTION public.check_cardio();

-- ── Steps, from Apple Health on the phone (one row a day) ───────────────────
CREATE TABLE IF NOT EXISTS public.daily_steps (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  steps      int         NOT NULL CHECK (steps >= 0 AND steps <= 150000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
ALTER TABLE public.daily_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own steps" ON public.daily_steps;
CREATE POLICY "own steps" ON public.daily_steps
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Working sets, the same way everywhere (warm-ups and flagged workouts left out) ──
CREATE OR REPLACE FUNCTION public.working_sets(p_user uuid, p_from date, p_to date)
RETURNS TABLE (log_id uuid, d date, created_at timestamptz, ex text, weight numeric, reps numeric, secs numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.date::date, w.created_at, lower(btrim(e->>'ex')),
         CASE WHEN jsonb_typeof(e->'weight') = 'number' THEN (e->>'weight')::numeric ELSE 0 END,
         CASE WHEN jsonb_typeof(e->'reps') = 'number' THEN (e->>'reps')::numeric ELSE 0 END,
         CASE WHEN jsonb_typeof(e->'secs') = 'number' THEN (e->>'secs')::numeric ELSE 0 END
  FROM workout_logs w, jsonb_array_elements(CASE WHEN jsonb_typeof(w.sets::jsonb) = 'array' THEN w.sets::jsonb ELSE '[]'::jsonb END) e
  WHERE w.user_id = p_user AND NOT w.flagged AND w.date::date BETWEEN p_from AND p_to
    AND coalesce((e->>'warmup')::boolean, false) = false;
$$;
REVOKE ALL ON FUNCTION public.working_sets(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- The lifts a "heaviest" challenge reads (the names the apps save, old and new)
CREATE OR REPLACE FUNCTION public.lift_names(p_metric text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_metric
    WHEN 'best_bench'    THEN ARRAY['bench press', 'barbell bench press', 'flat bench press']
    WHEN 'best_squat'    THEN ARRAY['squat', 'back squat', 'barbell squat', 'barbell back squat']
    WHEN 'best_deadlift' THEN ARRAY['deadlift', 'barbell deadlift', 'conventional deadlift']
    WHEN 'best_press'    THEN ARRAY['overhead press', 'barbell overhead press', 'military press', 'standing overhead press']
    WHEN 'most_pullups'  THEN ARRAY['pull-up', 'pull up', 'pullup', 'pull-ups', 'chin-up', 'chin up', 'neutral grip pull-up', 'wide grip pull-up']
    WHEN 'longest_plank' THEN ARRAY['plank']
    ELSE ARRAY[]::text[] END;
$$;

-- What every challenge can measure
CREATE OR REPLACE FUNCTION public.challenge_metric_name(p_metric text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_metric
    WHEN 'workout_days'  THEN 'Most workout days'
    WHEN 'volume_lb'     THEN 'Most weight lifted'
    WHEN 'best_bench'    THEN 'Heaviest bench press'
    WHEN 'best_squat'    THEN 'Heaviest squat'
    WHEN 'best_deadlift' THEN 'Heaviest deadlift'
    WHEN 'best_press'    THEN 'Heaviest overhead press'
    WHEN 'most_pullups'  THEN 'Most pull-ups in a set'
    WHEN 'longest_plank' THEN 'Longest plank'
    WHEN 'longest_run'   THEN 'Longest run'
    WHEN 'run_km'        THEN 'Most distance run'
    WHEN 'steps'         THEN 'Most steps'
    WHEN 'prs'           THEN 'Most personal records'
    WHEN 'room_days'     THEN 'Most days training together'
    WHEN 'streak_days'   THEN 'Longest streak'
    ELSE 'Challenge' END;
$$;

ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_metric_check;
ALTER TABLE public.challenges ADD CONSTRAINT challenges_metric_check CHECK (metric IN
  ('workout_days', 'volume_lb', 'room_days', 'streak_days', 'best_bench', 'best_squat', 'best_deadlift', 'best_press',
   'most_pullups', 'longest_plank', 'longest_run', 'run_km', 'steps', 'prs'));
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.friend_challenges DROP CONSTRAINT IF EXISTS friend_challenges_metric_check;
ALTER TABLE public.friend_challenges ADD CONSTRAINT friend_challenges_metric_check CHECK (metric IN
  ('workout_days', 'volume_lb', 'best_bench', 'best_squat', 'best_deadlift', 'best_press',
   'most_pullups', 'longest_plank', 'longest_run', 'run_km', 'steps', 'prs'));

-- How far someone is on a metric between two days (both included)
CREATE OR REPLACE FUNCTION public.challenge_progress(p_user uuid, p_metric text, p_from date, p_to date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v numeric := 0; best int := 0; run int := 0; prev date; d date;
BEGIN
  IF p_metric = 'workout_days' THEN
    SELECT count(DISTINCT date::date) INTO v FROM workout_logs
    WHERE user_id = p_user AND NOT flagged AND date::date BETWEEN p_from AND p_to AND coalesce(jsonb_array_length(sets), 0) >= 3;
  ELSIF p_metric = 'volume_lb' THEN
    SELECT coalesce(sum(volume), 0) INTO v FROM workout_logs WHERE user_id = p_user AND NOT flagged AND date::date BETWEEN p_from AND p_to;
  ELSIF p_metric = 'room_days' THEN
    SELECT count(DISTINCT s.logged_at::date) INTO v FROM group_sets s
    WHERE s.user_id = p_user AND s.logged_at::date BETWEEN p_from AND p_to
      AND EXISTS (SELECT 1 FROM group_sets o WHERE o.session_id = s.session_id AND o.user_id <> p_user);
  ELSIF p_metric = 'streak_days' THEN
    FOR d IN SELECT DISTINCT date::date FROM workout_logs
             WHERE user_id = p_user AND NOT flagged AND date::date BETWEEN p_from AND p_to AND coalesce(jsonb_array_length(sets), 0) >= 3 ORDER BY 1 LOOP
      run := CASE WHEN prev IS NOT NULL AND d = prev + 1 THEN run + 1 ELSE 1 END;
      best := greatest(best, run); prev := d;
    END LOOP;
    v := best;
  ELSIF p_metric IN ('best_bench', 'best_squat', 'best_deadlift', 'best_press') THEN
    SELECT coalesce(max(weight), 0) INTO v FROM working_sets(p_user, p_from, p_to) WHERE ex = ANY (lift_names(p_metric)) AND reps > 0;
  ELSIF p_metric = 'most_pullups' THEN
    SELECT coalesce(max(reps), 0) INTO v FROM working_sets(p_user, p_from, p_to) WHERE ex = ANY (lift_names(p_metric));
  ELSIF p_metric = 'longest_plank' THEN
    SELECT coalesce(max(secs), 0) INTO v FROM working_sets(p_user, p_from, p_to) WHERE ex = ANY (lift_names(p_metric));
  ELSIF p_metric = 'longest_run' THEN
    SELECT coalesce(max(distance_m), 0) INTO v FROM cardio_logs WHERE user_id = p_user AND kind = 'run' AND NOT flagged AND date BETWEEN p_from AND p_to;
  ELSIF p_metric = 'run_km' THEN
    SELECT coalesce(sum(distance_m), 0) INTO v FROM cardio_logs WHERE user_id = p_user AND kind = 'run' AND NOT flagged AND date BETWEEN p_from AND p_to;
  ELSIF p_metric = 'steps' THEN
    SELECT coalesce(sum(steps), 0) INTO v FROM daily_steps WHERE user_id = p_user AND date BETWEEN p_from AND p_to;
  ELSIF p_metric = 'prs' THEN
    -- A log whose top weight on an exercise beats everything before it (a first time isn't one)
    SELECT count(*) INTO v FROM (
      SELECT t.d, t.top > max(t.top) OVER (PARTITION BY t.ex ORDER BY t.d, t.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS pr
      FROM (SELECT log_id, d, created_at, ex, max(weight) AS top FROM working_sets(p_user, '2000-01-01', p_to)
            WHERE weight > 0 GROUP BY log_id, d, created_at, ex) t
    ) x WHERE x.pr AND x.d >= p_from;
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.challenge_progress(uuid, text, date, date) FROM PUBLIC, anon, authenticated;

-- ── Group challenges: 3 to 6 friends, 7 days ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crew_challenges (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric     text        NOT NULL CHECK (metric IN ('workout_days', 'volume_lb', 'best_bench', 'best_squat', 'best_deadlift', 'best_press',
                                                    'most_pullups', 'longest_plank', 'longest_run', 'run_km', 'steps', 'prs')),
  starts     date        NOT NULL DEFAULT current_date,
  ends       date        NOT NULL DEFAULT current_date + 6,
  status     text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
  winner     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crew_members (
  challenge_id uuid NOT NULL REFERENCES public.crew_challenges(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'in', 'out')),
  PRIMARY KEY (challenge_id, user_id)
);
CREATE INDEX IF NOT EXISTS crew_members_user ON public.crew_members (user_id);
ALTER TABLE public.crew_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crew_challenges, public.crew_members FROM anon, authenticated;

-- ── Points: any span of days, everyone or a few people ─────────────────────
-- 10 a workout day (3+ sets), 20 a week with 3+ days, 5 a PR (10 at most), 15 a day trained
-- together, plus the challenge bonus. Only workouts saved within 2 days of their date count (029).
CREATE OR REPLACE FUNCTION public.challenge_bonus(p_from date, p_to date)
RETURNS TABLE (user_id uuid, pts int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.user_id, sum(x.p)::int FROM (
    SELECT w.user_id, CASE WHEN c.period = 'week' THEN 25 ELSE 50 END AS p
      FROM challenge_wins w JOIN challenges c ON c.key = w.key
     WHERE w.done_at::date >= p_from AND w.done_at::date < p_to
    UNION ALL
    SELECT f.winner, 20 FROM friend_challenges f WHERE f.status = 'done' AND f.winner IS NOT NULL AND f.ends >= p_from AND f.ends < p_to
    UNION ALL
    SELECT k.winner, 30 FROM crew_challenges k WHERE k.status = 'done' AND k.winner IS NOT NULL AND k.ends >= p_from AND k.ends < p_to
  ) x GROUP BY x.user_id;
$$;
REVOKE ALL ON FUNCTION public.challenge_bonus(date, date) FROM PUBLIC, anon, authenticated;

-- p_from included, p_to not
CREATE OR REPLACE FUNCTION public.points_between(p_from date, p_to date, p_users uuid[] DEFAULT NULL)
RETURNS TABLE (user_id uuid, points int, workout_days int, full_weeks int, prs int, together int, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH logs AS (
    SELECT w.id, w.user_id, w.date::date AS d, w.created_at,
           CASE WHEN jsonb_typeof(w.sets::jsonb) = 'array' THEN w.sets::jsonb ELSE '[]'::jsonb END AS sets,
           w.created_at::date <= w.date::date + 2 AS fresh
    FROM workout_logs w
    WHERE NOT w.flagged AND (p_users IS NULL OR w.user_id = ANY (p_users))
  ),
  days AS (
    SELECT l.user_id, l.d, max(l.created_at) AS at
    FROM logs l
    WHERE l.d >= p_from AND l.d < p_to AND l.fresh AND jsonb_array_length(l.sets) >= 3
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
    FROM logs l, jsonb_array_elements(l.sets) e
    WHERE l.d < p_to AND l.user_id IN (SELECT d.user_id FROM days d)
      AND coalesce((e->>'warmup')::boolean, false) = false
    GROUP BY l.id, l.user_id, l.d, l.created_at, l.fresh, e->>'ex'
  ),
  pr AS (
    SELECT x.user_id, LEAST(count(*), 10)::int AS n
    FROM (
      SELECT t.user_id, t.d, t.fresh, t.top > max(t.top) OVER (
               PARTITION BY t.user_id, t.ex ORDER BY t.created_at
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS is_pr
      FROM tops t
    ) x
    WHERE x.is_pr AND x.fresh AND x.d >= p_from
    GROUP BY x.user_id
  ),
  tog AS (
    SELECT g.user_id, count(DISTINCT g.logged_at::date)::int AS n, max(g.logged_at) AS at
    FROM group_sets g
    WHERE g.logged_at >= p_from AND g.logged_at < p_to AND (p_users IS NULL OR g.user_id = ANY (p_users))
      AND EXISTS (SELECT 1 FROM group_sets o WHERE o.session_id = g.session_id AND o.user_id <> g.user_id)
    GROUP BY g.user_id
  ),
  bonus AS (SELECT b.user_id, b.pts FROM challenge_bonus(p_from, p_to) b WHERE p_users IS NULL OR b.user_id = ANY (p_users)),
  people AS (SELECT dc.user_id FROM day_count dc UNION SELECT t.user_id FROM tog t UNION SELECT b.user_id FROM bonus b)
  SELECT p.user_id,
         (COALESCE(dc.n, 0) * 10 + COALESCE(wk.n, 0) * 20 + COALESCE(pr.n, 0) * 5 + COALESCE(tg.n, 0) * 15 + COALESCE(bn.pts, 0))::int,
         COALESCE(dc.n, 0), COALESCE(wk.n, 0), COALESCE(pr.n, 0), COALESCE(tg.n, 0),
         GREATEST(dc.at, tg.at)
  FROM people p
  LEFT JOIN day_count dc ON dc.user_id = p.user_id
  LEFT JOIN weeks wk     ON wk.user_id = p.user_id
  LEFT JOIN pr           ON pr.user_id = p.user_id
  LEFT JOIN tog tg       ON tg.user_id = p.user_id
  LEFT JOIN bonus bn     ON bn.user_id = p.user_id
$$;
REVOKE ALL ON FUNCTION public.points_between(date, date, uuid[]) FROM PUBLIC, anon, authenticated;

-- Same signature as before, so leaderboard(), my_points() and close_month() pick it up
CREATE OR REPLACE FUNCTION public.month_points(p_month date)
RETURNS TABLE (user_id uuid, points int, workout_days int, full_weeks int, prs int, together int, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM points_between(date_trunc('month', p_month)::date, (date_trunc('month', p_month) + interval '1 month')::date);
$$;
REVOKE ALL ON FUNCTION public.month_points(date) FROM PUBLIC, anon, authenticated;

-- ── Activity feed ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feed_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN ('workout', 'pr', 'streak', 'challenge', 'league', 'run')),
  title      text        NOT NULL,
  detail     jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feed_events_user_time ON public.feed_events (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.feed_reactions (
  event_id   uuid        NOT NULL REFERENCES public.feed_events(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      text        NOT NULL CHECK (emoji IN ('💪', '🔥', '👏', '😂', '🫡', '🐐')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
ALTER TABLE public.feed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_events, public.feed_reactions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.feed_post(p_user uuid, p_kind text, p_title text, p_detail jsonb DEFAULT '{}')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO feed_events (user_id, kind, title, detail) VALUES (p_user, p_kind, left(p_title, 140), coalesce(p_detail, '{}'));
$$;
REVOKE ALL ON FUNCTION public.feed_post(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- A workout saved for today or yesterday: the post, its PRs and a streak milestone
CREATE OR REPLACE FUNCTION public.workout_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb := CASE WHEN jsonb_typeof(NEW.sets::jsonb) = 'array' THEN NEW.sets::jsonb ELSE '[]'::jsonb END;
  prs jsonb; streak int := 0; d date := NEW.date::date; ex_count int;
BEGIN
  IF NEW.flagged OR jsonb_array_length(s) < 3 OR NEW.date::date < current_date - 1 OR NEW.date::date > current_date + 1 THEN RETURN NEW; END IF;
  SELECT count(DISTINCT e->>'ex') INTO ex_count FROM jsonb_array_elements(s) e;
  PERFORM feed_post(NEW.user_id, 'workout', coalesce(nullif(btrim(NEW.name), ''), 'Workout'),
    jsonb_build_object('sets', jsonb_array_length(s), 'exercises', ex_count, 'volume', round(coalesce(NEW.volume, 0)),
                       'duration', NEW.duration, 'hour', extract(hour FROM now() AT TIME ZONE 'UTC')::int, 'log', NEW.id));

  -- PRs: the heaviest set on an exercise beats every earlier log of it
  SELECT jsonb_agg(jsonb_build_object('ex', t.ex, 'weight', t.top) ORDER BY t.top DESC) INTO prs FROM (
    SELECT e->>'ex' AS ex, max((e->>'weight')::numeric) AS top
    FROM jsonb_array_elements(s) e
    WHERE jsonb_typeof(e->'weight') = 'number' AND (e->>'weight')::numeric > 0 AND coalesce((e->>'warmup')::boolean, false) = false
    GROUP BY e->>'ex'
  ) t
  WHERE EXISTS (SELECT 1 FROM working_sets(NEW.user_id, '2000-01-01', current_date + 1) p WHERE p.ex = lower(btrim(t.ex)) AND p.log_id <> NEW.id)
    AND t.top > (SELECT max(p.weight) FROM working_sets(NEW.user_id, '2000-01-01', current_date + 1) p WHERE p.ex = lower(btrim(t.ex)) AND p.log_id <> NEW.id);
  IF prs IS NOT NULL THEN
    PERFORM feed_post(NEW.user_id, 'pr', CASE WHEN jsonb_array_length(prs) = 1 THEN 'New PR' ELSE jsonb_array_length(prs) || ' new PRs' END,
      jsonb_build_object('lifts', (SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(prs) x LIMIT 3) y)));
  END IF;

  -- Days in a row up to this one
  WHILE EXISTS (SELECT 1 FROM workout_logs w WHERE w.user_id = NEW.user_id AND NOT w.flagged AND w.date::date = d
                AND coalesce(jsonb_array_length(w.sets), 0) >= 3) LOOP
    streak := streak + 1; d := d - 1;
    EXIT WHEN streak > 400;
  END LOOP;
  IF streak IN (3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 300, 365)
     AND NOT EXISTS (SELECT 1 FROM feed_events f WHERE f.user_id = NEW.user_id AND f.kind = 'streak' AND (f.detail->>'days')::int = streak
                     AND f.created_at > now() - interval '3 days') THEN
    PERFORM feed_post(NEW.user_id, 'streak', streak || ' days in a row', jsonb_build_object('days', streak));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workout_logs_feed ON public.workout_logs;
CREATE TRIGGER workout_logs_feed AFTER INSERT ON public.workout_logs FOR EACH ROW EXECUTE FUNCTION public.workout_feed();

CREATE OR REPLACE FUNCTION public.cardio_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.flagged OR NEW.distance_m < 1000 OR NEW.date < current_date - 1 THEN RETURN NEW; END IF;
  PERFORM feed_post(NEW.user_id, 'run', CASE WHEN NEW.kind = 'swim' THEN 'Swim' ELSE 'Run' END,
    jsonb_build_object('kind', NEW.kind, 'distance_m', NEW.distance_m, 'seconds', NEW.seconds));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cardio_logs_feed ON public.cardio_logs;
CREATE TRIGGER cardio_logs_feed AFTER INSERT ON public.cardio_logs FOR EACH ROW EXECUTE FUNCTION public.cardio_feed();

-- Friends' posts and your own, newest first, 30 at a time (p_before pages back), 14 days back
CREATE OR REPLACE FUNCTION public.friend_feed(p_before timestamptz DEFAULT NULL)
RETURNS TABLE (id uuid, nickname text, kind text, title text, detail jsonb, created_at timestamptz, mine boolean,
               reactions jsonb, my_reaction text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, sp.nickname, e.kind, e.title, e.detail, e.created_at, e.user_id = auth.uid(),
         coalesce((SELECT jsonb_object_agg(r.emoji, r.n) FROM (SELECT emoji, count(*) n FROM feed_reactions WHERE event_id = e.id GROUP BY emoji) r), '{}'),
         (SELECT emoji FROM feed_reactions WHERE event_id = e.id AND user_id = auth.uid())
  FROM feed_events e JOIN social_profiles sp ON sp.user_id = e.user_id
  WHERE auth.uid() IS NOT NULL
    AND e.created_at > now() - interval '14 days'
    AND (p_before IS NULL OR e.created_at < p_before)
    AND (e.user_id = auth.uid()
         OR (are_friends(auth.uid(), e.user_id) AND NOT blocked_between(auth.uid(), e.user_id)
             AND (privacy_of(e.user_id)).share_activity AND NOT is_banned(e.user_id)))
  ORDER BY e.created_at DESC
  LIMIT 30;
$$;

-- React (or take it back with null). The first reaction on a post tells its owner.
CREATE OR REPLACE FUNCTION public.react_feed(p_event uuid, p_emoji text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); owner uuid; nick text; first boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT user_id INTO owner FROM feed_events WHERE id = p_event;
  IF owner IS NULL OR (owner <> me AND (NOT are_friends(me, owner) OR blocked_between(me, owner))) THEN
    RAISE EXCEPTION 'Not available' USING ERRCODE = '42501';
  END IF;
  IF is_banned(me) THEN RAISE EXCEPTION 'Your account can''t do that' USING ERRCODE = '42501'; END IF;
  IF p_emoji IS NULL THEN DELETE FROM feed_reactions WHERE event_id = p_event AND user_id = me; RETURN; END IF;
  first := NOT EXISTS (SELECT 1 FROM feed_reactions WHERE event_id = p_event AND user_id <> owner);
  INSERT INTO feed_reactions (event_id, user_id, emoji) VALUES (p_event, me, p_emoji)
  ON CONFLICT (event_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();
  IF first AND owner <> me AND NOT EXISTS (SELECT 1 FROM reminder_settings WHERE user_id = owner AND notify_buddies = false) THEN
    SELECT nickname INTO nick FROM social_profiles WHERE user_id = me;
    PERFORM notify(owner, 'kudos', '@' || coalesce(nick, 'A friend') || ' ' || p_emoji, 'reacted to your ' ||
      (SELECT CASE kind WHEN 'pr' THEN 'PR' WHEN 'streak' THEN 'streak' WHEN 'run' THEN 'run' WHEN 'challenge' THEN 'win' ELSE 'workout' END FROM feed_events WHERE id = p_event),
      '/?open=feed', true);
  END IF;
END $$;

-- ── Challenges, version 2 ───────────────────────────────────────────────────
-- Weekly and monthly rotations, and a themed monthly one for holidays
CREATE OR REPLACE FUNCTION public.ensure_challenges()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE monday date := date_trunc('week', current_date)::date; first date := date_trunc('month', current_date)::date;
  wk int := extract(week FROM current_date)::int; mo int := extract(month FROM current_date)::int;
  weekly text[] := ARRAY['workout_days:3', 'volume_lb:20000', 'run_km:10000', 'workout_days:4', 'room_days:1', 'prs:2',
                         'streak_days:3', 'steps:50000', 'workout_days:5'];
  monthly text[] := ARRAY['workout_days:12', 'volume_lb:150000', 'run_km:40000', 'workout_days:16', 'room_days:4', 'prs:6', 'steps:200000'];
  w text := weekly[1 + wk % array_length(weekly, 1)]; m text := monthly[1 + mo % array_length(monthly, 1)];
  wt text; mt text;
BEGIN
  -- Holidays: the month (and Christmas week) get their own
  m := CASE mo WHEN 12 THEN 'workout_days:12' WHEN 1 THEN 'prs:6' WHEN 2 THEN 'workout_days:14'
               WHEN 7 THEN 'run_km:30000' WHEN 10 THEN 'volume_lb:150000' ELSE m END;
  mt := CASE mo WHEN 12 THEN 'Christmas countdown 🎄' WHEN 1 THEN 'New year, new PRs 🎆' WHEN 2 THEN 'Love your gains 💘'
                WHEN 7 THEN 'Summer miles ☀️' WHEN 10 THEN 'Spooky strong 🎃' WHEN 11 THEN 'No-excuses November 🦃' END;
  IF monday <= make_date(extract(year FROM monday)::int, 12, 25) AND monday + 6 >= make_date(extract(year FROM monday)::int, 12, 25) THEN
    w := 'workout_days:3'; wt := 'Sleigh the week 🎅';
  ELSIF monday + 6 >= make_date(extract(year FROM monday + 6)::int, 1, 1) AND monday < make_date(extract(year FROM monday + 6)::int, 1, 1) THEN
    w := 'workout_days:3'; wt := 'First week, best week 🎆';
  END IF;
  INSERT INTO challenges (key, period, starts, ends, metric, goal, title)
  VALUES ('w' || monday, 'week', monday, monday + 6, split_part(w, ':', 1), split_part(w, ':', 2)::numeric, wt)
  ON CONFLICT (key) DO NOTHING;
  INSERT INTO challenges (key, period, starts, ends, metric, goal, title)
  VALUES ('m' || to_char(first, 'YYYY-MM'), 'month', first, (first + interval '1 month' - interval '1 day')::date,
          split_part(m, ':', 1), split_part(m, ':', 2)::numeric, mt)
  ON CONFLICT (key) DO NOTHING;
  UPDATE challenges SET title = mt WHERE key = 'm' || to_char(first, 'YYYY-MM') AND title IS NULL AND mt IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.ensure_challenges() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.my_challenges();
CREATE FUNCTION public.my_challenges()
RETURNS TABLE (key text, period text, starts date, ends date, metric text, goal numeric, progress numeric, done boolean, finishers int, title text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); c public.challenges; p numeric; added int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  PERFORM ensure_challenges();
  FOR c IN SELECT * FROM challenges WHERE current_date BETWEEN challenges.starts AND challenges.ends ORDER BY challenges.period DESC LOOP
    p := challenge_progress(me, c.metric, c.starts, c.ends);
    IF p >= c.goal THEN
      INSERT INTO challenge_wins (key, user_id) VALUES (c.key, me) ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS added = ROW_COUNT;
      IF added > 0 THEN
        PERFORM feed_post(me, 'challenge', coalesce(c.title, CASE WHEN c.period = 'week' THEN 'Weekly challenge' ELSE 'Monthly challenge' END) || ' done',
          jsonb_build_object('period', c.period, 'metric', c.metric, 'goal', c.goal));
        IF NOT EXISTS (SELECT 1 FROM reminder_settings WHERE user_id = me AND notify_challenges = false) THEN
          PERFORM notify(me, 'challenge_done', 'Challenge complete! 🏆',
            CASE WHEN c.period = 'week' THEN 'You finished this week''s challenge: +25 points.' ELSE 'You finished this month''s challenge: +50 points.' END, '/?open=challenges', true);
        END IF;
      END IF;
    END IF;
    RETURN QUERY SELECT c.key, c.period, c.starts, c.ends, c.metric, c.goal, p,
      EXISTS (SELECT 1 FROM challenge_wins w WHERE w.key = c.key AND w.user_id = me),
      (SELECT count(*)::int FROM challenge_wins w WHERE w.key = c.key), c.title;
  END LOOP;
END $$;

-- Wins of every kind, for the badges and the profile
CREATE OR REPLACE FUNCTION public.my_challenge_record()
RETURNS TABLE (weekly int, monthly int, versus_won int, versus_played int, crew_won int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*)::int FROM challenge_wins w JOIN challenges c ON c.key = w.key WHERE w.user_id = auth.uid() AND c.period = 'week'),
         (SELECT count(*)::int FROM challenge_wins w JOIN challenges c ON c.key = w.key WHERE w.user_id = auth.uid() AND c.period = 'month'),
         (SELECT count(*)::int FROM friend_challenges f WHERE f.status = 'done' AND f.winner = auth.uid()),
         (SELECT count(*)::int FROM friend_challenges f WHERE f.status = 'done' AND auth.uid() IN (f.challenger, f.opponent)),
         (SELECT count(*)::int FROM crew_challenges k WHERE k.status = 'done' AND k.winner = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.challenge_friend(p_nickname text, p_metric text DEFAULT 'workout_days')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); them uuid := friend_by_nickname(p_nickname); cid uuid; nick text;
BEGIN
  IF is_minor(me) OR is_minor(them) THEN RAISE EXCEPTION 'Challenges are for ages 16 and up' USING ERRCODE = 'P0001'; END IF;
  IF is_banned(me) THEN RAISE EXCEPTION 'Your account can''t do that' USING ERRCODE = '42501'; END IF;
  IF (privacy_of(them)).challenges = 'nobody' THEN RAISE EXCEPTION '@% isn''t taking challenges right now', p_nickname USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM friend_challenges WHERE status IN ('pending', 'active') AND ends >= current_date
             AND ((challenger = me AND opponent = them) OR (challenger = them AND opponent = me))) THEN
    RAISE EXCEPTION 'You already have a challenge going with them' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM friend_challenges WHERE challenger = me AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'Slow down: that''s a lot of challenges today.' USING ERRCODE = 'P0429';
  END IF;
  INSERT INTO friend_challenges (challenger, opponent, metric) VALUES (me, them, p_metric) RETURNING id INTO cid;
  SELECT nickname INTO nick FROM social_profiles WHERE user_id = me;
  IF NOT EXISTS (SELECT 1 FROM reminder_settings WHERE user_id = them AND notify_challenges = false) THEN
    PERFORM notify(them, 'friend_challenge', '@' || coalesce(nick, 'A friend') || ' challenged you ⚔️',
      challenge_metric_name(p_metric) || ' in 7 days. Accept?', '/?open=challenges', true);
  END IF;
  RETURN cid;
END $$;

-- Settling a head-to-head posts the win to the feed
CREATE OR REPLACE FUNCTION public.my_friend_challenges()
RETURNS TABLE (id uuid, friend text, incoming boolean, metric text, starts date, ends date, status text,
               mine numeric, theirs numeric, won boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); c public.friend_challenges; them uuid; a numeric; b numeric; w uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  FOR c IN SELECT * FROM friend_challenges f WHERE me IN (f.challenger, f.opponent)
           AND (f.status IN ('pending', 'active') OR f.created_at > now() - interval '30 days') ORDER BY f.created_at DESC LIMIT 30 LOOP
    them := CASE WHEN c.challenger = me THEN c.opponent ELSE c.challenger END;
    CONTINUE WHEN blocked_between(me, them);
    a := challenge_progress(me, c.metric, c.starts, c.ends);
    b := challenge_progress(them, c.metric, c.starts, c.ends);
    IF c.status = 'active' AND c.ends < current_date THEN
      w := CASE WHEN a > b THEN me WHEN b > a THEN them ELSE NULL END;
      UPDATE friend_challenges SET status = 'done', winner = w WHERE friend_challenges.id = c.id;
      c.status := 'done'; c.winner := w;
      IF w IS NOT NULL THEN
        PERFORM feed_post(w, 'challenge', 'Won a 7-day challenge',
          jsonb_build_object('metric', c.metric, 'vs', (SELECT nickname FROM social_profiles WHERE user_id = CASE WHEN w = me THEN them ELSE me END)));
      END IF;
      PERFORM notify(c.challenger, 'friend_challenge', 'Challenge over 🏁', 'See who won your 7-day challenge.', '/?open=challenges', true);
      PERFORM notify(c.opponent, 'friend_challenge', 'Challenge over 🏁', 'See who won your 7-day challenge.', '/?open=challenges', true);
    ELSIF c.status = 'pending' AND c.created_at < now() - interval '3 days' THEN
      UPDATE friend_challenges SET status = 'declined' WHERE friend_challenges.id = c.id;
      c.status := 'declined';
    END IF;
    RETURN QUERY SELECT c.id, (SELECT nickname FROM social_profiles WHERE user_id = them), c.opponent = me,
      c.metric, c.starts, c.ends, c.status, a, b, c.winner = me;
  END LOOP;
END $$;

-- A group challenge: you and 2 to 5 friends, starts now, 7 days
CREATE OR REPLACE FUNCTION public.challenge_crew(p_nicknames text[], p_metric text DEFAULT 'workout_days')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); cid uuid; nick text; n text; them uuid; ids uuid[] := '{}';
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF is_minor(me) THEN RAISE EXCEPTION 'Challenges are for ages 16 and up' USING ERRCODE = 'P0001'; END IF;
  IF is_banned(me) THEN RAISE EXCEPTION 'Your account can''t do that' USING ERRCODE = '42501'; END IF;
  IF coalesce(cardinality(p_nicknames), 0) < 2 OR cardinality(p_nicknames) > 5 THEN
    RAISE EXCEPTION 'Pick 2 to 5 friends' USING ERRCODE = 'P0001';
  END IF;
  FOREACH n IN ARRAY p_nicknames LOOP
    them := friend_by_nickname(n);
    IF is_minor(them) THEN RAISE EXCEPTION '@% can''t join challenges', n USING ERRCODE = 'P0001'; END IF;
    IF (privacy_of(them)).challenges = 'nobody' THEN RAISE EXCEPTION '@% isn''t taking challenges right now', n USING ERRCODE = 'P0001'; END IF;
    IF NOT them = ANY (ids) THEN ids := ids || them; END IF;
  END LOOP;
  IF (SELECT count(*) FROM crew_challenges WHERE creator = me AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Slow down: that''s a lot of challenges today.' USING ERRCODE = 'P0429';
  END IF;
  INSERT INTO crew_challenges (creator, metric) VALUES (me, p_metric) RETURNING id INTO cid;
  INSERT INTO crew_members (challenge_id, user_id, status) VALUES (cid, me, 'in');
  INSERT INTO crew_members (challenge_id, user_id) SELECT cid, unnest(ids);
  SELECT nickname INTO nick FROM social_profiles WHERE user_id = me;
  FOREACH them IN ARRAY ids LOOP
    IF NOT EXISTS (SELECT 1 FROM reminder_settings WHERE user_id = them AND notify_challenges = false) THEN
      PERFORM notify(them, 'friend_challenge', '@' || coalesce(nick, 'A friend') || ' started a group challenge 🏁',
        challenge_metric_name(p_metric) || ', ' || (cardinality(ids) + 1) || ' people, 7 days. Join?', '/?open=challenges', true);
    END IF;
  END LOOP;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.answer_crew_challenge(p_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE crew_members SET status = CASE WHEN p_accept THEN 'in' ELSE 'out' END
   WHERE challenge_id = p_id AND user_id = auth.uid() AND status = 'invited'
     AND EXISTS (SELECT 1 FROM crew_challenges k WHERE k.id = p_id AND k.status = 'active' AND k.ends >= current_date);
  IF NOT FOUND THEN RAISE EXCEPTION 'Not your challenge to answer' USING ERRCODE = '42501'; END IF;
END $$;

-- Mine, with everyone's standing; ones past their end are settled here
CREATE OR REPLACE FUNCTION public.my_crew_challenges()
RETURNS TABLE (id uuid, metric text, starts date, ends date, status text, creator text, my_status text, standings jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); k public.crew_challenges; st jsonb; w uuid; m record;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  FOR k IN SELECT c.* FROM crew_challenges c JOIN crew_members cm ON cm.challenge_id = c.id AND cm.user_id = me AND cm.status <> 'out'
           WHERE c.status = 'active' OR c.ends > current_date - 14 ORDER BY c.created_at DESC LIMIT 20 LOOP
    SELECT jsonb_agg(jsonb_build_object('nickname', x.nickname, 'value', x.v, 'me', x.user_id = me, 'status', x.status)
                     ORDER BY (x.status = 'in') DESC, x.v DESC, x.nickname), (array_agg(x.user_id ORDER BY x.v DESC) FILTER (WHERE x.status = 'in' AND x.v > 0))[1]
      INTO st, w
      FROM (SELECT cm.user_id, cm.status, sp.nickname,
                   CASE WHEN cm.status = 'in' THEN challenge_progress(cm.user_id, k.metric, k.starts, k.ends) ELSE 0 END AS v
              FROM crew_members cm JOIN social_profiles sp ON sp.user_id = cm.user_id
             WHERE cm.challenge_id = k.id AND cm.status <> 'out' AND NOT blocked_between(me, cm.user_id)) x;
    IF k.status = 'active' AND k.ends < current_date THEN
      UPDATE crew_challenges SET status = 'done', winner = w WHERE crew_challenges.id = k.id;
      k.status := 'done';
      IF w IS NOT NULL THEN PERFORM feed_post(w, 'challenge', 'Won a group challenge', jsonb_build_object('metric', k.metric, 'people', jsonb_array_length(st))); END IF;
      FOR m IN SELECT user_id FROM crew_members WHERE challenge_id = k.id AND status = 'in' LOOP
        PERFORM notify(m.user_id, 'friend_challenge', 'Group challenge over 🏁', 'See where you finished.', '/?open=challenges', true);
      END LOOP;
    END IF;
    RETURN QUERY SELECT k.id, k.metric, k.starts, k.ends, k.status,
      (SELECT nickname FROM social_profiles WHERE user_id = k.creator),
      (SELECT status FROM crew_members WHERE challenge_id = k.id AND user_id = me), coalesce(st, '[]');
  END LOOP;
END $$;

-- ── Leagues: a week in a group of up to 20 at your level ────────────────────
CREATE TABLE IF NOT EXISTS public.league_players (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier       int         NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.league_weeks (
  week    date NOT NULL,                   -- its Monday
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier    int  NOT NULL,
  cohort  int  NOT NULL,
  points  int,                             -- set when the week closes
  place   int,
  result  text CHECK (result IN ('up', 'down', 'stay')),
  PRIMARY KEY (week, user_id)
);
CREATE INDEX IF NOT EXISTS league_weeks_group ON public.league_weeks (week, tier, cohort);
ALTER TABLE public.league_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_weeks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_players, public.league_weeks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.league_name(p_tier int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY['Bronze', 'Silver', 'Gold', 'Sapphire', 'Diamond'])[greatest(1, least(5, p_tier))];
$$;

-- Your league this week (you join it the first time you look); standings with the zones
CREATE OR REPLACE FUNCTION public.my_league()
RETURNS TABLE (tier int, league text, week date, ends date, place int, nickname text, points int, is_me boolean, zone text, size int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); wk date := date_trunc('week', current_date)::date; t int; c int; ids uuid[]; n int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF is_minor(me) OR is_banned(me) OR NOT EXISTS (SELECT 1 FROM social_profiles sp WHERE sp.user_id = me AND sp.on_leaderboard) THEN RETURN; END IF;
  SELECT lw.tier, lw.cohort INTO t, c FROM league_weeks lw WHERE lw.week = wk AND lw.user_id = me;
  IF NOT FOUND THEN
    INSERT INTO league_players (user_id) VALUES (me) ON CONFLICT DO NOTHING;
    SELECT lp.tier INTO t FROM league_players lp WHERE lp.user_id = me;
    PERFORM pg_advisory_xact_lock(hashtext('league' || wk || t));
    SELECT lw.cohort INTO c FROM league_weeks lw WHERE lw.week = wk AND lw.tier = t
     GROUP BY lw.cohort HAVING count(*) < 20 ORDER BY lw.cohort LIMIT 1;
    IF c IS NULL THEN SELECT coalesce(max(lw.cohort), 0) + 1 INTO c FROM league_weeks lw WHERE lw.week = wk AND lw.tier = t; END IF;
    INSERT INTO league_weeks (week, user_id, tier, cohort) VALUES (wk, me, t, c) ON CONFLICT DO NOTHING;
  END IF;
  SELECT array_agg(lw.user_id) INTO ids FROM league_weeks lw WHERE lw.week = wk AND lw.tier = t AND lw.cohort = c;
  n := cardinality(ids);
  RETURN QUERY
  WITH pts AS (SELECT * FROM points_between(wk, wk + 7, ids)),
  ranked AS (
    SELECT u AS user_id, sp.nickname, coalesce(p.points, 0) AS pts,
           row_number() OVER (ORDER BY coalesce(p.points, 0) DESC, p.last_at ASC NULLS LAST, sp.nickname)::int AS rn
    FROM unnest(ids) u JOIN social_profiles sp ON sp.user_id = u LEFT JOIN pts p ON p.user_id = u
  )
  SELECT t, league_name(t), wk, wk + 6, r.rn, r.nickname, r.pts, r.user_id = me,
         CASE WHEN r.rn <= 5 AND t < 5 AND r.pts > 0 THEN 'up' WHEN n >= 10 AND r.rn > n - 5 AND t > 1 THEN 'down' ELSE 'stay' END, n
  FROM ranked r ORDER BY r.rn;
END $$;

-- Monday: last week's groups close; the top 5 go up, the bottom 5 go down
CREATE OR REPLACE FUNCTION public.close_leagues()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wk date := date_trunc('week', current_date)::date - 7; g record; r record; ids uuid[]; n int; moved int := 0; res text;
BEGIN
  FOR g IN SELECT DISTINCT tier, cohort FROM league_weeks WHERE week = wk AND result IS NULL LOOP
    SELECT array_agg(user_id) INTO ids FROM league_weeks WHERE week = wk AND tier = g.tier AND cohort = g.cohort;
    n := cardinality(ids);
    FOR r IN
      SELECT u AS user_id, coalesce(p.points, 0) AS pts,
             row_number() OVER (ORDER BY coalesce(p.points, 0) DESC, p.last_at ASC NULLS LAST)::int AS rn
      FROM unnest(ids) u LEFT JOIN points_between(wk, wk + 7, ids) p ON p.user_id = u
    LOOP
      res := CASE WHEN r.rn <= 5 AND g.tier < 5 AND r.pts > 0 THEN 'up' WHEN n >= 10 AND r.rn > n - 5 AND g.tier > 1 THEN 'down' ELSE 'stay' END;
      UPDATE league_weeks SET points = r.pts, place = r.rn, result = res WHERE week = wk AND user_id = r.user_id;
      IF res <> 'stay' THEN
        UPDATE league_players SET tier = tier + CASE WHEN res = 'up' THEN 1 ELSE -1 END, updated_at = now() WHERE user_id = r.user_id;
        moved := moved + 1;
      END IF;
      IF res = 'up' THEN
        PERFORM feed_post(r.user_id, 'league', 'Promoted to ' || league_name(g.tier + 1), jsonb_build_object('tier', g.tier + 1, 'place', r.rn));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM reminder_settings WHERE user_id = r.user_id AND notify_achievements = false) THEN
        PERFORM notify(r.user_id, 'league',
          CASE res WHEN 'up' THEN 'Up to ' || league_name(g.tier + 1) || ' League 🎉' WHEN 'down' THEN 'Down to ' || league_name(g.tier - 1) || ' League'
                   ELSE 'You stayed in ' || league_name(g.tier) || ' League' END,
          'You finished #' || r.rn || ' last week with ' || r.pts || ' points.' || CASE WHEN res = 'down' THEN ' Win it back this week 💪' ELSE '' END,
          '/?open=ranks', true);
      END IF;
    END LOOP;
  END LOOP;
  RETURN moved;
END $$;
REVOKE ALL ON FUNCTION public.close_leagues() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('close-leagues') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-leagues');
    PERFORM cron.schedule('close-leagues', '0 12 * * 1', 'SELECT public.close_leagues()');
  END IF;
END $$;

-- Your place on a board even outside the top 100, and who's just above you
CREATE OR REPLACE FUNCTION public.my_standing(p_scope text)
RETURNS TABLE (place int, points int, above_nickname text, above_points int, total int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); m date := date_trunc('month', current_date)::date;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH pool AS (
    SELECT sp.user_id, sp.nickname FROM social_profiles sp
    WHERE sp.user_id = me OR (p_scope = 'friends' AND are_friends(me, sp.user_id)) OR (p_scope <> 'friends' AND sp.on_leaderboard)
  ),
  r AS (
    SELECT pool.user_id, pool.nickname, coalesce(t.points, 0) AS pts,
           row_number() OVER (ORDER BY coalesce(t.points, 0) DESC, t.last_at ASC NULLS LAST, pool.nickname)::int AS rn
    FROM pool LEFT JOIN month_points(m) t ON t.user_id = pool.user_id
  )
  SELECT r.rn, r.pts, a.nickname, a.pts, (SELECT count(*)::int FROM r)
  FROM r LEFT JOIN r a ON a.rn = r.rn - 1 WHERE r.user_id = me;
END $$;

-- ── Friend profiles ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.friend_profile(p_nickname text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); them uuid; pv public.privacy_settings; out jsonb; streak int := 0; d date := current_date; since timestamptz;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT user_id INTO them FROM social_profiles WHERE nickname = lower(ltrim(btrim(p_nickname), '@'));
  IF them IS NULL OR (them <> me AND (NOT are_friends(me, them) OR blocked_between(me, them))) THEN
    RAISE EXCEPTION 'Not available' USING ERRCODE = '42501';
  END IF;
  pv := privacy_of(them);
  IF NOT EXISTS (SELECT 1 FROM workout_logs WHERE user_id = them AND date::date = d AND NOT flagged) THEN d := d - 1; END IF;
  WHILE EXISTS (SELECT 1 FROM workout_logs w WHERE w.user_id = them AND NOT w.flagged AND w.date::date = d AND coalesce(jsonb_array_length(w.sets), 0) >= 3) LOOP
    streak := streak + 1; d := d - 1; EXIT WHEN streak > 400;
  END LOOP;
  SELECT f.created_at INTO since FROM friendships f
   WHERE f.status = 'accepted' AND ((f.requester = me AND f.addressee = them) OR (f.requester = them AND f.addressee = me));
  out := jsonb_build_object(
    'nickname', (SELECT nickname FROM social_profiles WHERE user_id = them),
    'me', them = me,
    'friends_since', since,
    'friends', (SELECT count(*) FROM friendships f WHERE f.status = 'accepted' AND them IN (f.requester, f.addressee)),
    'month_points', coalesce((SELECT points FROM month_points(current_date) WHERE user_id = them), 0),
    'lifetime', coalesce((SELECT sum(points) FROM monthly_scores WHERE user_id = them), 0)
                + coalesce((SELECT points FROM month_points(current_date) WHERE user_id = them), 0),
    'streak', streak,
    'workouts', (SELECT count(*) FROM workout_logs WHERE user_id = them AND NOT flagged),
    'month_days', (SELECT count(DISTINCT date::date) FROM workout_logs WHERE user_id = them AND NOT flagged AND date::date >= date_trunc('month', current_date)),
    'league', (SELECT league_name(tier) FROM league_players WHERE user_id = them),
    'challenges_won', (SELECT count(*) FROM challenge_wins WHERE user_id = them)
                      + (SELECT count(*) FROM friend_challenges WHERE status = 'done' AND winner = them)
                      + (SELECT count(*) FROM crew_challenges WHERE status = 'done' AND winner = them),
    'vs_me', CASE WHEN them = me THEN NULL ELSE jsonb_build_object(
       'won', (SELECT count(*) FROM friend_challenges WHERE status = 'done' AND winner = me AND them IN (challenger, opponent) AND me IN (challenger, opponent)),
       'lost', (SELECT count(*) FROM friend_challenges WHERE status = 'done' AND winner = them AND me IN (challenger, opponent))) END,
    'shares', pv.share_activity OR them = me,
    'recent', CASE WHEN pv.share_activity OR them = me THEN (
       SELECT coalesce(jsonb_agg(jsonb_build_object('date', x.date, 'name', x.name, 'sets', x.n, 'volume', round(coalesce(x.volume, 0))) ORDER BY x.date DESC), '[]')
       FROM (SELECT date, name, volume, coalesce(jsonb_array_length(sets), 0) AS n FROM workout_logs
             WHERE user_id = them AND NOT flagged ORDER BY date DESC, created_at DESC LIMIT 5) x) ELSE '[]' END,
    'lifts', CASE WHEN pv.show_lifts OR them = me THEN jsonb_build_object(
       'bench', challenge_progress(them, 'best_bench', '2000-01-01', current_date + 1),
       'squat', challenge_progress(them, 'best_squat', '2000-01-01', current_date + 1),
       'deadlift', challenge_progress(them, 'best_deadlift', '2000-01-01', current_date + 1),
       'press', challenge_progress(them, 'best_press', '2000-01-01', current_date + 1)) END
  );
  RETURN out;
END $$;

-- ── Chat, with privacy and bans; realtime for the two people in it ─────────
CREATE OR REPLACE FUNCTION public.send_message(p_nickname text, p_body text)
RETURNS TABLE (id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); them uuid; body text := btrim(coalesce(p_body, '')); m public.chat_messages;
BEGIN
  them := friend_by_nickname(p_nickname);
  IF is_minor(me) OR is_minor(them) THEN RAISE EXCEPTION 'Chat is for ages 16 and up' USING ERRCODE = 'P0001'; END IF;
  IF is_banned(me) THEN RAISE EXCEPTION 'Your account can''t send messages' USING ERRCODE = '42501'; END IF;
  IF (privacy_of(them)).messages = 'nobody' THEN RAISE EXCEPTION '@% isn''t taking messages right now', p_nickname USING ERRCODE = 'P0001'; END IF;
  IF char_length(body) = 0 THEN RAISE EXCEPTION 'Write something first' USING ERRCODE = 'P0001'; END IF;
  IF char_length(body) > 1000 THEN RAISE EXCEPTION 'That message is too long (1,000 characters at most)' USING ERRCODE = 'P0001'; END IF;
  IF NOT chat_clean(body) THEN RAISE EXCEPTION 'That message can''t be sent: it breaks the community rules.' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM chat_messages c WHERE c.sender = me AND c.created_at > now() - interval '1 minute') >= 20
     OR (SELECT count(*) FROM chat_messages c WHERE c.sender = me AND c.created_at > now() - interval '1 day') >= 500 THEN
    RAISE EXCEPTION 'Slow down: that''s a lot of messages. Try again in a bit.' USING ERRCODE = 'P0429';
  END IF;
  INSERT INTO chat_messages (sender, recipient, body) VALUES (me, them, body) RETURNING * INTO m;
  RETURN QUERY SELECT m.id, m.created_at;
END $$;

DROP POLICY IF EXISTS "people in a chat read it" ON public.chat_messages;
CREATE POLICY "people in a chat read it" ON public.chat_messages
  FOR SELECT TO authenticated USING ((auth.uid() = recipient OR auth.uid() = sender) AND NOT hidden);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

-- ── Scheduled rooms: pick friends and a time, everyone gets the reminder ────
CREATE OR REPLACE FUNCTION public.schedule_room(p_nicknames text[], p_starts_at timestamptz, p_title text DEFAULT NULL, p_plan jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); ids uuid[]; nm text[]; out uuid; n text; them uuid; nick text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF is_banned(me) THEN RAISE EXCEPTION 'Your account can''t do that' USING ERRCODE = '42501'; END IF;
  IF coalesce(cardinality(p_nicknames), 0) < 1 OR cardinality(p_nicknames) > 9 THEN RAISE EXCEPTION 'Pick 1 to 9 friends' USING ERRCODE = 'P0001'; END IF;
  IF p_starts_at < now() + interval '30 minutes' OR p_starts_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'Pick a time from half an hour to 30 days ahead' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM next_sessions WHERE created_by = me AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'Slow down: that''s a lot of bookings today.' USING ERRCODE = 'P0429';
  END IF;
  SELECT nickname INTO nick FROM social_profiles WHERE user_id = me;
  ids := ARRAY[me]; nm := ARRAY[nick];
  FOREACH n IN ARRAY p_nicknames LOOP
    them := friend_by_nickname(n);
    IF NOT them = ANY (ids) THEN ids := ids || them; nm := nm || (SELECT nickname FROM social_profiles WHERE user_id = them); END IF;
  END LOOP;
  INSERT INTO next_sessions (created_by, members, names, title, plan, starts_at)
  VALUES (me, ids, nm, nullif(left(btrim(coalesce(p_title, '')), 60), ''), p_plan, p_starts_at) RETURNING id INTO out;
  FOREACH them IN ARRAY ids[2:] LOOP
    PERFORM notify(them, 'next_session', '@' || coalesce(nick, 'A friend') || ' booked a workout with you 📅',
      coalesce(nullif(btrim(coalesce(p_title, '')), '') || ', ', '') || to_char(p_starts_at AT TIME ZONE 'UTC', 'Dy DD Mon') || '. Tap to see it.', '/?open=next', true);
  END LOOP;
  RETURN out;
END $$;

-- The title comes back with the booking now
DROP FUNCTION IF EXISTS public.my_next_sessions();
CREATE FUNCTION public.my_next_sessions()
RETURNS TABLE (id uuid, starts_at timestamptz, names text[], plan jsonb, room_code text, created_by uuid, title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.starts_at, n.names, n.plan,
         CASE WHEN EXISTS (SELECT 1 FROM group_sessions g WHERE g.code = n.room_code AND g.status <> 'done') THEN n.room_code END,
         n.created_by, n.title
    FROM next_sessions n
   WHERE auth.uid() = ANY (n.members) AND n.starts_at > now() - interval '3 hours'
   ORDER BY n.starts_at;
$$;

-- ── Moderation (admins) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reports(p_open boolean DEFAULT true)
RETURNS TABLE (id uuid, created_at timestamptz, reason text, details text, reporter text, reported text, reported_id uuid,
               message text, in_room boolean, earlier int, banned boolean, resolved_at timestamptz, action text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT r.id, r.created_at, r.reason, r.details,
         (SELECT nickname FROM social_profiles WHERE user_id = r.reporter),
         (SELECT nickname FROM social_profiles WHERE user_id = r.reported), r.reported,
         (SELECT body FROM chat_messages WHERE chat_messages.id = r.message_id), r.session_id IS NOT NULL,
         (SELECT count(*)::int FROM user_reports o WHERE o.reported = r.reported AND o.id <> r.id),
         is_banned(r.reported), r.resolved_at, r.action
  FROM user_reports r
  WHERE (p_open AND r.resolved_at IS NULL) OR (NOT p_open AND r.resolved_at IS NOT NULL)
  ORDER BY r.created_at DESC LIMIT 200;
END $$;

-- dismiss · warn (they get a notification) · remove (their messages to the reporter are hidden)
-- · ban (everything they posted goes, friendships end; api/admin-moderate.js also locks the login)
CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.user_reports; admin uuid := auth.uid();
BEGIN
  IF NOT is_admin() AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('dismiss', 'warn', 'remove', 'ban') THEN RAISE EXCEPTION 'Unknown action' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO r FROM user_reports WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF p_action = 'warn' THEN
    PERFORM notify(r.reported, 'warning', 'A message from the ATHRION team',
      'Someone reported you for ' || replace(r.reason, '_', ' ') || '. Keep it friendly: another report can remove your account.', '/', true);
  ELSIF p_action = 'remove' THEN
    UPDATE chat_messages SET hidden = true WHERE sender = r.reported AND recipient = r.reporter;
  ELSIF p_action = 'ban' THEN
    PERFORM admin_ban(r.reported, r.reason, admin);
  END IF;
  UPDATE user_reports SET resolved_at = now(), action = p_action, resolved_by = admin
   WHERE reported = r.reported AND resolved_at IS NULL AND (id = p_id OR p_action = 'ban');
END $$;

CREATE OR REPLACE FUNCTION public.admin_ban(p_user uuid, p_reason text, p_by uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO user_bans (user_id, reason, banned_by) VALUES (p_user, coalesce(p_reason, ''), p_by) ON CONFLICT (user_id) DO NOTHING;
  UPDATE chat_messages SET hidden = true WHERE sender = p_user;
  DELETE FROM feed_events WHERE user_id = p_user;
  DELETE FROM friendships WHERE p_user IN (requester, addressee);
  UPDATE social_profiles SET on_leaderboard = false WHERE user_id = p_user;
END $$;
REVOKE ALL ON FUNCTION public.admin_ban(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_unban(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  DELETE FROM user_bans WHERE user_id = p_user;
END $$;

-- Why people leave, the last p_days days
CREATE OR REPLACE FUNCTION public.admin_exit_summary(p_days int DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM exit_surveys WHERE created_at > now() - make_interval(days => p_days)),
    'by_kind', (SELECT coalesce(jsonb_object_agg(kind, n), '{}') FROM (SELECT kind, count(*) n FROM exit_surveys
                WHERE created_at > now() - make_interval(days => p_days) GROUP BY kind) k),
    'reasons', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'reason', reason, 'n', n) ORDER BY n DESC), '[]') FROM (
                  SELECT kind, unnest(reasons) AS reason, count(*) n FROM exit_surveys
                  WHERE created_at > now() - make_interval(days => p_days) GROUP BY kind, unnest(reasons)) x),
    'comments', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'comment', comment, 'pro', pro, 'app', app, 'at', created_at) ORDER BY created_at DESC), '[]')
                 FROM (SELECT * FROM exit_surveys WHERE comment <> '' AND created_at > now() - make_interval(days => p_days)
                       ORDER BY created_at DESC LIMIT 50) c),
    'flagged', (SELECT count(*) FROM workout_logs WHERE flagged AND created_at > now() - make_interval(days => p_days))
  );
END $$;

-- ── Who may call what ───────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'friend_feed(timestamptz)', 'react_feed(uuid, text)', 'my_challenges()', 'my_challenge_record()',
    'challenge_friend(text, text)', 'my_friend_challenges()', 'challenge_crew(text[], text)', 'answer_crew_challenge(uuid, boolean)',
    'my_crew_challenges()', 'my_league()', 'my_standing(text)', 'friend_profile(text)', 'send_message(text, text)',
    'schedule_room(text[], timestamptz, text, jsonb)', 'my_next_sessions()', 'admin_reports(boolean)',
    'admin_resolve_report(uuid, text)', 'admin_unban(uuid)', 'admin_exit_summary(integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text) TO service_role;
  GRANT EXECUTE ON FUNCTION public.admin_unban(uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.admin_ban(uuid, text, uuid) TO service_role;
END $$;
