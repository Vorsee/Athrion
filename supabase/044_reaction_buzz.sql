-- 044: A reaction in a room buzzes the person it's for. The iPhone gets a push with only a
-- sound (no title, no text), so the phone vibrates in a pocket without a notification to
-- read or clear; send-reminders' { buzz } does it (apns.ts sendBuzz). A failure here never
-- blocks the reaction. Needs the 'reminders_cron_secret' Vault secret from 005. Safe to re-run.

CREATE OR REPLACE FUNCTION public.reaction_buzz()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.to_user IS DISTINCT FROM NEW.from_user THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://dbpxxhqcsfypxjcdalca.supabase.co/functions/v1/send-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')),
        body    := jsonb_build_object('buzz', NEW.id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reaction_buzz: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS group_reactions_buzz ON public.group_reactions;
CREATE TRIGGER group_reactions_buzz AFTER INSERT ON public.group_reactions
  FOR EACH ROW EXECUTE FUNCTION public.reaction_buzz();
