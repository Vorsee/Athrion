-- 045: Send limits, buddy nudges, exit surveys and challenges. Safe to re-run.
--
-- Limits: a script can't flood anyone. Each insert counts the sender's own rows in a window
-- and stops past a limit (high enough that no person reaches it; imports of past workouts fit):
--   workouts 300 a day · friend requests 40 a day · rooms 30 a day · reactions 300 an hour
--   reports 20 a day · run club posts 30 a day · group runs 20 a day
-- Buddy nudges: a workout saved for today tells each friend "@you just trained" (push, kind
--   buddy_trained), once a day per friend and 3 a day per person at most; never across a block;
--   switch reminder_settings.notify_buddies.
-- Exit surveys: why someone deletes their account or cancels PRO, optional, readable by admins.
-- Challenges: everyone gets the same weekly and monthly challenge, worked out from workout_logs
--   and checked here; friends can challenge each other head to head for 7 days.

-- ── Limits ──────────────────────────────────────────────────────────────────
-- TG_ARGV: the sender's column, the limit, the window
CREATE OR REPLACE FUNCTION public.rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE col text := TG_ARGV[0]; lim int := TG_ARGV[1]::int; win interval := TG_ARGV[2]::interval; who uuid; n int;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  who := (to_jsonb(NEW) ->> col)::uuid;
  IF who IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - $2', TG_TABLE_SCHEMA, TG_TABLE_NAME, col)
    INTO n USING who, win;
  IF n >= lim THEN
    RAISE EXCEPTION 'Slow down: that''s a lot in a short time. Try again later.' USING ERRCODE = 'P0429';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rate_limit() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('workout_logs', 'user_id', '300', '1 day'),
    ('friendships', 'requester', '40', '1 day'),
    ('group_sessions', 'host_id', '30', '1 day'),
    ('group_reactions', 'from_user', '300', '1 hour'),
    ('user_reports', 'reporter', '20', '1 day'),
    ('club_posts', 'author_id', '30', '1 day'),
    ('club_runs', 'created_by', '20', '1 day')
  ) AS t(tbl, col, lim, win) LOOP
    IF to_regclass('public.' || r.tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tbl || '_rate_limit', r.tbl);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rate_limit(%L, %L, %L)',
                     r.tbl || '_rate_limit', r.tbl, r.col, r.lim, r.win);
    END IF;
  END LOOP;
END $$;

-- ── Switches for the new pushes ─────────────────────────────────────────────
ALTER TABLE public.reminder_settings
  ADD COLUMN IF NOT EXISTS notify_buddies    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_challenges boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_chat       boolean NOT NULL DEFAULT true;

-- Two people who blocked each other either way
CREATE OR REPLACE FUNCTION public.blocked_between(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_blocks WHERE (blocker = a AND blocked = b) OR (blocker = b AND blocked = a));
$$;
REVOKE ALL ON FUNCTION public.blocked_between(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.are_friends(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM friendships WHERE status = 'accepted'
                 AND ((requester = a AND addressee = b) OR (requester = b AND addressee = a)));
$$;
REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- A friend by nickname, for the caller: their id, or an error
CREATE OR REPLACE FUNCTION public.friend_by_nickname(p_nickname text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); them uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT user_id INTO them FROM social_profiles WHERE nickname = lower(btrim(p_nickname, ' @'));
  IF them IS NULL OR them = me OR NOT are_friends(me, them) THEN RAISE EXCEPTION 'Not your friend' USING ERRCODE = 'P0002'; END IF;
  IF blocked_between(me, them) THEN RAISE EXCEPTION 'Not available' USING ERRCODE = 'P0002'; END IF;
  RETURN them;
END $$;
REVOKE ALL ON FUNCTION public.friend_by_nickname(text) FROM PUBLIC, anon, authenticated;

-- ── Buddy nudges ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.buddy_nudges (
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- told
  buddy_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- who trained
  day      date NOT NULL,
  PRIMARY KEY (user_id, buddy_id, day)
);
ALTER TABLE public.buddy_nudges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_nudges FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.workout_buddy_nudge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nick text; f uuid; added int;
BEGIN
  -- Only a real workout today: 3+ sets, dated today or yesterday (not an import)
  IF NEW.date::date < current_date - 1 OR coalesce(jsonb_array_length(NEW.sets), 0) < 3 THEN RETURN NEW; END IF;
  SELECT nickname INTO nick FROM social_profiles WHERE user_id = NEW.user_id;
  IF nick IS NULL THEN RETURN NEW; END IF;
  FOR f IN
    SELECT CASE WHEN requester = NEW.user_id THEN addressee ELSE requester END
    FROM friendships WHERE status = 'accepted' AND NEW.user_id IN (requester, addressee)
  LOOP
    CONTINUE WHEN blocked_between(f, NEW.user_id);
    CONTINUE WHEN EXISTS (SELECT 1 FROM reminder_settings WHERE user_id = f AND notify_buddies = false);
    CONTINUE WHEN (SELECT count(*) FROM buddy_nudges WHERE user_id = f AND day = current_date) >= 3;
    INSERT INTO buddy_nudges (user_id, buddy_id, day) VALUES (f, NEW.user_id, current_date) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    IF added > 0 THEN
      PERFORM notify(f, 'buddy_trained', '@' || nick || ' just trained 💪', 'Your turn? A quick session keeps you level.', '/?open=workout', true);
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'workout_buddy_nudge: %', SQLERRM;   -- never stop the workout from saving
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workout_logs_buddy_nudge ON public.workout_logs;
CREATE TRIGGER workout_logs_buddy_nudge AFTER INSERT ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.workout_buddy_nudge();

-- ── Exit surveys ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exit_surveys (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,   -- gone with the account
  kind       text        NOT NULL CHECK (kind IN ('delete', 'cancel')),
  reasons    text[]      NOT NULL DEFAULT '{}',
  comment    text        NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  pro        boolean     NOT NULL DEFAULT false,
  app        text        NOT NULL DEFAULT 'ios' CHECK (app IN ('ios', 'web')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exit_surveys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exit_surveys FROM anon, authenticated;
DROP POLICY IF EXISTS "admins read exit surveys" ON public.exit_surveys;
CREATE POLICY "admins read exit surveys" ON public.exit_surveys FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM app_admins a WHERE a.user_id = auth.uid()));
GRANT SELECT ON public.exit_surveys TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_exit_survey(p_kind text, p_reasons text[], p_comment text DEFAULT '', p_app text DEFAULT 'ios')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
  allowed text[] := ARRAY['too_expensive', 'not_using', 'missing_feature', 'too_hard', 'bugs', 'privacy', 'other_app', 'reached_goal', 'other'];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM exit_surveys WHERE user_id = me AND created_at > now() - interval '1 day') >= 5 THEN RETURN; END IF;
  INSERT INTO exit_surveys (user_id, kind, reasons, comment, pro, app)
  VALUES (me, p_kind, ARRAY(SELECT r FROM unnest(coalesce(p_reasons, '{}')) r WHERE r = ANY (allowed) LIMIT 9),
          left(btrim(coalesce(p_comment, '')), 1000),
          EXISTS (SELECT 1 FROM subscriptions WHERE user_id = me AND status = 'pro'),
          CASE WHEN p_app = 'web' THEN 'web' ELSE 'ios' END);
