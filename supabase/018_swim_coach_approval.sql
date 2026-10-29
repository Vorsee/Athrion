-- 018: only coaches an admin approved can start or rename a swim team. Swimmers apply from
-- the Swim tab with the same coach application as the shop (014, specialty "Swimming"), and
-- admins approve it in Coach applications as before. Apply after 017. Safe to re-run.

CREATE OR REPLACE FUNCTION public.save_swim_team(p_name text)
RETURNS TABLE (id uuid, name text, code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_approved_coach() THEN
    RAISE EXCEPTION 'Only approved coaches can run a team' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM social_profiles s WHERE s.user_id = me) THEN
    RAISE EXCEPTION 'Pick a nickname first' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO swim_teams (coach_id, name) VALUES (me, btrim(p_name))
  ON CONFLICT (coach_id) DO UPDATE SET name = btrim(p_name);
  RETURN QUERY SELECT t.id, t.name, t.code FROM swim_teams t WHERE t.coach_id = me;
END $$;

-- Swim coaches hear about the review on the Swim tab, shop coaches on their coach page
CREATE OR REPLACE FUNCTION public.coach_review_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE swim boolean := 'Swimming' = ANY (NEW.specialties);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' AND swim THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Start your swim team on the Swim tab.', '/?open=swim');
    ELSIF NEW.status = 'approved' THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Set up payouts and publish your first workout.', '/?open=coach');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM notify(NEW.user_id, 'coach', 'Your coach application', 'It wasn''t approved this time. Open it to see why and apply again.',
        CASE WHEN swim THEN '/?open=swim' ELSE '/?open=coach' END);
    END IF;
  END IF;
  RETURN NEW;
END $$;
