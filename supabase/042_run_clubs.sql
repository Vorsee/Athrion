-- 042: Run clubs. Anyone (16+, with a nickname) can start one for free; others join with the
-- invite code or link (/run-club/<code>). A club has:
--   • group runs the organiser posts (day and time, meeting place, distance, pace, a note) that
--     members RSVP to; a new run notifies every member (pushed like the rest of notifications)
--   • a monthly distance board from the runs members share with their clubs
--   • announcements: short posts from the organiser only (no member chat, nothing to moderate)
--   • members and the invite code; the organiser can remove people
-- Runs are kept on the phone; the iPhone app sends a run here (date, distance, time) only when
-- the person is in at least one run club, and the board only ever shows totals.
-- Every read and write goes through the functions below. Safe to re-run.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.run_clubs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 40),
  city       text        NOT NULL DEFAULT '' CHECK (char_length(city) <= 60),
  about      text        NOT NULL DEFAULT '' CHECK (char_length(about) <= 280),
  code       text        NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 8),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.run_club_members (
  club_id   uuid        NOT NULL REFERENCES public.run_clubs(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);
CREATE INDEX IF NOT EXISTS run_club_members_user ON public.run_club_members (user_id);

CREATE TABLE IF NOT EXISTS public.club_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES public.run_clubs(id) ON DELETE CASCADE,
  created_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  place       text        NOT NULL CHECK (char_length(btrim(place)) BETWEEN 2 AND 120),
  distance_m  numeric     CHECK (distance_m IS NULL OR (distance_m > 0 AND distance_m <= 100000)),
  pace        text        NOT NULL DEFAULT '' CHECK (char_length(pace) <= 40),
  note        text        NOT NULL DEFAULT '' CHECK (char_length(note) <= 280),
  cancelled   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS club_runs_club_start ON public.club_runs (club_id, starts_at);

CREATE TABLE IF NOT EXISTS public.club_run_rsvps (
  run_id     uuid        NOT NULL REFERENCES public.club_runs(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.club_posts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    uuid        NOT NULL REFERENCES public.run_clubs(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS club_posts_club_created ON public.club_posts (club_id, created_at DESC);

-- Runs a member shares with their clubs (id = the run's id on the phone, so re-sending is safe)
CREATE TABLE IF NOT EXISTS public.shared_runs (
  id         uuid        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_date   date        NOT NULL,
  distance_m numeric     NOT NULL CHECK (distance_m > 0 AND distance_m <= 300000),
  seconds    numeric     NOT NULL CHECK (seconds > 0 AND seconds <= 172800),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_runs_user_date ON public.shared_runs (user_id, run_date);

ALTER TABLE public.run_clubs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_run_rsvps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_runs      ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: the app only goes through the functions below
REVOKE ALL ON public.run_clubs, public.run_club_members, public.club_runs, public.club_run_rsvps,
              public.club_posts, public.shared_runs FROM anon, authenticated;

-- ── Helpers (inside other functions only) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_club_member(p_club uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM run_club_members WHERE club_id = p_club AND user_id = p_user);
$$;
CREATE OR REPLACE FUNCTION public.run_club_owner(p_club uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM run_clubs WHERE id = p_club AND owner_id = p_user);
$$;
REVOKE ALL ON FUNCTION public.run_club_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_club_owner(uuid, uuid)  FROM PUBLIC, anon, authenticated;

-- The same gate as Friends and rooms: signed in, a nickname, not under 16
CREATE OR REPLACE FUNCTION public.run_club_can_join(p_user uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF is_minor(p_user) THEN RAISE EXCEPTION 'Run clubs are for ages 16 and up' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM social_profiles s WHERE s.user_id = p_user) THEN
    RAISE EXCEPTION 'Pick a nickname first' USING ERRCODE = 'P0001';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.run_club_can_join(uuid) FROM PUBLIC, anon, authenticated;

-- ── Clubs ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_run_club(p_name text, p_city text DEFAULT '', p_about text DEFAULT '')
RETURNS TABLE (id uuid, name text, code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); c public.run_clubs;
BEGIN
  PERFORM run_club_can_join(me);
  IF (SELECT count(*) FROM run_clubs WHERE owner_id = me) >= 3 THEN
    RAISE EXCEPTION 'You can run up to 3 clubs' USING ERRCODE = 'P0004';
  END IF;
  INSERT INTO run_clubs (owner_id, name, city, about)
  VALUES (me, btrim(p_name), btrim(coalesce(p_city, '')), btrim(coalesce(p_about, '')))
  RETURNING * INTO c;
  INSERT INTO run_club_members (club_id, user_id) VALUES (c.id, me);
  RETURN QUERY SELECT c.id, c.name, c.code;
END $$;

-- The organiser changes the name, city or about
CREATE OR REPLACE FUNCTION public.update_run_club(p_club uuid, p_name text, p_city text, p_about text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT run_club_owner(p_club, auth.uid()) THEN RAISE EXCEPTION 'Only the organiser can do that' USING ERRCODE = '42501'; END IF;
  UPDATE run_clubs SET name = btrim(p_name), city = btrim(coalesce(p_city, '')), about = btrim(coalesce(p_about, ''))
  WHERE id = p_club;
END $$;

-- My clubs, with the member count and the next run
CREATE OR REPLACE FUNCTION public.my_run_clubs()
RETURNS TABLE (id uuid, name text, city text, code text, is_owner boolean, members int, next_run timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.city, c.code, c.owner_id = auth.uid(),
         (SELECT count(*)::int FROM run_club_members m2 WHERE m2.club_id = c.id),
         (SELECT min(r.starts_at) FROM club_runs r WHERE r.club_id = c.id AND NOT r.cancelled AND r.starts_at > now() - interval '2 hours')
  FROM run_clubs c JOIN run_club_members m ON m.club_id = c.id AND m.user_id = auth.uid()
  ORDER BY c.name;
$$;

-- What an invite shows before joining
CREATE OR REPLACE FUNCTION public.run_club_preview(p_code text)
RETURNS TABLE (id uuid, name text, city text, about text, members int, organiser text, joined boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.city, c.about,
         (SELECT count(*)::int FROM run_club_members m WHERE m.club_id = c.id),
         (SELECT s.nickname FROM social_profiles s WHERE s.user_id = c.owner_id),
         run_club_member(c.id, auth.uid())
  FROM run_clubs c WHERE c.code = lower(btrim(p_code)) AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.join_run_club(p_code text)
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); c public.run_clubs;
BEGIN
  PERFORM run_club_can_join(me);
  SELECT * INTO c FROM run_clubs WHERE code = lower(btrim(p_code)) FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'No club with that code' USING ERRCODE = 'P0002'; END IF;
  IF NOT run_club_member(c.id, me) THEN
    IF (SELECT count(*) FROM run_club_members WHERE club_id = c.id) >= 200 THEN
      RAISE EXCEPTION 'This club is full' USING ERRCODE = 'P0004';
    END IF;
    INSERT INTO run_club_members (club_id, user_id) VALUES (c.id, me);
  END IF;
  RETURN QUERY SELECT c.id, c.name;
END $$;

-- Leave; an organiser who leaves hands the club to the longest-standing member, or it closes
CREATE OR REPLACE FUNCTION public.leave_run_club(p_club uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); nxt uuid;
BEGIN
  DELETE FROM run_club_members WHERE club_id = p_club AND user_id = me;
  DELETE FROM club_run_rsvps v USING club_runs r WHERE v.run_id = r.id AND r.club_id = p_club AND v.user_id = me;
  IF run_club_owner(p_club, me) THEN
    SELECT user_id INTO nxt FROM run_club_members WHERE club_id = p_club ORDER BY joined_at LIMIT 1;
    IF nxt IS NULL THEN DELETE FROM run_clubs WHERE id = p_club;
    ELSE UPDATE run_clubs SET owner_id = nxt WHERE id = p_club;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.delete_run_club(p_club uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT run_club_owner(p_club, auth.uid()) THEN RAISE EXCEPTION 'Only the organiser can do that' USING ERRCODE = '42501'; END IF;
  DELETE FROM run_clubs WHERE id = p_club;
END $$;

CREATE OR REPLACE FUNCTION public.remove_run_club_member(p_club uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT run_club_owner(p_club, auth.uid()) THEN RAISE EXCEPTION 'Only the organiser can do that' USING ERRCODE = '42501'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'Leave the club instead' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM run_club_members WHERE club_id = p_club AND user_id = p_user;
  DELETE FROM club_run_rsvps v USING club_runs r WHERE v.run_id = r.id AND r.club_id = p_club AND v.user_id = p_user;
END $$;

-- Members, organiser first
CREATE OR REPLACE FUNCTION public.run_club_members_list(p_club uuid)
RETURNS TABLE (user_id uuid, nickname text, is_owner boolean, joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, s.nickname, c.owner_id = m.user_id, m.joined_at
  FROM run_club_members m JOIN run_clubs c ON c.id = m.club_id
  LEFT JOIN social_profiles s ON s.user_id = m.user_id
  WHERE m.club_id = p_club AND run_club_member(p_club, auth.uid())
  ORDER BY (c.owner_id = m.user_id) DESC, m.joined_at;
$$;

-- ── Group runs ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_club_run(p_club uuid, p_starts_at timestamptz, p_place text,
  p_distance_m numeric DEFAULT NULL, p_pace text DEFAULT '', p_note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); rid uuid; c public.run_clubs; m record;
BEGIN
  SELECT * INTO c FROM run_clubs WHERE id = p_club;
  IF c.owner_id IS DISTINCT FROM me THEN RAISE EXCEPTION 'Only the organiser can do that' USING ERRCODE = '42501'; END IF;
  IF p_starts_at < now() - interval '1 hour' OR p_starts_at > now() + interval '120 days' THEN
    RAISE EXCEPTION 'Pick a time in the next 4 months' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO club_runs (club_id, created_by, starts_at, place, distance_m, pace, note)
  VALUES (p_club, me, p_starts_at, btrim(p_place), p_distance_m, btrim(coalesce(p_pace, '')), btrim(coalesce(p_note, '')))
  RETURNING id INTO rid;
  INSERT INTO club_run_rsvps (run_id, user_id) VALUES (rid, me);
  -- Everyone else in the club hears about it (the bell, and a push)
  FOR m IN SELECT user_id FROM run_club_members WHERE club_id = p_club AND user_id <> me LOOP
    PERFORM notify(m.user_id, 'club_run', c.name || ': new group run',
      'At ' || btrim(p_place) || '. Open it to see when, and say you''re going.', '/?open=clubs', true);
  END LOOP;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_club_run(p_run uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.club_runs; c public.run_clubs; v record;
BEGIN
  SELECT * INTO r FROM club_runs WHERE id = p_run;
  SELECT * INTO c FROM run_clubs WHERE id = r.club_id;
  IF c.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the organiser can do that' USING ERRCODE = '42501'; END IF;
  IF r.cancelled THEN RETURN; END IF;
  UPDATE club_runs SET cancelled = true WHERE id = p_run;
  FOR v IN SELECT user_id FROM club_run_rsvps WHERE run_id = p_run AND user_id <> auth.uid() LOOP
    PERFORM notify(v.user_id, 'club_run', c.name || ': run cancelled',
      'The run at ' || r.place || ' is off.', '/?open=clubs', true);
  END LOOP;
END $$;

-- Going, or not
CREATE OR REPLACE FUNCTION public.rsvp_club_run(p_run uuid, p_going boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); r public.club_runs;
BEGIN
  SELECT * INTO r FROM club_runs WHERE id = p_run;
  IF r.id IS NULL OR NOT run_club_member(r.club_id, me) THEN RAISE EXCEPTION 'Not in this club' USING ERRCODE = '42501'; END IF;
  IF p_going THEN
    IF r.cancelled THEN RAISE EXCEPTION 'This run was cancelled' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO club_run_rsvps (run_id, user_id) VALUES (p_run, me) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM club_run_rsvps WHERE run_id = p_run AND user_id = me;
  END IF;
END $$;

-- Upcoming runs (and the last week's), who's going and whether I am
CREATE OR REPLACE FUNCTION public.club_runs_list(p_club uuid)
RETURNS TABLE (id uuid, starts_at timestamptz, place text, distance_m numeric, pace text, note text,
               cancelled boolean, going int, me_going boolean, going_names text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.starts_at, r.place, r.distance_m, r.pace, r.note, r.cancelled,
         (SELECT count(*)::int FROM club_run_rsvps v WHERE v.run_id = r.id),
         EXISTS (SELECT 1 FROM club_run_rsvps v WHERE v.run_id = r.id AND v.user_id = auth.uid()),
         ARRAY(SELECT s.nickname FROM club_run_rsvps v JOIN social_profiles s ON s.user_id = v.user_id
               WHERE v.run_id = r.id ORDER BY v.created_at LIMIT 12)
  FROM club_runs r
  WHERE r.club_id = p_club AND run_club_member(p_club, auth.uid()) AND r.starts_at > now() - interval '7 days'
  ORDER BY r.starts_at;
$$;

-- ── Announcements (the organiser only) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_club_post(p_club uuid, p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  IF NOT run_club_owner(p_club, auth.uid()) THEN RAISE EXCEPTION 'Only the organiser can post' USING ERRCODE = '42501'; END IF;
  INSERT INTO club_posts (club_id, author_id, body) VALUES (p_club, auth.uid(), btrim(p_body)) RETURNING id INTO pid;
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.delete_club_post(p_post uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM club_posts p USING run_clubs c
  WHERE p.id = p_post AND c.id = p.club_id AND c.owner_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.club_posts_list(p_club uuid)
RETURNS TABLE (id uuid, body text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.body, p.created_at FROM club_posts p
  WHERE p.club_id = p_club AND run_club_member(p_club, auth.uid())
  ORDER BY p.created_at DESC LIMIT 30;
$$;

-- ── Shared runs and the distance board ──────────────────────────────────────
-- The phone sends a run only while its owner is in a club
CREATE OR REPLACE FUNCTION public.share_run(p_id uuid, p_date date, p_distance_m numeric, p_seconds numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM run_club_members WHERE user_id = me) THEN RETURN; END IF;
  INSERT INTO shared_runs (id, user_id, run_date, distance_m, seconds) VALUES (p_id, me, p_date, p_distance_m, p_seconds)
  ON CONFLICT (id) DO UPDATE SET run_date = EXCLUDED.run_date, distance_m = EXCLUDED.distance_m, seconds = EXCLUDED.seconds
  WHERE shared_runs.user_id = me;
END $$;

CREATE OR REPLACE FUNCTION public.unshare_run(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM shared_runs WHERE id = p_id AND user_id = auth.uid();
$$;

-- This month's distance per member (p_month: any day in it), most first
CREATE OR REPLACE FUNCTION public.run_club_board(p_club uuid, p_month date DEFAULT current_date)
RETURNS TABLE (user_id uuid, nickname text, distance_m numeric, runs int, me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, s.nickname, coalesce(sum(r.distance_m), 0), count(r.id)::int, m.user_id = auth.uid()
  FROM run_club_members m
  LEFT JOIN social_profiles s ON s.user_id = m.user_id
  LEFT JOIN shared_runs r ON r.user_id = m.user_id
       AND r.run_date >= date_trunc('month', p_month)::date
       AND r.run_date <  (date_trunc('month', p_month) + interval '1 month')::date
  WHERE m.club_id = p_club AND run_club_member(p_club, auth.uid())
  GROUP BY m.user_id, s.nickname
  ORDER BY 3 DESC, 2;
$$;

-- ── Who may call what ───────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'create_run_club(text, text, text)', 'update_run_club(uuid, text, text, text)', 'my_run_clubs()',
    'run_club_preview(text)', 'join_run_club(text)', 'leave_run_club(uuid)', 'delete_run_club(uuid)',
    'remove_run_club_member(uuid, uuid)', 'run_club_members_list(uuid)',
    'add_club_run(uuid, timestamptz, text, numeric, text, text)', 'cancel_club_run(uuid)',
    'rsvp_club_run(uuid, boolean)', 'club_runs_list(uuid)',
    'add_club_post(uuid, text)', 'delete_club_post(uuid)', 'club_posts_list(uuid)',
    'share_run(uuid, date, numeric, numeric)', 'unshare_run(uuid)', 'run_club_board(uuid, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
