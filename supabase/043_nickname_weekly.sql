-- 043: A nickname can be changed once a week. The first nickname (set-up) is free; after that
-- each change starts a 7-day wait. Kept on the row (nickname_changed_at) and enforced here, so
-- the web and the iPhone app follow the same rule. Safe to re-run.

ALTER TABLE public.social_profiles ADD COLUMN IF NOT EXISTS nickname_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.nickname_once_a_week()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.nickname_changed_at := NULL;      -- picking the first one doesn't start the wait
    RETURN NEW;
  END IF;
  IF NEW.nickname IS DISTINCT FROM OLD.nickname THEN
    IF OLD.nickname_changed_at IS NOT NULL AND OLD.nickname_changed_at > now() - interval '7 days'
       AND coalesce(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'You can change your nickname once a week. Next change from %.',
        to_char(OLD.nickname_changed_at + interval '7 days', 'FMDay FMDD FMMonth') USING ERRCODE = 'P0001';
    END IF;
    NEW.nickname_changed_at := now();
  ELSE
    NEW.nickname_changed_at := OLD.nickname_changed_at;   -- the app can't reset the wait
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS social_profiles_nickname_week ON public.social_profiles;
CREATE TRIGGER social_profiles_nickname_week BEFORE INSERT OR UPDATE ON public.social_profiles
  FOR EACH ROW EXECUTE FUNCTION public.nickname_once_a_week();
