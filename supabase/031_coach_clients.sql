-- 031: coaches and their clients. An approved coach shares an invite link (/trainer/<code>); a
-- person who opens it and agrees becomes their client (one trainer at a time). The coach then
-- sees that client's workouts, weigh-ins and goal, and assigns workouts that show on the
-- client's Train. Either side can end it. Every cross-user read goes through the functions
-- below, which check the link; the tables themselves only show a person their own rows.
-- Apply after 011 (notify) and 014 (coach_profiles). Safe to re-run.

-- ── The coach's invite code, kept apart from coach_profiles (whose columns are public) ──
CREATE TABLE IF NOT EXISTS public.coach_client_codes (
  coach_id   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code       text        NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 10),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_client_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coach reads own code" ON public.coach_client_codes;
CREATE POLICY "coach reads own code" ON public.coach_client_codes
  FOR SELECT TO authenticated USING (coach_id = auth.uid());

-- ── Who coaches whom: one trainer per client ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_clients (
  client_id  uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_id <> coach_id)
);
CREATE INDEX IF NOT EXISTS coach_clients_coach ON public.coach_clients (coach_id);
ALTER TABLE public.coach_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "either side reads the link" ON public.coach_clients;
CREATE POLICY "either side reads the link" ON public.coach_clients
  FOR SELECT TO authenticated USING (client_id = auth.uid() OR coach_id = auth.uid());

-- ── Workouts a coach assigns ────────────────────────────────────────────────
-- exercises: [{ name, sets, reps, restSeconds?, note? }], the plan-day shape Train starts
CREATE TABLE IF NOT EXISTS public.coach_assignments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 60),
  day        date,
  note       text        NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  exercises  jsonb       NOT NULL CHECK (jsonb_typeof(exercises) = 'array' AND jsonb_array_length(exercises) BETWEEN 1 AND 20),
  done_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_assignments_client ON public.coach_assignments (client_id, created_at DESC);
ALTER TABLE public.coach_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client and coach read" ON public.coach_assignments;
CREATE POLICY "client and coach read" ON public.coach_assignments
  FOR SELECT TO authenticated USING (client_id = auth.uid() OR coach_id = auth.uid());
DROP POLICY IF EXISTS "coach assigns to own clients" ON public.coach_assignments;
CREATE POLICY "coach assigns to own clients" ON public.coach_assignments
  FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid() AND public.is_approved_coach()
    AND EXISTS (SELECT 1 FROM coach_clients c WHERE c.client_id = coach_assignments.client_id AND c.coach_id = auth.uid()));
DROP POLICY IF EXISTS "coach deletes own" ON public.coach_assignments;
CREATE POLICY "coach deletes own" ON public.coach_assignments
  FOR DELETE TO authenticated USING (coach_id = auth.uid());

CREATE OR REPLACE FUNCTION public.coach_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT display_name FROM coach_profiles WHERE user_id = p_user), 'Your trainer');
$$;
REVOKE ALL ON FUNCTION public.coach_name(uuid) FROM PUBLIC, anon, authenticated;

-- A client's name as their coach sees it: the account name, else @nickname
CREATE OR REPLACE FUNCTION public.client_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), '@' || s.nickname, 'Client')
  FROM auth.users u LEFT JOIN social_profiles s ON s.user_id = u.id WHERE u.id = p_user;