END $$;

-- ── Challenges: the same for everyone, each week and each month ────────────
CREATE TABLE IF NOT EXISTS public.challenges (
  key    text    PRIMARY KEY,                 -- 'w2026-11-16' (its Monday) or 'm2026-11'
  period text    NOT NULL CHECK (period IN ('week', 'month')),
  starts date    NOT NULL,
  ends   date    NOT NULL,
  metric text    NOT NULL CHECK (metric IN ('workout_days', 'volume_lb', 'room_days', 'streak_days')),
  goal   numeric NOT NULL CHECK (goal > 0)
);
CREATE TABLE IF NOT EXISTS public.challenge_wins (
  key     text        NOT NULL REFERENCES public.challenges(key) ON DELETE CASCADE,
  user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  done_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, user_id)
);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_wins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.challenges, public.challenge_wins FROM anon, authenticated;

-- How far someone is on a metric between two days, from what the server already has
CREATE OR REPLACE FUNCTION public.challenge_progress(p_user uuid, p_metric text, p_from date, p_to date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric := 0; best int := 0; run int := 0; prev date; d date;
BEGIN
  IF p_metric = 'workout_days' THEN
    SELECT count(DISTINCT date::date) INTO v FROM workout_logs
    WHERE user_id = p_user AND date::date BETWEEN p_from AND p_to AND coalesce(jsonb_array_length(sets), 0) >= 3;
  ELSIF p_metric = 'volume_lb' THEN
    SELECT coalesce(sum(volume), 0) INTO v FROM workout_logs WHERE user_id = p_user AND date::date BETWEEN p_from AND p_to;
  ELSIF p_metric = 'room_days' THEN
    SELECT count(DISTINCT s.logged_at::date) INTO v FROM group_sets s
    WHERE s.user_id = p_user AND s.logged_at::date BETWEEN p_from AND p_to
      AND EXISTS (SELECT 1 FROM group_sets o WHERE o.session_id = s.session_id AND o.user_id <> p_user);
  ELSIF p_metric = 'streak_days' THEN
    FOR d IN SELECT DISTINCT date::date FROM workout_logs
             WHERE user_id = p_user AND date::date BETWEEN p_from AND p_to AND coalesce(jsonb_array_length(sets), 0) >= 3 ORDER BY 1 LOOP
      run := CASE WHEN prev IS NOT NULL AND d = prev + 1 THEN run + 1 ELSE 1 END;
      best := greatest(best, run); prev := d;
    END LOOP;
    v := best;
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.challenge_progress(uuid, text, date, date) FROM PUBLIC, anon, authenticated;

-- This week's and this month's challenge, made the first time anyone asks (a fixed rotation)
CREATE OR REPLACE FUNCTION public.ensure_challenges()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE monday date := date_trunc('week', current_date)::date; first date := date_trunc('month', current_date)::date;
  wk int := extract(week FROM current_date)::int; mo int := extract(month FROM current_date)::int;
  weekly text[] := ARRAY['workout_days:3', 'volume_lb:20000', 'workout_days:4', 'room_days:1', 'streak_days:3', 'workout_days:5'];
  monthly text[] := ARRAY['workout_days:12', 'volume_lb:150000', 'workout_days:16', 'room_days:4'];
  w text := weekly[1 + wk % array_length(weekly, 1)]; m text := monthly[1 + mo % array_length(monthly, 1)];
BEGIN
  INSERT INTO challenges (key, period, starts, ends, metric, goal)
  VALUES ('w' || monday, 'week', monday, monday + 6, split_part(w, ':', 1), split_part(w, ':', 2)::numeric)
  ON CONFLICT (key) DO NOTHING;
  INSERT INTO challenges (key, period, starts, ends, metric, goal)
  VALUES ('m' || to_char(first, 'YYYY-MM'), 'month', first, (first + interval '1 month' - interval '1 day')::date, split_part(m, ':', 1), split_part(m, ':', 2)::numeric)
  ON CONFLICT (key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.ensure_challenges() FROM PUBLIC, anon, authenticated;

-- The caller's challenges now: progress, done, and how many people have finished. Finishing
-- records it (once) and sends a push.
CREATE OR REPLACE FUNCTION public.my_challenges()
RETURNS TABLE (key text, period text, starts date, ends date, metric text, goal numeric, progress numeric, done boolean, finishers int)
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
      IF added > 0 AND NOT EXISTS (SELECT 1 FROM reminder_settings WHERE user_id = me AND notify_challenges = false) THEN
        PERFORM notify(me, 'challenge_done', 'Challenge complete! 🏆',
          CASE WHEN c.period = 'week' THEN 'You finished this week''s challenge.' ELSE 'You finished this month''s challenge.' END, '/?open=challenges', true);
      END IF;
    END IF;
    RETURN QUERY SELECT c.key, c.period, c.starts, c.ends, c.metric, c.goal, p,
      EXISTS (SELECT 1 FROM challenge_wins w WHERE w.key = c.key AND w.user_id = me),
      (SELECT count(*)::int FROM challenge_wins w WHERE w.key = c.key);
  END LOOP;
END $$;

-- Challenges finished so far, newest first (the trophies)
CREATE OR REPLACE FUNCTION public.my_challenge_wins()
RETURNS TABLE (key text, period text, metric text, goal numeric, done_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.key, c.period, c.metric, c.goal, w.done_at FROM challenge_wins w JOIN challenges c ON c.key = w.key
  WHERE w.user_id = auth.uid() ORDER BY w.done_at DESC LIMIT 100;
$$;

-- ── Friend challenges: head to head for 7 days ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.friend_challenges (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric     text        NOT NULL CHECK (metric IN ('workout_days', 'volume_lb')),
  starts     date        NOT NULL DEFAULT current_date,
  ends       date        NOT NULL DEFAULT current_date + 6,
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'declined', 'done')),
  winner     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (challenger <> opponent)
);
CREATE INDEX IF NOT EXISTS friend_challenges_people ON public.friend_challenges (challenger, opponent);
ALTER TABLE public.friend_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_challenges FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.challenge_friend(p_nickname text, p_metric text DEFAULT 'workout_days')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); them uuid := friend_by_nickname(p_nickname); cid uuid; nick text;
BEGIN
  IF is_minor(me) OR is_minor(them) THEN RAISE EXCEPTION 'Challenges are for ages 16 and up' USING ERRCODE = 'P0001'; END IF;
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
      CASE WHEN p_metric = 'volume_lb' THEN 'Most weight lifted in 7 days. Accept?' ELSE 'Most workout days in 7 days. Accept?' END, '/?open=challenges', true);
  END IF;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.answer_friend_challenge(p_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.friend_challenges; nick text;
BEGIN
  SELECT * INTO c FROM friend_challenges WHERE id = p_id;
  IF c.opponent IS DISTINCT FROM auth.uid() OR c.status <> 'pending' THEN RAISE EXCEPTION 'Not your challenge to answer' USING ERRCODE = '42501'; END IF;
  IF p_accept THEN
    UPDATE friend_challenges SET status = 'active', starts = current_date, ends = current_date + 6 WHERE id = p_id;
    SELECT nickname INTO nick FROM social_profiles WHERE user_id = c.opponent;
    PERFORM notify(c.challenger, 'friend_challenge', '@' || coalesce(nick, 'Your friend') || ' accepted ⚔️', 'The challenge is on for 7 days. Go!', '/?open=challenges', true);
  ELSE
    UPDATE friend_challenges SET status = 'declined' WHERE id = p_id;
  END IF;
END $$;

-- Mine, with both sides' progress; ones past their end are settled here (winner, a push to both)
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

-- ── Who may call what ───────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'submit_exit_survey(text, text[], text, text)', 'my_challenges()', 'my_challenge_wins()',
    'challenge_friend(text, text)', 'answer_friend_challenge(uuid, boolean)', 'my_friend_challenges()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
