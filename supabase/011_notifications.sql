-- 011: notifications. Every event lands in an in-app inbox (the bell); the ones worth a push
-- are handed to the send-reminders Edge Function, which checks the person's switches.
-- Needs the 'reminders_cron_secret' Vault secret from 005. Safe to re-run.
--
--   friend_request, friend_accepted   instant, push (switch: notify_friends)
--   month_result                      on the 1st, push (notify_achievements)
--   badge, target                     the moment they're earned, in-app only (you're in the app)
--   recap                             Sunday, written by send-reminders, push (notify_recap)
-- Daily reminders and "your workout is still open" are push-only, also from send-reminders.

-- ── Inbox ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text        NOT NULL,
  title      text        NOT NULL,
  body       text        NOT NULL DEFAULT '',
  url        text        NOT NULL DEFAULT '/',
  push       boolean     NOT NULL DEFAULT true,
  read_at    timestamptz,
  pushed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created ON public.notifications (user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own notifications" ON public.notifications;
CREATE POLICY "read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "mark own notifications read" ON public.notifications;
CREATE POLICY "mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Only read_at may change from the app
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

-- The bell updates live
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ── Switches (push only; the inbox always gets friend and achievement events) ──
ALTER TABLE public.reminder_settings
  ADD COLUMN IF NOT EXISTS notify_friends      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_workout_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_achievements boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_recap        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_recap_date     date;

-- ── A workout left open: the app mirrors it here while it runs ──────────────
CREATE TABLE IF NOT EXISTS public.open_workouts (
  user_id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  sets_done        int         NOT NULL DEFAULT 0,
  exercises_done   int         NOT NULL DEFAULT 0,
  exercises_total  int         NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  notified_at      timestamptz
);
ALTER TABLE public.open_workouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own open_workouts" ON public.open_workouts;
CREATE POLICY "Users manage own open_workouts" ON public.open_workouts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Writing a notification (server only) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_push boolean DEFAULT true)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notifications (user_id, kind, title, body, url, push) VALUES (p_user, p_kind, p_title, p_body, p_url, p_push);
$$;
REVOKE ALL ON FUNCTION public.notify(uuid, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- New pushable notification → send-reminders delivers it. A failure here never blocks the insert.
CREATE OR REPLACE FUNCTION public.push_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.push THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://dbpxxhqcsfypxjcdalca.supabase.co/functions/v1/send-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')),
        body    := jsonb_build_object('deliver', NEW.id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'push_notification: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notifications_push ON public.notifications;
CREATE TRIGGER notifications_push AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.push_notification();

-- ── Friends ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.friendship_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT nickname INTO who FROM social_profiles WHERE user_id = NEW.requester;
    PERFORM notify(NEW.addressee, 'friend_request', 'New friend request',
      '@' || COALESCE(who, 'someone') || ' wants to be friends.', '/?open=friends');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT nickname INTO who FROM social_profiles WHERE user_id = NEW.addressee;
    PERFORM notify(NEW.requester, 'friend_accepted', '@' || COALESCE(who, 'someone') || ' accepted your request',
      'You''re friends now. See where you both stand this month.', '/?open=ranks');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS friendships_notify ON public.friendships;
CREATE TRIGGER friendships_notify AFTER INSERT OR UPDATE OF status ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.friendship_notify();

-- ── Month results (close_month inserts one row per person with points) ──────
CREATE OR REPLACE FUNCTION public.month_result_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mon text := to_char(NEW.month, 'FMMonth');
  medal text := CASE NEW.rank WHEN 1 THEN 'Gold' WHEN 2 THEN 'Silver' WHEN 3 THEN 'Bronze' END;
BEGIN
  IF medal IS NOT NULL THEN
    PERFORM notify(NEW.user_id, 'month_result', medal || ' medal for ' || mon,
      'You finished #' || NEW.rank || ' on Everyone with ' || NEW.points || ' pts. Your free Pro month is on its way.', '/?open=ranks');
  ELSIF NEW.workout_days >= 12 THEN
    PERFORM notify(NEW.user_id, 'month_result', mon || ': 12-day month',
      NEW.points || ' pts over ' || NEW.workout_days || ' workout days. Badge earned. New month starts now.', '/?open=ranks');
  ELSE
    PERFORM notify(NEW.user_id, 'month_result', mon || ' is done',
      'You scored ' || NEW.points || ' pts over ' || NEW.workout_days || ' workout day' ||
      CASE WHEN NEW.workout_days = 1 THEN '' ELSE 's' END || '. Points reset today.', '/?open=ranks');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS monthly_scores_notify ON public.monthly_scores;
CREATE TRIGGER monthly_scores_notify AFTER INSERT ON public.monthly_scores
  FOR EACH ROW EXECUTE FUNCTION public.month_result_notify();

-- ── Badges (names match BADGES in src/lib/badges.js; a test keeps them in step) ──
CREATE OR REPLACE FUNCTION public.badge_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE badge text := CASE NEW.badge_id
  WHEN 'first_workout' THEN 'First Rep'
  WHEN 'workouts_10'   THEN 'Getting Serious'
  WHEN 'workouts_50'   THEN 'Half Century'
  WHEN 'workouts_100'  THEN 'Centurion'
  WHEN 'streak_4'      THEN 'On Fire'
  WHEN 'streak_12'     THEN 'Unstoppable'
  WHEN 'first_pr'      THEN 'New Best'
  WHEN 'prs_25'        THEN 'PR Machine'
  WHEN 'volume_10k'    THEN 'Ten Tonner'
  WHEN 'early_bird'    THEN 'Early Bird'
  WHEN 'night_owl'     THEN 'Night Owl'
  WHEN 'weigh_in_10'   THEN 'Data Driven'
  WHEN 'first_photo'   THEN 'Snapshot'
  ELSE 'New badge' END;
BEGIN
  PERFORM notify(NEW.user_id, 'badge', 'Badge earned: ' || badge, 'See all your badges on Progress.', '/?open=progress', false);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_badges_notify ON public.user_badges;
CREATE TRIGGER user_badges_notify AFTER INSERT ON public.user_badges
  FOR EACH ROW EXECUTE FUNCTION public.badge_notify();

-- ── The 12th workout day of a month ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.target_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m0 date := date_trunc('month', NEW.date::date)::date;
  days int;
BEGIN
  IF jsonb_typeof(NEW.sets::jsonb) <> 'array' OR jsonb_array_length(NEW.sets::jsonb) < 3 THEN RETURN NEW; END IF;
  SELECT count(DISTINCT w.date::date) INTO days FROM workout_logs w
   WHERE w.user_id = NEW.user_id AND w.date::date >= m0 AND w.date::date < (m0 + interval '1 month')::date
     AND jsonb_typeof(w.sets::jsonb) = 'array' AND jsonb_array_length(w.sets::jsonb) >= 3;
  IF days >= 12 AND NOT EXISTS (
    SELECT 1 FROM notifications n WHERE n.user_id = NEW.user_id AND n.kind = 'target' AND n.created_at >= m0
  ) THEN
    PERFORM notify(NEW.user_id, 'target', to_char(m0, 'FMMonth') || ' badge earned',
      '12 workout days this month. Every extra day still adds points.', '/?open=ranks', false);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workout_logs_target_notify ON public.workout_logs;
CREATE TRIGGER workout_logs_target_notify AFTER INSERT ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.target_notify();

-- ── For send-reminders: one person's month so far and place among friends ──
CREATE OR REPLACE FUNCTION public.points_summary(p_user uuid)
RETURNS TABLE (points int, workout_days int, friends_place int, friends int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pts AS (SELECT * FROM month_points(current_date)),
  circle AS (
    SELECT p_user AS uid
    UNION SELECT CASE WHEN f.requester = p_user THEN f.addressee ELSE f.requester END
      FROM friendships f WHERE f.status = 'accepted' AND p_user IN (f.requester, f.addressee)
  ),
  ranked AS (
    SELECT c.uid, COALESCE(t.points, 0) AS pts, COALESCE(t.workout_days, 0) AS days,
           rank() OVER (ORDER BY COALESCE(t.points, 0) DESC)::int AS place
    FROM circle c LEFT JOIN pts t ON t.user_id = c.uid
  )
  SELECT r.pts, r.days, r.place, (SELECT count(*)::int - 1 FROM circle)
  FROM ranked r WHERE r.uid = p_user
$$;
REVOKE ALL ON FUNCTION public.points_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.points_summary(uuid) TO service_role;

-- ── Every 15 minutes: "your workout is still open" ─────────────────────────
SELECT cron.schedule(
  'open-workouts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dbpxxhqcsfypxjcdalca.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')),
    body    := '{"open": true}'::jsonb
  );
  $$
);
