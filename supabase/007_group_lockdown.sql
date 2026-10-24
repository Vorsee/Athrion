-- Apply after the app version that joins rooms with join_group_session() is live.
-- Safe to re-run.

-- ── group_sessions: visible to the host and members only ─────────────────────
DROP POLICY IF EXISTS "auth users can read sessions" ON public.group_sessions;
CREATE POLICY "members can read sessions" ON public.group_sessions
  FOR SELECT USING (auth.uid() = host_id OR public.is_group_participant(id));

-- ── group_participants: hosts add themselves; everyone else joins by code ────
DROP POLICY IF EXISTS "users can join" ON public.group_participants;
CREATE POLICY "host can join own room" ON public.group_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.group_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
  );
