-- ── Group Workout Tables ──────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor → New query

-- Workout rooms
CREATE TABLE IF NOT EXISTS public.group_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text        NOT NULL UNIQUE,
  exercises   text[]      NOT NULL DEFAULT '{}',
  total_sets  int         NOT NULL DEFAULT 3,
  rest_secs   int         NOT NULL DEFAULT 60,
  status      text        NOT NULL DEFAULT 'lobby'
                          CHECK (status IN ('lobby','active','done')),
  created_at  timestamptz DEFAULT now()
);

-- Who is in each room
CREATE TABLE IF NOT EXISTS public.group_participants (
  session_id   uuid  NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  user_id      uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text  NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

-- Every set logged by every participant
CREATE TABLE IF NOT EXISTS public.group_sets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id),
  display_name text        NOT NULL,
  exercise     text        NOT NULL,
  set_num      int         NOT NULL,
  weight       numeric     NOT NULL,
  reps         int         NOT NULL,
  logged_at    timestamptz DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.group_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_sets         ENABLE ROW LEVEL SECURITY;

-- group_sessions: any auth user can read (code is the secret gate)
CREATE POLICY "auth users can read sessions"
  ON public.group_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth users can create sessions"
  ON public.group_sessions FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "host can update session"
  ON public.group_sessions FOR UPDATE
  USING (auth.uid() = host_id);

-- group_participants: join yourself; read if you are a participant
CREATE POLICY "users can join"
  ON public.group_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Membership check that bypasses RLS, so policies on group_participants don't recurse
CREATE OR REPLACE FUNCTION public.is_group_participant(p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_participants WHERE session_id = p_session_id AND user_id = auth.uid());
$$;

CREATE POLICY "participants can read room members"
  ON public.group_participants FOR SELECT
  USING (
    user_id = auth.uid() OR public.is_group_participant(session_id)
  );

-- group_sets: log your own; read all sets in sessions you're part of
CREATE POLICY "users can log own sets"
  ON public.group_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "participants can read all sets"
  ON public.group_sets FOR SELECT
  USING (public.is_group_participant(session_id));

-- ── Enable Realtime ───────────────────────────────────────────────────────────
-- In Supabase dashboard: Database → Replication → enable realtime for:
--   public.group_sessions
--   public.group_participants
--   public.group_sets