$$;
REVOKE ALL ON FUNCTION public.client_name(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_my_client(p_client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM coach_clients WHERE client_id = p_client AND coach_id = auth.uid());
$$;

-- ── Coach ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_client_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  IF NOT is_approved_coach() THEN RAISE EXCEPTION 'Only approved coaches can invite clients'; END IF;
  INSERT INTO coach_client_codes (coach_id) VALUES (auth.uid()) ON CONFLICT (coach_id) DO NOTHING;
  SELECT code INTO c FROM coach_client_codes WHERE coach_id = auth.uid();
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION public.new_client_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  IF NOT is_approved_coach() THEN RAISE EXCEPTION 'Only approved coaches can invite clients'; END IF;
  INSERT INTO coach_client_codes (coach_id) VALUES (auth.uid())
  ON CONFLICT (coach_id) DO UPDATE SET code = substr(md5(gen_random_uuid()::text), 1, 10), created_at = now();
  SELECT code INTO c FROM coach_client_codes WHERE coach_id = auth.uid();
  RETURN c;
END;
$$;

-- Each client with what a coach checks at a glance
CREATE OR REPLACE FUNCTION public.my_clients()
RETURNS TABLE (client_id uuid, name text, nickname text, since timestamptz, goal text, target_weight_lb numeric,
  weight_lb numeric, weighed_on date, workouts_7d int, workouts_30d int, last_workout date, open_assignments int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.client_id, client_name(c.client_id), s.nickname, c.created_at,
         f.primary_goal, f.target_weight_lb,
         w.weight_lb, w.date,
         (SELECT count(DISTINCT l.date)::int FROM workout_logs l WHERE l.user_id = c.client_id AND l.date::date >= current_date - 6),
         (SELECT count(DISTINCT l.date)::int FROM workout_logs l WHERE l.user_id = c.client_id AND l.date::date >= current_date - 29),
         (SELECT max(l.date::date) FROM workout_logs l WHERE l.user_id = c.client_id),
         (SELECT count(*)::int FROM coach_assignments a WHERE a.client_id = c.client_id AND a.coach_id = auth.uid() AND a.done_at IS NULL)
  FROM coach_clients c
  LEFT JOIN social_profiles s ON s.user_id = c.client_id
  LEFT JOIN fitness_profiles f ON f.user_id = c.client_id
  LEFT JOIN LATERAL (
    SELECT b.weight_lb, b.date::date AS date FROM body_measurements b
    WHERE b.user_id = c.client_id AND b.weight_lb IS NOT NULL ORDER BY b.date DESC LIMIT 1
  ) w ON true
  WHERE c.coach_id = auth.uid()
  ORDER BY c.created_at;
$$;

CREATE OR REPLACE FUNCTION public.client_workouts(p_client uuid, p_limit int DEFAULT 30)
RETURNS TABLE (id uuid, date date, name text, duration text, volume numeric, sets jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.date::date, l.name, l.duration, l.volume::numeric, l.sets::jsonb
  FROM workout_logs l
  WHERE l.user_id = p_client AND is_my_client(p_client)
  ORDER BY l.date DESC, l.created_at DESC
  LIMIT least(greatest(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.client_weights(p_client uuid)
RETURNS TABLE (date date, weight_lb numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.date::date, b.weight_lb FROM body_measurements b
  WHERE b.user_id = p_client AND b.weight_lb IS NOT NULL AND b.date::date >= current_date - 180 AND is_my_client(p_client)
  ORDER BY b.date;
$$;

CREATE OR REPLACE FUNCTION public.remove_client(p_client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM coach_clients WHERE client_id = p_client AND coach_id = auth.uid();
  IF FOUND THEN
    DELETE FROM coach_assignments WHERE client_id = p_client AND coach_id = auth.uid() AND done_at IS NULL;
    PERFORM notify(p_client, 'client_removed', coach_name(auth.uid()) || ' ended your coaching',
      'They no longer see your training. Your workouts stay yours.', '/?open=workout');
  END IF;
END;
$$;

-- ── Client ──────────────────────────────────────────────────────────────────
-- The join screen: who the link belongs to (approved coaches only)
CREATE OR REPLACE FUNCTION public.trainer_by_code(p_code text)
RETURNS TABLE (coach_id uuid, display_name text, avatar_path text, specialties text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.display_name, p.avatar_path, p.specialties
  FROM coach_client_codes k JOIN coach_profiles p ON p.user_id = k.coach_id AND p.status = 'approved'
  WHERE k.code = lower(btrim(p_code));
$$;

CREATE OR REPLACE FUNCTION public.join_trainer(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  coach uuid;
  was uuid;
BEGIN
  SELECT k.coach_id INTO coach
  FROM coach_client_codes k JOIN coach_profiles p ON p.user_id = k.coach_id AND p.status = 'approved'
  WHERE k.code = lower(btrim(p_code));
  IF coach IS NULL THEN RAISE EXCEPTION 'This invite link no longer works. Ask your trainer for a new one.'; END IF;
  IF coach = auth.uid() THEN RAISE EXCEPTION 'This is your own invite link.'; END IF;
  SELECT coach_id INTO was FROM coach_clients WHERE client_id = auth.uid();
  IF was = coach THEN RETURN coach; END IF;
  IF was IS NOT NULL THEN
    DELETE FROM coach_clients WHERE client_id = auth.uid();
    DELETE FROM coach_assignments WHERE client_id = auth.uid() AND coach_id = was AND done_at IS NULL;
    PERFORM notify(was, 'client_left', client_name(auth.uid()) || ' moved to another trainer', '', '/?open=clients');
  END IF;
  INSERT INTO coach_clients (client_id, coach_id) VALUES (auth.uid(), coach);
  PERFORM notify(coach, 'client_joined', client_name(auth.uid()) || ' is now your client',
    'You can see their workouts, weigh-ins and goal, and assign workouts.', '/?open=clients');
  RETURN coach;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_trainer()
RETURNS TABLE (coach_id uuid, display_name text, avatar_path text, since timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.coach_id, coach_name(c.coach_id), p.avatar_path, c.created_at
  FROM coach_clients c LEFT JOIN coach_profiles p ON p.user_id = c.coach_id
  WHERE c.client_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.leave_trainer()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE was uuid;
BEGIN
  DELETE FROM coach_clients WHERE client_id = auth.uid() RETURNING coach_id INTO was;
  IF was IS NOT NULL THEN
    DELETE FROM coach_assignments WHERE client_id = auth.uid() AND coach_id = was AND done_at IS NULL;
    PERFORM notify(was, 'client_left', client_name(auth.uid()) || ' stopped coaching with you', '', '/?open=clients');
  END IF;
END;
$$;

-- The client finished an assigned workout
CREATE OR REPLACE FUNCTION public.finish_assignment(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.coach_assignments;
BEGIN
  UPDATE coach_assignments SET done_at = now() WHERE id = p_id AND client_id = auth.uid() AND done_at IS NULL RETURNING * INTO a;
  IF a.id IS NOT NULL THEN
    PERFORM notify(a.coach_id, 'assignment_done', client_name(auth.uid()) || ' finished ' || a.title, '', '/?open=clients', false);
  END IF;
END;
$$;

-- A new assignment tells the client
CREATE OR REPLACE FUNCTION public.coach_assignment_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM notify(NEW.client_id, 'assignment', coach_name(NEW.coach_id) || ' sent you a workout',
    NEW.title || CASE WHEN NEW.day IS NOT NULL THEN ' · for ' || to_char(NEW.day, 'Dy Mon FMDD') ELSE '' END, '/?open=workout');
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS coach_assignments_notify ON public.coach_assignments;
CREATE TRIGGER coach_assignments_notify AFTER INSERT ON public.coach_assignments
  FOR EACH ROW EXECUTE FUNCTION public.coach_assignment_notify();

REVOKE ALL ON FUNCTION public.is_my_client(uuid), public.my_client_code(), public.new_client_code(), public.my_clients(),
  public.client_workouts(uuid, int), public.client_weights(uuid), public.remove_client(uuid), public.trainer_by_code(text),
  public.join_trainer(text), public.my_trainer(), public.leave_trainer(), public.finish_assignment(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_client(uuid), public.my_client_code(), public.new_client_code(), public.my_clients(),
  public.client_workouts(uuid, int), public.client_weights(uuid), public.remove_client(uuid), public.trainer_by_code(text),
  public.join_trainer(text), public.my_trainer(), public.leave_trainer(), public.finish_assignment(uuid)
  TO authenticated;
