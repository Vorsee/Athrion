-- 038: "Same time next week?" after a Train together room. One tap books the next session for
-- everyone who was in the room, with the same workout; each of them gets a notification an hour
-- before (pushed like every other one). Whoever opens it first makes the room; everyone else's
-- Join goes into that room. Apply after 037. The app before this still works; the app after
-- it hides "Same time next week?" until it runs. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.next_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session uuid        UNIQUE REFERENCES public.group_sessions(id) ON DELETE SET NULL,
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  members      uuid[]      NOT NULL,
  names        text[]      NOT NULL DEFAULT '{}',
  title        text,
  plan         jsonb,
  starts_at    timestamptz NOT NULL,
  room_code    text,
  reminded_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS next_sessions_starts ON public.next_sessions (starts_at);
ALTER TABLE public.next_sessions ENABLE ROW LEVEL SECURITY;
-- Read and changed only through the functions below

-- Book it from a room you were in: everyone in that room, its workout, starts_at (1 hour to 14
-- days ahead). Booking the same room twice returns the one already booked.
CREATE OR REPLACE FUNCTION public.schedule_next_session(p_session uuid, p_starts_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  s group_sessions;
  ids uuid[];
  nm text[];
  out uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM group_participants WHERE session_id = p_session AND user_id = me) THEN
    RAISE EXCEPTION 'Only people in the room can book the next one' USING ERRCODE = '42501';
  END IF;
  IF p_starts_at < now() + interval '1 hour' OR p_starts_at > now() + interval '14 days' THEN
    RAISE EXCEPTION 'Pick a time from an hour to two weeks ahead' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO out FROM next_sessions WHERE from_session = p_session;
  IF out IS NOT NULL THEN RETURN out; END IF;

  SELECT * INTO s FROM group_sessions WHERE id = p_session;
  SELECT array_agg(user_id ORDER BY joined_at), array_agg(display_name ORDER BY joined_at)
    INTO ids, nm FROM group_participants WHERE session_id = p_session;
  INSERT INTO next_sessions (from_session, created_by, members, names, plan, starts_at)
  VALUES (p_session, me, ids, nm, s.plan, p_starts_at)
  RETURNING id INTO out;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.schedule_next_session(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_next_session(uuid, timestamptz) TO authenticated;

-- My booked sessions, from 3 hours ago on (so one that started late still opens)
CREATE OR REPLACE FUNCTION public.my_next_sessions()
RETURNS TABLE (id uuid, starts_at timestamptz, names text[], plan jsonb, room_code text, created_by uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.starts_at, n.names, n.plan,
         CASE WHEN EXISTS (SELECT 1 FROM group_sessions g WHERE g.code = n.room_code AND g.status <> 'done') THEN n.room_code END,
         n.created_by
    FROM next_sessions n
   WHERE auth.uid() = ANY (n.members) AND n.starts_at > now() - interval '3 hours'
   ORDER BY n.starts_at;
$$;
REVOKE ALL ON FUNCTION public.my_next_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_next_sessions() TO authenticated;

-- The first to open it made a room: everyone else joins that one
CREATE OR REPLACE FUNCTION public.set_next_session_room(p_id uuid, p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur text;
BEGIN
  SELECT room_code INTO cur FROM next_sessions WHERE id = p_id AND auth.uid() = ANY (members) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  -- Someone else got there first and that room is still open: use theirs
  IF cur IS NOT NULL AND EXISTS (SELECT 1 FROM group_sessions WHERE code = cur AND status <> 'done') THEN RETURN cur; END IF;
  UPDATE next_sessions SET room_code = upper(p_code) WHERE id = p_id;
  RETURN upper(p_code);
END $$;
REVOKE ALL ON FUNCTION public.set_next_session_room(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_next_session_room(uuid, text) TO authenticated;

-- Can't make it: off the list (and when nobody's left, it's gone)
CREATE OR REPLACE FUNCTION public.leave_next_session(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE next_sessions SET members = array_remove(members, auth.uid()) WHERE id = p_id AND auth.uid() = ANY (members);
  DELETE FROM next_sessions WHERE id = p_id AND cardinality(members) = 0;
END $$;
REVOKE ALL ON FUNCTION public.leave_next_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_next_session(uuid) TO authenticated;

-- Every 5 minutes: an hour before, everyone booked gets a notification (pushed like the rest)
CREATE OR REPLACE FUNCTION public.remind_next_sessions()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n record;
  m uuid;
  sent int := 0;
BEGIN
  FOR n IN SELECT * FROM next_sessions
            WHERE reminded_at IS NULL AND starts_at <= now() + interval '1 hour' AND starts_at > now() - interval '30 minutes'
            FOR UPDATE SKIP LOCKED LOOP
    FOREACH m IN ARRAY n.members LOOP
      PERFORM notify(m, 'next_session', 'Training together in an hour',
        'With ' || coalesce((SELECT string_agg('@' || x, ', ') FROM unnest(n.names) x
                             WHERE x IS DISTINCT FROM (SELECT nickname FROM social_profiles WHERE user_id = m)), 'your friends')
          || '. Tap to open the room.',
        '/?open=next');
      sent := sent + 1;
    END LOOP;
    UPDATE next_sessions SET reminded_at = now() WHERE id = n.id;
  END LOOP;
  -- Old bookings go after a day
  DELETE FROM next_sessions WHERE starts_at < now() - interval '1 day';
  RETURN sent;
END $$;
REVOKE ALL ON FUNCTION public.remind_next_sessions() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('remind-next-sessions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-next-sessions');
SELECT cron.schedule('remind-next-sessions', '*/5 * * * *', $$SELECT public.remind_next_sessions()$$);
