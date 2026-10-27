-- 014: coaches and the shop. Coaches apply, an admin approves them, then they publish
-- workouts and week plans (free or paid) with tips and how-to videos. Paid ones are sold
-- through Stripe Connect (api/coach-checkout.js); the webhook records each purchase here.
-- Apply before the app version with the shop. Safe to re-run.
--
-- After applying, make yourself an admin (in the SQL editor, with your own email):
--   INSERT INTO public.app_admins (user_id) SELECT id FROM auth.users WHERE email = 'you@example.com';

-- ── Admins ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "see own admin row" ON public.app_admins;
CREATE POLICY "see own admin row" ON public.app_admins FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.app_admins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid());
$$;

-- ── Coach profiles ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_profiles (
  user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      text        NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 40),
  bio               text        NOT NULL DEFAULT '' CHECK (char_length(bio) <= 1000),
  credentials       text        NOT NULL DEFAULT '' CHECK (char_length(credentials) <= 500),
  specialties       text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(specialties) <= 6),
  links             text        NOT NULL DEFAULT '' CHECK (char_length(links) <= 300),
  avatar_path       text        CHECK (char_length(avatar_path) <= 200),
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  review_note       text        CHECK (char_length(review_note) <= 500),
  stripe_account_id text        UNIQUE,
  charges_enabled   boolean     NOT NULL DEFAULT false,
  applied_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_at       timestamptz
);
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_approved_coach()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM coach_profiles WHERE user_id = auth.uid() AND status = 'approved');
$$;

