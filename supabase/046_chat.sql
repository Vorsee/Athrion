-- 046: Chat between friends, with the safety Apple asks for in apps where people talk.
--   • only between accepted friends, never across a block, not for under-16s
--   • a word filter (chat_blocked_words) that refuses slurs and threats before they're saved
--   • report on every message: it's hidden at once and lands with the admins (user_reports)
--   • limits: 20 messages a minute, 500 a day; unsend your own
--   • a new message is pushed to the other person (send-reminders { chat }), switch notify_chat
-- Every read and write goes through the functions below. Needs 045. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz,
  hidden     boolean     NOT NULL DEFAULT false,      -- reported: off the thread until reviewed
  CHECK (sender <> recipient)
);
CREATE INDEX IF NOT EXISTS chat_messages_pair ON public.chat_messages (least(sender, recipient), greatest(sender, recipient), created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_unread ON public.chat_messages (recipient) WHERE read_at IS NULL;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_messages FROM anon, authenticated;
DROP POLICY IF EXISTS "admins read chat" ON public.chat_messages;
CREATE POLICY "admins read chat" ON public.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM app_admins a WHERE a.user_id = auth.uid()));
GRANT SELECT ON public.chat_messages TO authenticated;

ALTER TABLE public.user_reports ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;

-- Words and phrases that are never sent (whole words, any case). Admins can add rows.
CREATE TABLE IF NOT EXISTS public.chat_blocked_words (word text PRIMARY KEY);
ALTER TABLE public.chat_blocked_words ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_blocked_words FROM anon, authenticated;
INSERT INTO public.chat_blocked_words (word) VALUES
  ('nigger'), ('nigga'), ('faggot'), ('fag'), ('retard'), ('retarded'), ('tranny'), ('chink'), ('spic'), ('kike'),
  ('wetback'), ('coon'), ('paki'), ('dyke'), ('kill yourself'), ('kys'), ('go die'), ('i will kill you'), ('rape')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.chat_clean(p_body text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM chat_blocked_words w
    WHERE lower(regexp_replace(p_body, '[^[:alnum:] ]+', ' ', 'g')) ~ ('(^|[^[:alnum:]])' || w.word || '($|[^[:alnum:]])'));
$$;
REVOKE ALL ON FUNCTION public.chat_clean(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_message(p_nickname text, p_body text)
RETURNS TABLE (id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); them uuid; body text := btrim(coalesce(p_body, '')); m public.chat_messages;
BEGIN
  them := friend_by_nickname(p_nickname);
  IF is_minor(me) OR is_minor(them) THEN RAISE EXCEPTION 'Chat is for ages 16 and up' USING ERRCODE = 'P0001'; END IF;
  IF char_length(body) = 0 THEN RAISE EXCEPTION 'Write something first' USING ERRCODE = 'P0001'; END IF;
  IF char_length(body) > 1000 THEN RAISE EXCEPTION 'That message is too long (1,000 characters at most)' USING ERRCODE = 'P0001'; END IF;
  IF NOT chat_clean(body) THEN RAISE EXCEPTION 'That message can''t be sent: it breaks the community rules.' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM chat_messages c WHERE c.sender = me AND c.created_at > now() - interval '1 minute') >= 20
     OR (SELECT count(*) FROM chat_messages c WHERE c.sender = me AND c.created_at > now() - interval '1 day') >= 500 THEN
    RAISE EXCEPTION 'Slow down: that''s a lot of messages. Try again in a bit.' USING ERRCODE = 'P0429';
  END IF;
  INSERT INTO chat_messages (sender, recipient, body) VALUES (me, them, body) RETURNING * INTO m;
  RETURN QUERY SELECT m.id, m.created_at;
END $$;

