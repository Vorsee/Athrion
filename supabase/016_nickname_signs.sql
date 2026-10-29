-- 016: nicknames may also use "." and "-" (still 3-20 characters, lowercase), and need at least
-- one letter or number. Only signs that are safe in invite links (athrion.app/add/<nickname>).
-- The app checks the same rule (NICKNAME_RE in src/lib/points.js); until this runs, a nickname
-- with "." or "-" is refused with "That nickname is not allowed".
ALTER TABLE public.social_profiles DROP CONSTRAINT IF EXISTS social_profiles_nickname_check;
ALTER TABLE public.social_profiles ADD CONSTRAINT social_profiles_nickname_check CHECK (
  nickname ~ '^[a-z0-9._-]{3,20}$'
  AND nickname ~ '[a-z0-9]'
  AND nickname NOT IN ('athrion', 'admin', 'support', 'official', 'help')
);
