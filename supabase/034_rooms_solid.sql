-- 034: Train together rooms that end cleanly. A room ends 12 hours after its last activity
-- (a set, someone joining, the host editing or starting it), holds up to 6 people, the host
-- can remove someone (who can't come back to that room), and when the host leaves or finishes
-- while others are still in it, the earliest joiner becomes host. Apply after 033.
-- The app before this still works: it just never calls the new functions. Safe to re-run.

-- First run only: rooms from before this get their last set (or when they were made) as their
-- last activity, so old open rooms end at the next sweep instead of 12 hours from now
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'group_sessions' AND column_name = 'last_activity_at') THEN
    ALTER TABLE public.group_sessions ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();
    UPDATE public.group_sessions s
       SET last_activity_at = coalesce((SELECT max(g.logged_at) FROM public.group_sets g WHERE g.session_id = s.id), s.created_at, now());
  END IF;
END $$;
ALTER TABLE public.group_participants ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();

-- People the host removed from a room; read and written only by the functions below
CREATE TABLE IF NOT EXISTS public.group_removed (
  session_id uuid        NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  removed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
ALTER TABLE public.group_removed ENABLE ROW LEVEL SECURITY;

-- The guard from 006 stops anyone but the host changing host, code or status. The functions
-- here (and the hourly sweep, which has no user) change them on purpose: they set
-- athrion.room_admin for their own transaction first.
CREATE OR REPLACE FUNCTION public.guard_group_session_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('athrion.room_admin', true), '') = 'on' THEN RETURN NEW; END IF;
  IF auth.uid() IS DISTINCT FROM OLD.host_id AND (
       NEW.host_id    IS DISTINCT FROM OLD.host_id
    OR NEW.code       IS DISTINCT FROM OLD.code
    OR NEW.status     IS DISTINCT FROM OLD.status
    OR NEW.total_sets IS DISTINCT FROM OLD.total_sets
    OR NEW.rest_secs  IS DISTINCT FROM OLD.rest_secs
  ) THEN
    RAISE EXCEPTION 'Only the host can change room settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- Activity: the host editing or starting the room
CREATE OR REPLACE FUNCTION public.group_session_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.exercises IS DISTINCT FROM OLD.exercises THEN
    NEW.last_activity_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS group_session_touch ON public.group_sessions;
CREATE TRIGGER group_session_touch BEFORE UPDATE ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.group_session_touch();

-- Activity: a set or someone joining (at most once a minute, so sets don't flood realtime)
CREATE OR REPLACE FUNCTION public.group_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE group_sessions SET last_activity_at = now()
   WHERE id = NEW.session_id AND last_activity_at < now() - interval '1 minute';
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS group_sets_activity ON public.group_sets;
CREATE TRIGGER group_sets_activity AFTER INSERT ON public.group_sets
  FOR EACH ROW EXECUTE FUNCTION public.group_activity();
DROP TRIGGER IF EXISTS group_participants_activity ON public.group_participants;
CREATE TRIGGER group_participants_activity AFTER INSERT ON public.group_participants
  FOR EACH ROW EXECUTE FUNCTION public.group_activity();

-- Join by code: ended, removed and full rooms each say so
CREATE OR REPLACE FUNCTION public.join_group_session(p_code text, p_display_name text)
RETURNS public.group_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.group_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.group_sessions
   WHERE code = upper(trim(p_code)) AND status IN ('lobby', 'active')
   LIMIT 1
   FOR UPDATE; -- one join at a time per room, so the size check holds
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002';
  END IF;
  IF s.last_activity_at < now() - interval '12 hours' THEN
    PERFORM set_config('athrion.room_admin', 'on', true);
    UPDATE public.group_sessions SET status = 'done' WHERE id = s.id;
    RAISE EXCEPTION 'This room has ended' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (SELECT 1 FROM public.group_removed WHERE session_id = s.id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'The host removed you from this room' USING ERRCODE = 'P0005';
  END IF;
  IF EXISTS (SELECT 1 FROM public.group_participants WHERE session_id = s.id AND user_id = auth.uid()) THEN
    RETURN s; -- already in: coming back
  END IF;
  IF (SELECT count(*) FROM public.group_participants WHERE session_id = s.id) >= 6 THEN
    RAISE EXCEPTION 'This room is full' USING ERRCODE = 'P0004';
  END IF;
  INSERT INTO public.group_participants (session_id, user_id, display_name)
  VALUES (s.id, auth.uid(), left(coalesce(nullif(trim(p_display_name), ''), 'Athlete'), 40));
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.join_group_session(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_group_session(text, text) TO authenticated;

-- The host removes someone. Their sets stay with the room; they can't join it again.
CREATE OR REPLACE FUNCTION public.remove_room_member(p_session uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM group_sessions WHERE id = p_session AND host_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the host can remove people' USING ERRCODE = '42501';
  END IF;
  IF p_user = auth.uid() THEN
    RAISE EXCEPTION 'You can''t remove yourself' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM group_participants WHERE session_id = p_session AND user_id = p_user;
  INSERT INTO group_removed (session_id, user_id) VALUES (p_session, p_user) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.remove_room_member(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.remove_room_member(uuid, uuid) TO authenticated;

-- Leaving. p_keep_seat: finished the workout, so stay in the room to see the final standings
-- (only the host role moves on); otherwise (left from the lobby) the seat is given up too.
-- A host hands over to the earliest joiner still in the room; with no one left, the room ends.
-- Returns the new host, or null.
CREATE OR REPLACE FUNCTION public.leave_group_session(p_session uuid, p_keep_seat boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s group_sessions;
  next_host uuid;
BEGIN
  SELECT * INTO s FROM group_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF NOT p_keep_seat THEN
    DELETE FROM group_participants WHERE session_id = p_session AND user_id = auth.uid();
  END IF;
  IF s.host_id <> auth.uid() OR s.status = 'done' THEN RETURN NULL; END IF;

  SELECT user_id INTO next_host FROM group_participants
   WHERE session_id = p_session AND user_id <> auth.uid()
   ORDER BY joined_at, user_id LIMIT 1;
  PERFORM set_config('athrion.room_admin', 'on', true);
  IF next_host IS NULL THEN
    UPDATE group_sessions SET status = 'done' WHERE id = p_session;
  ELSE
    UPDATE group_sessions SET host_id = next_host WHERE id = p_session;
  END IF;
  RETURN next_host;
END $$;
REVOKE ALL ON FUNCTION public.leave_group_session(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_group_session(uuid, boolean) TO authenticated;

-- Hourly: rooms quiet for 12 hours end
CREATE OR REPLACE FUNCTION public.end_stale_rooms()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  PERFORM set_config('athrion.room_admin', 'on', true);
  UPDATE group_sessions SET status = 'done'
   WHERE status <> 'done' AND last_activity_at < now() - interval '12 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.end_stale_rooms() FROM public, anon, authenticated;

SELECT cron.unschedule('end-stale-rooms')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'end-stale-rooms');
SELECT cron.schedule('end-stale-rooms', '17 * * * *', $$SELECT public.end_stale_rooms()$$);