-- The conversation with one friend, newest first, 50 at a time (p_before pages back)
CREATE OR REPLACE FUNCTION public.chat_thread(p_nickname text, p_before timestamptz DEFAULT NULL)
RETURNS TABLE (id uuid, mine boolean, body text, created_at timestamptz, read_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE me uuid := auth.uid(); them uuid := friend_by_nickname(p_nickname);
BEGIN
  RETURN QUERY
    SELECT c.id, c.sender = me, c.body, c.created_at, c.read_at FROM chat_messages c
    WHERE ((c.sender = me AND c.recipient = them) OR (c.sender = them AND c.recipient = me))
      AND NOT c.hidden AND (p_before IS NULL OR c.created_at < p_before)
    ORDER BY c.created_at DESC LIMIT 50;
END $$;

-- Every conversation: the friend, the last message and how many are unread
CREATE OR REPLACE FUNCTION public.chat_list()
RETURNS TABLE (friend text, last_body text, last_at timestamptz, last_mine boolean, unread int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (
    SELECT CASE WHEN c.sender = auth.uid() THEN c.recipient ELSE c.sender END AS other, c.*
    FROM chat_messages c WHERE auth.uid() IN (c.sender, c.recipient) AND NOT c.hidden
  ), last AS (
    SELECT DISTINCT ON (other) other, body, created_at, sender = auth.uid() AS mine FROM mine ORDER BY other, created_at DESC
  )
  SELECT sp.nickname, l.body, l.created_at, l.mine,
         (SELECT count(*)::int FROM mine m WHERE m.other = l.other AND m.recipient = auth.uid() AND m.read_at IS NULL)
  FROM last l JOIN social_profiles sp ON sp.user_id = l.other
  WHERE are_friends(auth.uid(), l.other) AND NOT blocked_between(auth.uid(), l.other)
  ORDER BY l.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.chat_read(p_nickname text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE them uuid := friend_by_nickname(p_nickname);
BEGIN
  UPDATE chat_messages SET read_at = now() WHERE recipient = auth.uid() AND sender = them AND read_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.chat_unread()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM chat_messages c
  WHERE c.recipient = auth.uid() AND c.read_at IS NULL AND NOT c.hidden AND NOT blocked_between(c.sender, auth.uid());
$$;

-- Unsend: your own messages only
CREATE OR REPLACE FUNCTION public.unsend_message(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM chat_messages WHERE id = p_id AND sender = auth.uid();
$$;

-- Report a message someone sent you: hidden at once, filed for the admins (report_user)
CREATE OR REPLACE FUNCTION public.report_message(p_id uuid, p_reason text, p_details text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.chat_messages;
BEGIN
  SELECT * INTO m FROM chat_messages WHERE id = p_id;
  IF m.id IS NULL OR m.recipient IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only report messages sent to you' USING ERRCODE = '42501'; END IF;
  UPDATE chat_messages SET hidden = true WHERE id = p_id;
  PERFORM report_user(m.sender, p_reason, left('Message: ' || m.body || CASE WHEN coalesce(btrim(p_details), '') = '' THEN '' ELSE E'\n' || p_details END, 500), NULL);
  UPDATE user_reports SET message_id = p_id
  WHERE id = (SELECT id FROM user_reports WHERE reporter = auth.uid() AND reported = m.sender ORDER BY created_at DESC LIMIT 1);
END $$;

-- A new message → a push to the other person (not the bell, so chats don't flood it)
CREATE OR REPLACE FUNCTION public.chat_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reminder_settings WHERE user_id = NEW.recipient AND notify_chat = false) THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://dbpxxhqcsfypxjcdalca.supabase.co/functions/v1/send-reminders',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')),
        body    := jsonb_build_object('chat', NEW.id));
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'chat_push: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chat_messages_push ON public.chat_messages;
CREATE TRIGGER chat_messages_push AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.chat_push();

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['send_message(text, text)', 'chat_thread(text, timestamptz)', 'chat_list()', 'chat_read(text)',
                           'chat_unread()', 'unsend_message(uuid)', 'report_message(uuid, text, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
