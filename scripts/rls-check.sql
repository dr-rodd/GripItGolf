-- Row-level security: the checks run by hand in the Supabase SQL editor
-- after each stage (docs/gotchas-and-debt.md, "Row-level security"). The
-- test suite cannot reach the database, so this is where the database
-- itself is asked. Run one block at a time; each says what it should show.
-- Read-only throughout: nothing here writes.

-- ─── Before stage 8: is live_scores on the realtime channel at all? ──────
--
-- The live board (app/scoring/LiveLeaderboardPanel.tsx) listens for changes
-- to live_scores and also polls every fifteen seconds. If this says false,
-- the realtime half has never fired and the poll has done all the work —
-- so row-level security cannot break realtime, because there is none to
-- break. If true, stage 8's read policy on live_scores is what realtime
-- checks each change against.

SELECT EXISTS (
  SELECT 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_scores'
) AS live_scores_on_realtime;

-- ─── Stage 1: did migration 068 land? ────────────────────────────────────
--
-- Every column true.

SELECT
  to_regclass('public.trip_members')   IS NOT NULL AS trip_members,
  to_regclass('public.entry_attempts') IS NOT NULL AS entry_attempts,
  has_table_privilege('authenticated', 'public.match_scores',         'INSERT') AS match_scores,
  has_table_privilege('authenticated', 'public.match_concessions',    'INSERT') AS match_concessions,
  has_table_privilege('authenticated', 'public.session_matches',      'UPDATE') AS session_matches,
  has_table_privilege('authenticated', 'public.session_match_scores', 'INSERT') AS session_match_scores,
  has_table_privilege('service_role',  'public.trip_members',         'INSERT') AS server_writes_members,
  NOT has_table_privilege('anon',      'public.trip_members',         'SELECT') AS members_closed_to_anon;

-- ─── Stage 1: are phones being entered? ──────────────────────────────────
--
-- The newest entries, with the event and what each phone is. After the
-- phone check there is a row for the test phone: guest after the code,
-- player after claiming a name, organiser_until about twelve hours ahead
-- after the PIN.

SELECT t.trip_code, t.name, m.role, p.name AS player, m.organiser_until,
       m.organiser_until > now() AS organiser_now, m.updated_at
FROM trip_members m
JOIN trips t ON t.id = m.trip_id
LEFT JOIN players p ON p.id = m.player_id
ORDER BY m.updated_at DESC
LIMIT 20;

-- How many phones are signed in, and how many have entered anything.

SELECT
  (SELECT count(*) FROM auth.users WHERE is_anonymous)     AS anonymous_phones,
  (SELECT count(DISTINCT user_id) FROM trip_members)       AS phones_in_an_event,
  (SELECT count(*) FROM trip_members)                      AS memberships;

-- The retry limit at work: wrong PINs counted in the last day, by event.

SELECT t.trip_code, a.key LIKE '%:e' AS whole_event, a.failures, a.window_started
FROM entry_attempts a JOIN trips t ON t.id = a.trip_id
ORDER BY a.window_started DESC
LIMIT 20;

-- ─── Stage 2: the dry-run count before any phone is forgotten ────────────
--
-- After migration 069. How many anonymous phones the nightly cleanup would
-- forget tonight, and why — read this BEFORE FORGET_ANONYMOUS_PHONES in
-- lib/membership.ts is switched on. Nothing here deletes. The rule is the
-- function itself (069), so this count and the deletion cannot disagree.

SELECT reason, count(*) AS phones
FROM public.anonymous_phones_to_forget()
GROUP BY reason
ORDER BY reason;

-- The phones the rule keeps, for comparison: everyone else signed in.

SELECT
  (SELECT count(*) FROM auth.users WHERE is_anonymous)              AS anonymous_phones,
  (SELECT count(*) FROM public.anonymous_phones_to_forget())        AS would_forget,
  (SELECT count(*) FROM auth.users WHERE is_anonymous)
    - (SELECT count(*) FROM public.anonymous_phones_to_forget())    AS would_keep;

-- Belt and braces: none it would forget belongs to an event still open.
-- Should say 0.

SELECT count(*) AS forgotten_but_still_playing
FROM public.anonymous_phones_to_forget() f
JOIN public.trip_members m ON m.user_id = f.user_id
JOIN public.trips t ON t.id = m.trip_id
WHERE t.end_date IS NULL OR t.end_date >= (now() AT TIME ZONE 'Europe/Dublin')::date - 30;

