-- 041: Push notifications in the iPhone app (Apple Push Notification service).
-- The app registers its device token here after sign-in; send-reminders pushes every
-- notification it already pushes to browsers to these phones too (friends, results, recap,
-- team, your trainer, next sessions). Daily reminders and "your workout is still open" are not
-- sent to phones: the app schedules those itself. A token belongs to one account at a time:
-- signing in with another account on the same phone moves it. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.apns_tokens (
  token       text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text        NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
  bundle_id   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apns_tokens_user ON public.apns_tokens (user_id);
ALTER TABLE public.apns_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: the app goes through the two functions below, the server uses the service role
REVOKE ALL ON public.apns_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_apns_token(p_token text, p_environment text, p_bundle_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_token !~ '^[0-9a-f]{64,200}$' THEN RAISE EXCEPTION 'Bad token'; END IF;
  IF p_environment NOT IN ('sandbox', 'production') THEN RAISE EXCEPTION 'Bad environment'; END IF;
  INSERT INTO apns_tokens (token, user_id, environment, bundle_id)
  VALUES (p_token, auth.uid(), p_environment, left(p_bundle_id, 200))
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id, environment = EXCLUDED.environment,
        bundle_id = EXCLUDED.bundle_id, updated_at = now();
END $$;

-- On sign-out: this phone stops getting the account's pushes
CREATE OR REPLACE FUNCTION public.unregister_apns_token(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM apns_tokens WHERE token = p_token AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.register_apns_token(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_apns_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_apns_token(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_apns_token(text) TO authenticated;
