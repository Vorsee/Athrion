-- 032: accounts for 13 to 15 year olds, with a parent's approval by email. Under 13 can't sign up
-- (the age picker starts at 13). A teen gives a parent's email; the parent-consent Edge Function
-- (service key) sends a link, and the parent approves or declines on athrion.app/parent/<token>.
-- Until approved, the app shows only a waiting screen. Once approved, until the day they turn 16
-- (adult_on): off the Everyone board and its prize, no friends, no Train together rooms, and
-- no payments (the checkout APIs check is_minor too). Apply after 009 and 011. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.parental_consents (
  user_id        uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_email   text        NOT NULL CHECK (char_length(parent_email) BETWEEN 5 AND 254),
  child_age      int         NOT NULL CHECK (child_age BETWEEN 13 AND 15),
  adult_on       date        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  token_hash     text        UNIQUE,              -- sha-256 of the emailed link's token; cleared once decided
  sends          int         NOT NULL DEFAULT 0,  -- emails sent in the current 24 hours
  last_sent_at   timestamptz,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  legal_version  text                              -- the terms and privacy version the parent agreed to
);
ALTER TABLE public.parental_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own consent" ON public.parental_consents;
CREATE POLICY "read own consent" ON public.parental_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Written only by the parent-consent Edge Function (service key)

-- Under 16 by the age they gave, until the day they turn 16
CREATE OR REPLACE FUNCTION public.is_minor(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM parental_consents WHERE user_id = p_user AND current_date < adult_on);
$$;
REVOKE ALL ON FUNCTION public.is_minor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_minor(uuid) TO authenticated, service_role;

-- The teen's own view of it (the parent's email shown back, the status)
CREATE OR REPLACE FUNCTION public.my_parental_consent()
RETURNS TABLE (status text, parent_email text, child_age int, adult_on date, requested_at timestamptz, last_sent_at timestamptz, minor boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status, parent_email, child_age, adult_on, requested_at, last_sent_at, current_date < adult_on
  FROM parental_consents WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_parental_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_parental_consent() TO authenticated;

-- Off the Everyone board (and so out of the prize, which close_month gives by that board)
CREATE OR REPLACE FUNCTION public.minor_off_board()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_minor(NEW.user_id) THEN NEW.on_leaderboard := false; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS social_profiles_minor ON public.social_profiles;
CREATE TRIGGER social_profiles_minor BEFORE INSERT OR UPDATE ON public.social_profiles
  FOR EACH ROW EXECUTE FUNCTION public.minor_off_board();

CREATE OR REPLACE FUNCTION public.consent_off_board()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE social_profiles SET on_leaderboard = false WHERE user_id = NEW.user_id AND on_leaderboard;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS parental_consents_board ON public.parental_consents;
CREATE TRIGGER parental_consents_board AFTER INSERT ON public.parental_consents
  FOR EACH ROW EXECUTE FUNCTION public.consent_off_board();

-- No friends, either way
CREATE OR REPLACE FUNCTION public.minor_no_friends()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_minor(NEW.requester) OR is_minor(NEW.addressee) THEN
    RAISE EXCEPTION 'Friends open at 16 on ATHRION' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS friendships_minor ON public.friendships;
CREATE TRIGGER friendships_minor BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.minor_no_friends();

-- No Train together rooms: hosting or joining
CREATE OR REPLACE FUNCTION public.minor_no_rooms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_minor(CASE WHEN TG_TABLE_NAME = 'group_sessions' THEN NEW.host_id ELSE NEW.user_id END) THEN
    RAISE EXCEPTION 'Train together rooms open at 16 on ATHRION' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS group_sessions_minor ON public.group_sessions;
CREATE TRIGGER group_sessions_minor BEFORE INSERT ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.minor_no_rooms();
DROP TRIGGER IF EXISTS group_participants_minor ON public.group_participants;
CREATE TRIGGER group_participants_minor BEFORE INSERT ON public.group_participants
  FOR EACH ROW EXECUTE FUNCTION public.minor_no_rooms();
