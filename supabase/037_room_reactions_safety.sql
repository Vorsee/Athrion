-- 037: inside a Train together room. Reactions on someone's set (laughing, like, dumbbell),
-- and safety: block someone (they can't join your rooms or send you friend requests, and the
-- friendship ends) and report someone (every admin gets a notification).
-- Apply after 035. The app before this still works; the app after it hides reactions,
-- block and report until it runs. Safe to re-run.

-- ── Reactions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  set_id     uuid        NOT NULL REFERENCES public.group_sets(id) ON DELETE CASCADE,
  from_user  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_name  text        NOT NULL,
  kind       text        NOT NULL CHECK (kind IN ('laugh', 'like', 'lift')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_id, from_user, kind)
);
CREATE INDEX IF NOT EXISTS group_reactions_session ON public.group_reactions (session_id, created_at);
ALTER TABLE public.group_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room members read reactions" ON public.group_reactions;
CREATE POLICY "room members read reactions" ON public.group_reactions
  FOR SELECT TO authenticated USING (public.is_group_participant(session_id));

-- Only on someone else's set in a room you're in, as yourself
DROP POLICY IF EXISTS "room members react to sets" ON public.group_reactions;
CREATE POLICY "room members react to sets" ON public.group_reactions
  FOR INSERT TO authenticated WITH CHECK (
    from_user = auth.uid()
    AND public.is_group_participant(session_id)
    AND EXISTS (SELECT 1 FROM public.group_sets g
                WHERE g.id = set_id AND g.session_id = group_reactions.session_id
                  AND g.user_id = to_user AND g.user_id <> auth.uid())
  );

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'group_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_reactions;
  END IF;
END $$;

-- ── Blocking ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own blocks" ON public.user_blocks;
CREATE POLICY "read own blocks" ON public.user_blocks
  FOR SELECT TO authenticated USING (blocker = auth.uid());

CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_blocks WHERE (blocker = a AND blocked = b) OR (blocker = b AND blocked = a));
$$;
REVOKE ALL ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Block: ends the friendship (and any request), and takes them out of rooms you host now
CREATE OR REPLACE FUNCTION public.block_user(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_user IS NULL OR p_user = me THEN RAISE EXCEPTION 'You can''t block yourself' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO user_blocks (blocker, blocked) VALUES (me, p_user) ON CONFLICT DO NOTHING;
  DELETE FROM friendships
   WHERE LEAST(requester, addressee) = LEAST(me, p_user) AND GREATEST(requester, addressee) = GREATEST(me, p_user);
  DELETE FROM group_participants gp USING group_sessions s
   WHERE gp.session_id = s.id AND s.host_id = me AND s.status <> 'done' AND gp.user_id = p_user;
END $$;
REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_user(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM user_blocks WHERE blocker = auth.uid() AND blocked = p_user;
$$;
REVOKE ALL ON FUNCTION public.unblock_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;

-- The people you blocked, with their nicknames (for You → Blocked)
CREATE OR REPLACE FUNCTION public.my_blocks()
RETURNS TABLE (user_id uuid, nickname text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.blocked, sp.nickname, b.created_at
    FROM user_blocks b LEFT JOIN social_profiles sp ON sp.user_id = b.blocked
   WHERE b.blocker = auth.uid()
   ORDER BY b.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.my_blocks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_blocks() TO authenticated;

-- A blocked person can't send a request either way. Says "no one has that nickname", as for
-- someone who doesn't exist, so a block isn't revealed.
CREATE OR REPLACE FUNCTION public.friendships_no_blocked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_blocked(NEW.requester, NEW.addressee) THEN
    RAISE EXCEPTION 'No one has that nickname' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS friendships_no_blocked ON public.friendships;
CREATE TRIGGER friendships_no_blocked BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.friendships_no_blocked();

-- Nor join a room whose host blocked them (or whom they blocked): "Room not found"
CREATE OR REPLACE FUNCTION public.group_join_no_blocked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE host uuid;
BEGIN
  SELECT host_id INTO host FROM group_sessions WHERE id = NEW.session_id;
  IF host IS NOT NULL AND host <> NEW.user_id AND is_blocked(host, NEW.user_id) THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS group_participants_no_blocked ON public.group_participants;
CREATE TRIGGER group_participants_no_blocked BEFORE INSERT ON public.group_participants
  FOR EACH ROW EXECUTE FUNCTION public.group_join_no_blocked();

-- Reactions between blocked people don't go through either
CREATE OR REPLACE FUNCTION public.group_reactions_no_blocked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_blocked(NEW.from_user, NEW.to_user) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS group_reactions_no_blocked ON public.group_reactions;
CREATE TRIGGER group_reactions_no_blocked BEFORE INSERT ON public.group_reactions
  FOR EACH ROW EXECUTE FUNCTION public.group_reactions_no_blocked();

-- ── Reports ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid        REFERENCES public.group_sessions(id) ON DELETE SET NULL,
  reason      text        NOT NULL CHECK (reason IN ('abuse', 'spam', 'inappropriate', 'underage', 'other')),
  details     text        NOT NULL DEFAULT '' CHECK (char_length(details) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read reports" ON public.user_reports;
CREATE POLICY "admins read reports" ON public.user_reports
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM app_admins a WHERE a.user_id = auth.uid()));

-- Report someone: saved, and every admin is told. At most 10 reports a day from one person.
CREATE OR REPLACE FUNCTION public.report_user(p_user uuid, p_reason text, p_details text DEFAULT '', p_session uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  who text;
  a record;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_user IS NULL OR p_user = me THEN RAISE EXCEPTION 'You can''t report yourself' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM user_reports WHERE reporter = me AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'Too many reports today. Try again tomorrow.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO user_reports (reporter, reported, session_id, reason, details)
  VALUES (me, p_user, p_session, p_reason, left(coalesce(trim(p_details), ''), 500));
  SELECT coalesce('@' || nickname, 'Someone') INTO who FROM social_profiles WHERE user_id = p_user;
  FOR a IN SELECT user_id FROM app_admins LOOP
    PERFORM notify(a.user_id, 'report', 'New report',
      coalesce(who, 'Someone') || ' was reported for ' || replace(p_reason, '_', ' ') || '.', '/');
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.report_user(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_user(uuid, text, text, uuid) TO authenticated;

-- The same from Friends, where people are known by nickname (my_friends has no account ids)
CREATE OR REPLACE FUNCTION public.block_nickname(p_nickname text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE them uuid;
BEGIN
  SELECT user_id INTO them FROM social_profiles WHERE nickname = lower(ltrim(trim(p_nickname), '@'));
  IF them IS NULL THEN RAISE EXCEPTION 'No one has that nickname' USING ERRCODE = 'P0002'; END IF;
  PERFORM block_user(them);
END $$;
REVOKE ALL ON FUNCTION public.block_nickname(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_nickname(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_nickname(p_nickname text, p_reason text, p_details text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE them uuid;
BEGIN
  SELECT user_id INTO them FROM social_profiles WHERE nickname = lower(ltrim(trim(p_nickname), '@'));
  IF them IS NULL THEN RAISE EXCEPTION 'No one has that nickname' USING ERRCODE = 'P0002'; END IF;
  PERFORM report_user(them, p_reason, p_details, NULL);
END $$;
REVOKE ALL ON FUNCTION public.report_nickname(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_nickname(text, text, text) TO authenticated;
