-- ── Teams ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  invite_code  text UNIQUE NOT NULL DEFAULT upper(substring(encode(gen_random_bytes(3), 'hex'), 1, 6)),
  created_by   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ── Team Members ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_members (
  team_id      uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name text NOT NULL,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at    timestamptz DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

-- ── Link group_sessions to teams ──────────────────────────────────────────────

ALTER TABLE group_sessions
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;

-- ── Per-session ready status ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_ready (
  session_id   uuid REFERENCES group_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name text NOT NULL,
  is_ready     boolean NOT NULL DEFAULT false,
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_ready ENABLE ROW LEVEL SECURITY;

-- teams: members can read their own teams
CREATE POLICY "teams_select" ON teams FOR SELECT
  USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "teams_insert" ON teams FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- team_members: visible to fellow members
CREATE POLICY "team_members_select" ON team_members FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "team_members_insert" ON team_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "team_members_delete" ON team_members FOR DELETE
  USING (user_id = auth.uid());

-- team_ready: visible to team members of the session
CREATE POLICY "team_ready_select" ON team_ready FOR SELECT
  USING (
    session_id IN (
      SELECT gs.id FROM group_sessions gs
      JOIN team_members tm ON tm.team_id = gs.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "team_ready_upsert" ON team_ready FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Join-by-code RPC (SECURITY DEFINER bypasses RLS for the lookup) ───────────

CREATE OR REPLACE FUNCTION join_team_by_code(p_code text, p_display_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_team_id   uuid;
  v_team_name text;
BEGIN
  SELECT id, name INTO v_team_id, v_team_name
  FROM teams WHERE invite_code = upper(p_code);

  IF v_team_id IS NULL THEN
    RETURN '{"error":"Team not found — check the code and try again"}'::jsonb;
  END IF;

  IF EXISTS (SELECT 1 FROM team_members WHERE team_id = v_team_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('already_member', true, 'team_id', v_team_id, 'team_name', v_team_name);
  END IF;

  INSERT INTO team_members (team_id, user_id, display_name, role)
  VALUES (v_team_id, auth.uid(), p_display_name, 'member');

  RETURN jsonb_build_object('success', true, 'team_id', v_team_id, 'team_name', v_team_name);
END;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE team_ready;
