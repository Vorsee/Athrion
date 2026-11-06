-- 030: a coach can delete their swim team. Every swimmer on it is told first (the member
-- trigger can't, since the team is gone by the time the cascade removes them), then the team
-- goes, and with it its members and practices (ON DELETE CASCADE). Swims stay with each swimmer;
-- the coach's approval stays, so they can start a new team. Apply after 017 and 025. Safe to re-run.
CREATE OR REPLACE FUNCTION public.delete_swim_team()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.swim_teams;
  m record;
BEGIN
  SELECT * INTO t FROM swim_teams WHERE coach_id = auth.uid();
  IF t.id IS NULL THEN RETURN; END IF;
  FOR m IN SELECT user_id, status FROM swim_team_members WHERE team_id = t.id LOOP
    IF m.status = 'active' THEN
      PERFORM notify(m.user_id, 'team_removed', t.name || ' was closed',
        'Your coach deleted the team. Your swims stay yours.', '/?open=team');
    ELSE
      PERFORM notify(m.user_id, 'team_declined', t.name || ' was closed',
        'Your request was cancelled. You can ask another team.', '/?open=team', false);
    END IF;
  END LOOP;
  DELETE FROM swim_teams WHERE id = t.id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_swim_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_swim_team() TO authenticated;
