-- Hourly trigger for the send-reminders Edge Function.
-- Before running, store the function's CRON_SECRET in Vault (once):
--   select vault.create_secret('<CRON_SECRET value>', 'reminders_cron_secret');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('send-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-reminders');

SELECT cron.schedule(
  'send-reminders',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dbpxxhqcsfypxjcdalca.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
