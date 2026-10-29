-- 019: notifications for swim teams and coach applications. Apply after 018. Safe to re-run.
--
--   team_created                    the coach, when their team is made (in-app only)
--   team_request                    the coach, when someone asks to join from search (push)
--   team_joined                     the coach when someone joins with the link (push);
--                                   the swimmer too, in-app only
--   team_accepted, team_declined    the swimmer, when the coach answers their request (push)
--   team_removed                    the swimmer, when the coach takes them off the team (push)
--   team_left                       the coach, when a swimmer leaves (push)
--   coach_application               every admin, when someone applies or applies again (push)
-- Push switch for the team_* kinds: reminder_settings.notify_team. Links open Swim → Team
-- (/?open=team); admins' coach_application links open it too for swim coaches.

ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS notify_team boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.swim_nick(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce('@' || (SELECT nickname FROM social_profiles WHERE user_id = p_user), 'A swimmer');
$$;
REVOKE ALL ON FUNCTION public.swim_nick(uuid) FROM PUBLIC, anon, authenticated;

-- ── Team made ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.swim_team_created_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM notify(NEW.coach_id, 'team_created', NEW.name || ' is ready',
    'Invite your swimmers with your team link from Swim, Team.', '/?open=team', false);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS swim_teams_notify ON public.swim_teams;
CREATE TRIGGER swim_teams_notify AFTER INSERT ON public.swim_teams
  FOR EACH ROW EXECUTE FUNCTION public.swim_team_created_notify();

-- ── Joining, answers, leaving ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.swim_member_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.swim_teams;
  who uuid := auth.uid();
BEGIN
  SELECT * INTO t FROM swim_teams WHERE id = coalesce(NEW.team_id, OLD.team_id);
  IF t.id IS NULL THEN RETURN NULL; END IF; -- the team itself is being deleted

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      PERFORM notify(t.coach_id, 'team_request', swim_nick(NEW.user_id) || ' wants to join',
        'Accept or decline on Swim, Team. ' || t.name || '.', '/?open=team');
    ELSE
      PERFORM notify(t.coach_id, 'team_joined', swim_nick(NEW.user_id) || ' joined ' || t.name,
        'They joined with your invite link. Their swims show on their page.', '/?open=team');
      PERFORM notify(NEW.user_id, 'team_joined', 'You''re on ' || t.name,
        'Your coach ' || swim_nick(t.coach_id) || ' now sees your photo and swims.', '/?open=team', false);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status = 'active' THEN
      -- Accepted by the coach, or the swimmer used the link after asking
      IF who = t.coach_id THEN
        PERFORM notify(NEW.user_id, 'team_accepted', t.name || ' accepted you',
          'Your coach ' || swim_nick(t.coach_id) || ' now sees your photo and swims.', '/?open=team');
      ELSE
        PERFORM notify(t.coach_id, 'team_joined', swim_nick(NEW.user_id) || ' joined ' || t.name,
          'They joined with your invite link. Their swims show on their page.', '/?open=team');
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF who = t.coach_id THEN
      IF OLD.status = 'pending' THEN
        PERFORM notify(OLD.user_id, 'team_declined', t.name || ' didn''t accept your request',
          'You can ask another team, or use an invite link from your coach.', '/?open=team');
      ELSE
        PERFORM notify(OLD.user_id, 'team_removed', 'You''re no longer on ' || t.name,
          'Your coach took you off the team. Your swims stay yours.', '/?open=team');
      END IF;
    ELSIF who = OLD.user_id AND OLD.status = 'active' THEN
      PERFORM notify(t.coach_id, 'team_left', swim_nick(OLD.user_id) || ' left ' || t.name, '', '/?open=team');
    END IF;
    -- No one signed in (account deleted by the server): nothing to say
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS swim_team_members_notify ON public.swim_team_members;
CREATE TRIGGER swim_team_members_notify AFTER INSERT OR UPDATE OF status OR DELETE ON public.swim_team_members
  FOR EACH ROW EXECUTE FUNCTION public.swim_member_notify();

-- ── Coach applications reach every admin ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.coach_application_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  swim boolean := 'Swimming' = ANY (NEW.specialties);
  a record;
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN
    FOR a IN SELECT user_id FROM app_admins LOOP
      PERFORM notify(a.user_id, 'coach_application', 'New coach application',
        NEW.display_name || CASE WHEN swim THEN ' wants to coach a swim team.' ELSE ' wants to sell workouts.' END,
        CASE WHEN swim THEN '/?open=team' ELSE '/?open=coach' END);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS coach_profiles_application_notify ON public.coach_profiles;
CREATE TRIGGER coach_profiles_application_notify AFTER INSERT OR UPDATE OF status ON public.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.coach_application_notify();

-- Review results for swim coaches open Swim → Team (018 sent them to the My swims side)
CREATE OR REPLACE FUNCTION public.coach_review_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE swim boolean := 'Swimming' = ANY (NEW.specialties);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' AND swim THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Start your swim team on the Swim tab.', '/?open=team');
    ELSIF NEW.status = 'approved' THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Set up payouts and publish your first workout.', '/?open=coach');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM notify(NEW.user_id, 'coach', 'Your coach application', 'It wasn''t approved this time. Open it to see why and apply again.',
        CASE WHEN swim THEN '/?open=team' ELSE '/?open=coach' END);
    END IF;
  END IF;
  RETURN NEW;
END $$;
