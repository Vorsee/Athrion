-- 028: more badges, swim ones among them (BADGES in src/lib/badges.js; a test keeps the names in
-- step). Only the notification text changes: badges are earned in the app and saved to user_badges.
-- Apply after 011. Safe to re-run. Before it runs, a new badge's notification says "New badge".
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
  WHEN 'workouts_250'  THEN 'Iron Habit'
  WHEN 'streak_26'     THEN 'Half a Year'
  WHEN 'volume_25k'    THEN 'Heavy Hauler'
  WHEN 'weigh_in_50'   THEN 'Steady Tracker'
  WHEN 'swim_first'    THEN 'First Lap'
  WHEN 'swim_mile'     THEN 'Mile Swimmer'
  WHEN 'swim_10k'      THEN 'Ten K Club'
  WHEN 'swim_100k'     THEN 'Long Hauler'
  WHEN 'swim_strokes'  THEN 'Medley Master'
  WHEN 'swim_pr'       THEN 'Faster'
  WHEN 'swim_streak_4' THEN 'Water Regular'
  ELSE 'New badge' END;
BEGIN
  PERFORM notify(NEW.user_id, 'badge', 'Badge earned: ' || badge, 'See all your badges in Progress.', '/?open=progress', false);
  RETURN NEW;
END $$;
