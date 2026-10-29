-- 022: anyone can write a review on the landing page, without an account. Those come in through
-- /api/review (service key, honeypot and a per-visitor limit), hidden until an admin shows them,
-- and every admin is notified. Signed-in reviews (021) still post straight away, one per person.
-- Apply after 021, before the app version with the landing review form. Safe to re-run.

ALTER TABLE public.app_reviews ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.app_reviews DROP CONSTRAINT IF EXISTS app_reviews_pkey;
ALTER TABLE public.app_reviews ADD PRIMARY KEY (id);
ALTER TABLE public.app_reviews ALTER COLUMN user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_reviews_one_per_user ON public.app_reviews (user_id) WHERE user_id IS NOT NULL;
-- A one-way hash of the visitor's address, only to limit how many reviews one visitor sends
ALTER TABLE public.app_reviews ADD COLUMN IF NOT EXISTS ip_hash text CHECK (char_length(ip_hash) <= 64);
CREATE INDEX IF NOT EXISTS app_reviews_ip_recent ON public.app_reviews (ip_hash, created_at) WHERE ip_hash IS NOT NULL;

-- The app reads ids (admins hide or show by id); the public still sees no ids or hashes
REVOKE SELECT ON public.app_reviews FROM authenticated;
GRANT SELECT (id, user_id, name, rating, body, hidden, created_at, updated_at) ON public.app_reviews TO authenticated;

-- A review from someone without an account: tell every admin it is waiting
CREATE OR REPLACE FUNCTION public.app_review_waiting_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF NEW.user_id IS NULL AND NEW.hidden THEN
    FOR a IN SELECT user_id FROM app_admins LOOP
      PERFORM notify(a.user_id, 'review', 'New review to approve',
        NEW.name || ' gave ' || NEW.rating || ' stars: "' || left(NEW.body, 80) || CASE WHEN char_length(NEW.body) > 80 THEN '…"' ELSE '"' END,
        '/?open=review');
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS app_reviews_waiting_notify ON public.app_reviews;
CREATE TRIGGER app_reviews_waiting_notify AFTER INSERT ON public.app_reviews
  FOR EACH ROW EXECUTE FUNCTION public.app_review_waiting_notify();
