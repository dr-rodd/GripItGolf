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

-- ─── Stage 3: the first lock (after migration 070) ──────────────────────
--
-- The migration's own "Did it land?" first. Then the lock seen working, by
-- pretending to be a phone. Each block runs inside BEGIN … ROLLBACK, so
-- nothing is changed and the pretence ends with the block.

-- (1) A phone in no event at all reads nothing. Should say 0 and 0.

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
SELECT (SELECT count(*) FROM trips) AS trips_seen, (SELECT count(*) FROM players) AS players_seen;
ROLLBACK;

-- (2) The phone that entered an event most recently reads that event and no
-- other. events_seen should equal events_entered, and players_seen should be
-- that many events' players, not the whole database's.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_id::text FROM trip_members ORDER BY updated_at DESC LIMIT 1), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT
  (SELECT count(*) FROM trip_members WHERE user_id = auth.uid()) AS events_entered,
  (SELECT count(*) FROM trips)                                    AS events_seen,
  (SELECT count(DISTINCT trip_id) FROM players)                   AS events_with_players_seen,
  (SELECT count(*) FROM players)                                  AS players_seen;
ROLLBACK;

-- (3) The scoring tables are still open: a phone in no event still reads
-- them, exactly as before (stages 7 and 8 lock them). Should be the same
-- numbers as running the inner SELECT on its own, outside the block.

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
SELECT (SELECT count(*) FROM live_rounds) AS live_rounds_seen, (SELECT count(*) FROM match_scores) AS match_scores_seen;
ROLLBACK;

