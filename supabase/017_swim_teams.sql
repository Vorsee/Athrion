-- 017: the Swim tab. Swims get a stroke, swimmers a photo, and anyone can start a swim team
-- as its coach. Swimmers join with the coach's invite link (athrion.app/swim/<code>, straight in)
-- or by finding the team in search (a request the coach accepts). The coach sees each
-- swimmer's photo and swims; nothing else of theirs. Apply before the app version with the
-- Swim tab. Safe to re-run.

-- ── Stroke per swim (older swims keep none) ────────────────────────────────
ALTER TABLE public.cardio_logs ADD COLUMN IF NOT EXISTS stroke text;
ALTER TABLE public.cardio_logs DROP CONSTRAINT IF EXISTS cardio_logs_stroke_check;
ALTER TABLE public.cardio_logs ADD CONSTRAINT cardio_logs_stroke_check
  CHECK (stroke IS NULL OR (kind = 'swim' AND stroke IN ('free', 'back', 'breast', 'fly', 'im')));

-- ── Swimmer photo ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swim_profiles (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_path text        CHECK (char_length(photo_path) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.swim_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own swim profile" ON public.swim_profiles;
CREATE POLICY "own swim profile" ON public.swim_profiles
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Teams: one per coach. Read and written only through the functions below ──
CREATE TABLE IF NOT EXISTS public.swim_teams (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 40),
  code       text        NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 10),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.swim_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coach sees own team" ON public.swim_teams;
CREATE POLICY "coach sees own team" ON public.swim_teams
  FOR SELECT TO authenticated USING (coach_id = auth.uid());

-- One team per swimmer: a request (pending) or a place on it (active)
CREATE TABLE IF NOT EXISTS public.swim_team_members (
  team_id    uuid        NOT NULL REFERENCES public.swim_teams(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE public.swim_team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "see own membership" ON public.swim_team_members;
CREATE POLICY "see own membership" ON public.swim_team_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── Coach ──────────────────────────────────────────────────────────────────
-- Start a team, or rename yours. Returns { id, name, code }.
CREATE OR REPLACE FUNCTION public.save_swim_team(p_name text)
RETURNS TABLE (id uuid, name text, code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM social_profiles s WHERE s.user_id = me) THEN
    RAISE EXCEPTION 'Pick a nickname first' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO swim_teams (coach_id, name) VALUES (me, btrim(p_name))
  ON CONFLICT (coach_id) DO UPDATE SET name = btrim(p_name);
  RETURN QUERY SELECT t.id, t.name, t.code FROM swim_teams t WHERE t.coach_id = me;
END $$;

-- The caller's own team, as its coach (no rows when they don't coach one)
CREATE OR REPLACE FUNCTION public.my_coached_team()
RETURNS TABLE (id uuid, name text, code text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.code FROM swim_teams t WHERE t.coach_id = auth.uid();
$$;

-- A fresh invite code; the old link stops working
CREATE OR REPLACE FUNCTION public.new_swim_team_code()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE swim_teams SET code = substr(md5(gen_random_uuid()::text), 1, 10)
  WHERE coach_id = auth.uid() RETURNING code;
$$;

-- Everyone on the coach's team and everyone asking to join, with what the roster shows
CREATE OR REPLACE FUNCTION public.my_swim_roster()
RETURNS TABLE (user_id uuid, nickname text, photo_path text, status text, joined_at timestamptz,
               last_swim date, swims_30d int, metres_30d numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, s.nickname, p.photo_path, m.status, m.created_at,
         (SELECT max(c.date) FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim'),
         (SELECT count(*)::int FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim' AND c.date > current_date - 30),
         (SELECT coalesce(sum(c.distance_m), 0) FROM cardio_logs c WHERE c.user_id = m.user_id AND c.kind = 'swim' AND c.date > current_date - 30)
  FROM swim_teams t
  JOIN swim_team_members m ON m.team_id = t.id
  LEFT JOIN social_profiles s ON s.user_id = m.user_id
  LEFT JOIN swim_profiles p ON p.user_id = m.user_id
  WHERE t.coach_id = auth.uid()
  ORDER BY m.status DESC, s.nickname;
$$;

-- One swimmer's swims, for their coach (active members only)
CREATE OR REPLACE FUNCTION public.swimmer_swims(p_user uuid)
RETURNS SETOF public.cardio_logs LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.* FROM cardio_logs c
  WHERE c.user_id = p_user AND c.kind = 'swim'
    AND EXISTS (SELECT 1 FROM swim_team_members m JOIN swim_teams t ON t.id = m.team_id
                WHERE m.user_id = p_user AND m.status = 'active' AND t.coach_id = auth.uid())
  ORDER BY c.date DESC, c.created_at DESC
  LIMIT 500;
$$;

-- Accept or decline a request; removing an active swimmer uses the same call with false
CREATE OR REPLACE FUNCTION public.respond_swim_request(p_user uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE team uuid;
BEGIN
  SELECT id INTO team FROM swim_teams WHERE coach_id = auth.uid();
  IF team IS NULL THEN RAISE EXCEPTION 'You don''t coach a team' USING ERRCODE = '42501'; END IF;
  IF p_accept THEN
    UPDATE swim_team_members SET status = 'active' WHERE team_id = team AND user_id = p_user;
  ELSE
    DELETE FROM swim_team_members WHERE team_id = team AND user_id = p_user;
  END IF;
END $$;

-- ── Swimmer ────────────────────────────────────────────────────────────────
-- Teams by name or coach nickname, for the search bar
CREATE OR REPLACE FUNCTION public.search_swim_teams(p_q text)
RETURNS TABLE (id uuid, name text, coach_nickname text, swimmers int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, s.nickname,
         (SELECT count(*)::int FROM swim_team_members m WHERE m.team_id = t.id AND m.status = 'active')
  FROM swim_teams t LEFT JOIN social_profiles s ON s.user_id = t.coach_id
  WHERE char_length(btrim(p_q)) >= 2 AND t.coach_id <> auth.uid()
    AND (t.name ILIKE '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
         OR s.nickname ILIKE replace(replace(replace(lower(ltrim(btrim(p_q), '@')), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ORDER BY t.name
  LIMIT 20;
$$;

-- What an invite link points to, before joining
CREATE OR REPLACE FUNCTION public.swim_team_by_code(p_code text)
RETURNS TABLE (id uuid, name text, coach_nickname text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, s.nickname FROM swim_teams t LEFT JOIN social_profiles s ON s.user_id = t.coach_id
  WHERE t.code = lower(btrim(p_code));
$$;

-- Join: with the invite code straight onto the team, from search as a request.
-- Returns 'active' or 'pending'. Asking a new team replaces an open request.
CREATE OR REPLACE FUNCTION public.join_swim_team(p_team uuid DEFAULT NULL, p_code text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  t public.swim_teams;
  cur public.swim_team_members;
  st text := CASE WHEN p_code IS NULL THEN 'pending' ELSE 'active' END;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_code IS NOT NULL THEN SELECT * INTO t FROM swim_teams WHERE code = lower(btrim(p_code));
  ELSE SELECT * INTO t FROM swim_teams WHERE id = p_team; END IF;
  IF t.id IS NULL THEN RAISE EXCEPTION 'That team doesn''t exist any more' USING ERRCODE = 'P0002'; END IF;
  IF t.coach_id = me THEN RAISE EXCEPTION 'That''s your own team' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO cur FROM swim_team_members WHERE user_id = me;
  IF FOUND THEN
    IF cur.team_id = t.id THEN
      IF st = 'active' AND cur.status = 'pending' THEN
        UPDATE swim_team_members SET status = 'active' WHERE user_id = me;
        RETURN 'active';
      END IF;
      RETURN cur.status;
    END IF;
    IF cur.status = 'active' THEN
      RAISE EXCEPTION 'Leave your team first' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM swim_team_members WHERE user_id = me;
  END IF;
  INSERT INTO swim_team_members (team_id, user_id, status) VALUES (t.id, me, st);
  RETURN st;
END $$;

-- The caller's team as a swimmer (no rows when they're on none)
CREATE OR REPLACE FUNCTION public.my_swim_team()
RETURNS TABLE (id uuid, name text, coach_nickname text, coach_id uuid, coach_photo text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, s.nickname, t.coach_id, p.photo_path, m.status
  FROM swim_team_members m JOIN swim_teams t ON t.id = m.team_id
  LEFT JOIN social_profiles s ON s.user_id = t.coach_id
  LEFT JOIN swim_profiles p ON p.user_id = t.coach_id
  WHERE m.user_id = auth.uid();
$$;

-- Leave the team, or take back a request
CREATE OR REPLACE FUNCTION public.leave_swim_team()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM swim_team_members WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.save_swim_team(text), public.my_coached_team(), public.new_swim_team_code(), public.my_swim_roster(),
  public.swimmer_swims(uuid), public.respond_swim_request(uuid, boolean), public.search_swim_teams(text),
  public.swim_team_by_code(text), public.join_swim_team(uuid, text), public.my_swim_team(), public.leave_swim_team()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_swim_team(text), public.my_coached_team(), public.new_swim_team_code(), public.my_swim_roster(),
  public.swimmer_swims(uuid), public.respond_swim_request(uuid, boolean), public.search_swim_teams(text),
  public.swim_team_by_code(text), public.join_swim_team(uuid, text), public.my_swim_team(), public.leave_swim_team()
  TO authenticated;

-- ── Storage: private photos at <user id>/photo-<time>.<ext> ────────────────
-- Seen by the swimmer, their coach (also while the request is open), and a swimmer sees their coach's
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('swimmer-photos', 'swimmer-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "swimmer photos: read" ON storage.objects;
CREATE POLICY "swimmer photos: read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'swimmer-photos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.swim_team_members m JOIN public.swim_teams t ON t.id = m.team_id
               WHERE t.coach_id = auth.uid() AND m.user_id::text = (storage.foldername(name))[1])
    OR EXISTS (SELECT 1 FROM public.swim_team_members m JOIN public.swim_teams t ON t.id = m.team_id
               WHERE m.user_id = auth.uid() AND t.coach_id::text = (storage.foldername(name))[1])
  ));
DROP POLICY IF EXISTS "swimmer photos: upload own" ON storage.objects;
CREATE POLICY "swimmer photos: upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'swimmer-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "swimmer photos: delete own" ON storage.objects;
CREATE POLICY "swimmer photos: delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'swimmer-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
