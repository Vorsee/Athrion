-- 010: a top-3 finish is a real free month for everyone, including people already paying.
-- close_month() still gives non-paying winners subscriptions.comp_pro_until. Winners with an
-- active Stripe subscription are left for /api/monthly-prizes (Vercel cron), which moves their
-- next charge a month later. prize_given_at marks a prize as handed out. Safe to re-run.

ALTER TABLE public.monthly_scores ADD COLUMN IF NOT EXISTS prize_given_at timestamptz;

CREATE OR REPLACE FUNCTION public.close_month(p_month date DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m date := date_trunc('month', COALESCE(p_month, current_date - interval '1 month'))::date;
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM monthly_scores WHERE month = m) THEN RETURN 0; END IF; -- already closed

  INSERT INTO monthly_scores (user_id, month, points, workout_days, rank)
  SELECT t.user_id, m, t.points, t.workout_days,
         CASE WHEN sp.on_leaderboard IS TRUE THEN
           row_number() OVER (PARTITION BY sp.on_leaderboard IS TRUE ORDER BY t.points DESC, t.last_at ASC NULLS LAST)
         END
  FROM month_points(m) t
  LEFT JOIN social_profiles sp ON sp.user_id = t.user_id
  WHERE t.points > 0;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE monthly_scores SET prize_pro = true WHERE month = m AND rank <= 3;

  -- Not paying through Stripe: a free Pro month on top of any they already have
  UPDATE subscriptions s
     SET comp_pro_until = GREATEST(COALESCE(s.comp_pro_until, now()), now()) + interval '1 month',
         updated_at = now()
    FROM monthly_scores ms
   WHERE ms.month = m AND ms.prize_pro AND ms.user_id = s.user_id
     AND NOT (s.status = 'pro' AND s.stripe_subscription_id IS NOT NULL);
  UPDATE monthly_scores ms
     SET prize_given_at = now()
    FROM subscriptions s
   WHERE ms.month = m AND ms.prize_pro AND s.user_id = ms.user_id
     AND NOT (s.status = 'pro' AND s.stripe_subscription_id IS NOT NULL);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.close_month(date) FROM PUBLIC, anon, authenticated;
