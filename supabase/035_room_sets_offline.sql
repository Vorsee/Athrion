-- 035: room sets logged without signal. The phone gives each set its own id (client_id) and
-- the time it was logged, keeps it until it's sent, and sends queued sets in order once back
-- online. A set sent twice (the answer was lost on the way back) is stored once.
-- Apply after 034. The app before this still works (it doesn't send client_id); the app after
-- it works before it too (it retries without client_id). Safe to re-run.

ALTER TABLE public.group_sets ADD COLUMN IF NOT EXISTS client_id uuid;

-- One row per set from a phone; rows without a client_id (older app) are never equal
CREATE UNIQUE INDEX IF NOT EXISTS group_sets_client_id ON public.group_sets (user_id, client_id);

-- A queued set keeps the time it was logged, but never later than now and never before the
-- room was made, so it can't land on another day's points
CREATE OR REPLACE FUNCTION public.group_set_time()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE made timestamptz;
BEGIN
  SELECT created_at INTO made FROM group_sessions WHERE id = NEW.session_id;
  NEW.logged_at := least(coalesce(NEW.logged_at, now()), now());
  IF made IS NOT NULL AND NEW.logged_at < made THEN NEW.logged_at := made; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS group_set_time ON public.group_sets;
CREATE TRIGGER group_set_time BEFORE INSERT ON public.group_sets
  FOR EACH ROW EXECUTE FUNCTION public.group_set_time();
