-- 015: runs and swims, logged on Progress > Cardio. Distance in metres, time in seconds.
-- Apply before the app version with the Cardio tab. Safe to re-run.
CREATE TABLE IF NOT EXISTS public.cardio_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  kind       text        NOT NULL CHECK (kind IN ('run', 'swim')),
  distance_m numeric(8,1) NOT NULL CHECK (distance_m > 0 AND distance_m <= 500000),
  seconds    int         NOT NULL CHECK (seconds > 0 AND seconds <= 172800),
  notes      text        NOT NULL DEFAULT '' CHECK (char_length(notes) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cardio_logs_user_date ON public.cardio_logs (user_id, date DESC);
ALTER TABLE public.cardio_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cardio_logs" ON public.cardio_logs;
CREATE POLICY "Users manage own cardio_logs" ON public.cardio_logs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