DROP POLICY IF EXISTS "read approved coaches, own row, admins all" ON public.coach_profiles;
CREATE POLICY "read approved coaches, own row, admins all" ON public.coach_profiles FOR SELECT TO authenticated
  USING (status = 'approved' OR user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "apply as yourself" ON public.coach_profiles;
CREATE POLICY "apply as yourself" ON public.coach_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "edit own profile" ON public.coach_profiles;
CREATE POLICY "edit own profile" ON public.coach_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- People write only their own profile text; status, review and Stripe fields are server-only.
-- The Stripe account id isn't readable from the app at all.
REVOKE ALL ON public.coach_profiles FROM anon, authenticated;
GRANT SELECT (user_id, display_name, bio, credentials, specialties, links, avatar_path, status, review_note, charges_enabled, applied_at, reviewed_at)
  ON public.coach_profiles TO authenticated;
GRANT INSERT (user_id, display_name, bio, credentials, specialties, links, avatar_path) ON public.coach_profiles TO authenticated;
GRANT UPDATE (display_name, bio, credentials, specialties, links, avatar_path) ON public.coach_profiles TO authenticated;

-- A turned-down coach can apply again after changing their profile
CREATE OR REPLACE FUNCTION public.reapply_coach()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE coach_profiles SET status = 'pending', review_note = NULL, applied_at = now(), reviewed_at = NULL
  WHERE user_id = auth.uid() AND status = 'rejected';
$$;
REVOKE ALL ON FUNCTION public.reapply_coach() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reapply_coach() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_coach(p_user uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can review coaches' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('approved', 'rejected', 'suspended') THEN RAISE EXCEPTION 'Unknown status %', p_status; END IF;
  UPDATE coach_profiles
     SET status = p_status, review_note = CASE WHEN p_status = 'approved' THEN NULL ELSE left(p_note, 500) END, reviewed_at = now()
   WHERE user_id = p_user;
END $$;
REVOKE ALL ON FUNCTION public.review_coach(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_coach(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_review_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM notify(NEW.user_id, 'coach', 'You''re an ATHRION coach', 'Your application was approved. Set up payouts and publish your first workout.', '/?open=coach');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM notify(NEW.user_id, 'coach', 'Your coach application', 'It wasn''t approved this time. Open it to see why and apply again.', '/?open=coach');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS coach_profiles_notify ON public.coach_profiles;
CREATE TRIGGER coach_profiles_notify AFTER UPDATE OF status ON public.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.coach_review_notify();

-- ── Products: what's on sale. Anyone signed in sees the listing; the content is separate ──
CREATE TABLE IF NOT EXISTS public.coach_products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid        NOT NULL REFERENCES public.coach_profiles(user_id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('workout', 'plan')),
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
  summary     text        NOT NULL DEFAULT '' CHECK (char_length(summary) <= 160),
  description text        NOT NULL DEFAULT '' CHECK (char_length(description) <= 3000),
  level       text        NOT NULL DEFAULT 'All levels' CHECK (level IN ('Beginner', 'Intermediate', 'Advanced', 'All levels')),
  price_cents int         NOT NULL DEFAULT 0 CHECK (price_cents = 0 OR price_cents BETWEEN 299 AND 50000),
  minutes     int         CHECK (minutes BETWEEN 1 AND 300),
  outline     jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(outline) = 'array' AND pg_column_size(outline) < 8000),
  published   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_products_coach ON public.coach_products (coach_id);
ALTER TABLE public.coach_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read published products" ON public.coach_products;
CREATE POLICY "read published products" ON public.coach_products FOR SELECT TO authenticated
  USING (
    coach_id = auth.uid() OR public.is_admin()
    OR (published AND EXISTS (SELECT 1 FROM coach_profiles c WHERE c.user_id = coach_products.coach_id AND c.status = 'approved'))
  );
DROP POLICY IF EXISTS "approved coaches add products" ON public.coach_products;
CREATE POLICY "approved coaches add products" ON public.coach_products FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.is_approved_coach());
DROP POLICY IF EXISTS "approved coaches edit products" ON public.coach_products;
CREATE POLICY "approved coaches edit products" ON public.coach_products FOR UPDATE TO authenticated
  USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid() AND public.is_approved_coach());

-- ── Purchases (written by the Stripe webhook, or claim_free_product) ─────────
CREATE TABLE IF NOT EXISTS public.coach_purchases (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            uuid        REFERENCES public.coach_products(id) ON DELETE SET NULL,
  coach_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 text        NOT NULL,
  amount_cents          int         NOT NULL DEFAULT 0,
  fee_cents             int         NOT NULL DEFAULT 0,
  status                text        NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  stripe_session_id     text        UNIQUE,
  stripe_payment_intent text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS coach_purchases_coach ON public.coach_purchases (coach_id);
ALTER TABLE public.coach_purchases ENABLE ROW LEVEL SECURITY;
-- Coaches see their sales (amounts and dates, not who bought)
DROP POLICY IF EXISTS "buyers and coaches read purchases" ON public.coach_purchases;
CREATE POLICY "buyers and coaches read purchases" ON public.coach_purchases FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR coach_id = auth.uid() OR public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.coach_purchases FROM anon, authenticated;

-- Something people bought can only be unpublished, so buyers keep it
DROP POLICY IF EXISTS "delete unsold products" ON public.coach_products;
CREATE POLICY "delete unsold products" ON public.coach_products FOR DELETE TO authenticated
  USING (coach_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM coach_purchases p WHERE p.product_id = coach_products.id));

-- Can the caller open this product's workouts, tips and videos?
CREATE OR REPLACE FUNCTION public.can_view_product(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM coach_products pr
    WHERE pr.id = p_id AND (
      pr.coach_id = auth.uid()
      OR (pr.price_cents = 0 AND pr.published AND EXISTS (SELECT 1 FROM coach_profiles c WHERE c.user_id = pr.coach_id AND c.status = 'approved'))
      OR EXISTS (SELECT 1 FROM coach_purchases pu WHERE pu.product_id = pr.id AND pu.buyer_id = auth.uid() AND pu.status = 'paid')
    )
  );
$$;

-- Free products go into "Your workouts" like bought ones
CREATE OR REPLACE FUNCTION public.claim_free_product(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr coach_products;
BEGIN
  SELECT * INTO pr FROM coach_products WHERE id = p_id;
  IF pr.id IS NULL OR pr.price_cents <> 0 OR NOT pr.published
     OR NOT EXISTS (SELECT 1 FROM coach_profiles c WHERE c.user_id = pr.coach_id AND c.status = 'approved') THEN
    RAISE EXCEPTION 'This workout isn''t free' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO coach_purchases (product_id, coach_id, buyer_id, title)
  VALUES (pr.id, pr.coach_id, auth.uid(), pr.title)
  ON CONFLICT (product_id, buyer_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.claim_free_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_free_product(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_sale_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.amount_cents > 0 AND NEW.coach_id IS NOT NULL THEN
    PERFORM notify(NEW.coach_id, 'sale', 'You made a sale',
      format('%s · you earn $%s', NEW.title, to_char((NEW.amount_cents - NEW.fee_cents) / 100.0, 'FM999990.00')), '/?open=coach');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS coach_purchases_notify ON public.coach_purchases;
CREATE TRIGGER coach_purchases_notify AFTER INSERT ON public.coach_purchases
  FOR EACH ROW EXECUTE FUNCTION public.coach_sale_notify();

-- ── Content: exercises, sets, tips and video paths. Only owners and buyers read it ──
CREATE TABLE IF NOT EXISTS public.coach_product_content (
  product_id uuid  PRIMARY KEY REFERENCES public.coach_products(id) ON DELETE CASCADE,
  content    jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(content) = 'object' AND pg_column_size(content) < 400000)
);
ALTER TABLE public.coach_product_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners and buyers read content" ON public.coach_product_content;
CREATE POLICY "owners and buyers read content" ON public.coach_product_content FOR SELECT TO authenticated
  USING (public.can_view_product(product_id));
DROP POLICY IF EXISTS "coaches write own content" ON public.coach_product_content;
CREATE POLICY "coaches write own content" ON public.coach_product_content FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM coach_products pr WHERE pr.id = coach_product_content.product_id AND pr.coach_id = auth.uid()))
  WITH CHECK (public.is_approved_coach() AND EXISTS (SELECT 1 FROM coach_products pr WHERE pr.id = coach_product_content.product_id AND pr.coach_id = auth.uid()));

-- ── Storage: public avatars; private videos at <coach id>/<product id>-<name> ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('coach-avatars', 'coach-avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('coach-videos', 'coach-videos', false, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_view_coach_video(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid text := substring(storage.filename(p_name) FROM 1 FOR 36);
BEGIN
  IF (storage.foldername(p_name))[1] = auth.uid()::text THEN RETURN true; END IF;
  IF pid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  RETURN public.can_view_product(pid::uuid);
END $$;

DROP POLICY IF EXISTS "coaches upload own avatar" ON storage.objects;
CREATE POLICY "coaches upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'coach-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "coaches change own avatar" ON storage.objects;
CREATE POLICY "coaches change own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'coach-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "coaches delete own avatar" ON storage.objects;
CREATE POLICY "coaches delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'coach-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "approved coaches upload videos" ON storage.objects;
CREATE POLICY "approved coaches upload videos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'coach-videos' AND (storage.foldername(name))[1] = auth.uid()::text AND public.is_approved_coach());
DROP POLICY IF EXISTS "owners and buyers watch videos" ON storage.objects;
CREATE POLICY "owners and buyers watch videos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'coach-videos' AND public.can_view_coach_video(name));
DROP POLICY IF EXISTS "coaches delete own videos" ON storage.objects;
CREATE POLICY "coaches delete own videos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'coach-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
