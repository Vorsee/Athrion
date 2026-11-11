-- 033: fix 032's room check. minor_no_rooms() read NEW.host_id or NEW.user_id in one CASE, but
-- PL/pgSQL resolves both fields on every row, so group_sessions (no user_id) and
-- group_participants (no host_id) both failed: nobody could create or join a room.
-- One function per table now. Safe to re-run.

CREATE OR REPLACE FUNCTION public.minor_no_host()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_minor(NEW.host_id) THEN
    RAISE EXCEPTION 'Train together rooms open at 16 on ATHRION' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.minor_no_join()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_minor(NEW.user_id) THEN
    RAISE EXCEPTION 'Train together rooms open at 16 on ATHRION' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_sessions_minor ON public.group_sessions;
CREATE TRIGGER group_sessions_minor BEFORE INSERT ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.minor_no_host();
DROP TRIGGER IF EXISTS group_participants_minor ON public.group_participants;
CREATE TRIGGER group_participants_minor BEFORE INSERT ON public.group_participants
  FOR EACH ROW EXECUTE FUNCTION public.minor_no_join();

DROP FUNCTION IF EXISTS public.minor_no_rooms();
