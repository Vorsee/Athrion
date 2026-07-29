-- ── Subscriptions table ───────────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor (Database → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status                  text        NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'pro')),
  stripe_customer_id      text        UNIQUE,
  stripe_subscription_id  text        UNIQUE,
  period_end              timestamptz,
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own row
CREATE POLICY "read own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only your backend (service-role key / Stripe webhook) can write
-- No INSERT/UPDATE policy for anon/authenticated — handled server-side


-- ── Auto-create a free row on every new sign-up ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_subscription();


-- ── Backfill existing users (run once) ────────────────────────────────────────
INSERT INTO public.subscriptions (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
