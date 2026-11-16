-- 091 — a club competition's results certified, and No return (stage (d4);
-- D169–D172; Ross, 16 Nov 2026).
--
-- PASTE THIS AFTER THE DEPLOY, WITH NO COMPETITION CARD OPEN. The code reads
-- every part of it fail-soft: before it, nothing can be certified or marked
-- No return (the club area says so), and every round scores as today.
--
-- (1) `rounds.certified_at` — when a club's owner or admin certified the
--     round's results, or null. Phones read it (a card can say it is
--     closed); only the server writes it. `rounds` kept the automatic
--     whole-table grants it was made with, so the new column needs none.
-- (2) `round_certifications` — every certify and reopen, by whom (an
--     account) and when. Server only.
-- (3) `round_no_returns` — a booked player who returned no card: the round,
--     the player, by whom, when. One a player a round. Server only.
-- (4) The lock: 079's `writable_rounds()` less a certified round, so no
--     phone writes `scores`, `live_scores`, `live_rounds`,
--     `live_player_locks`, `round_handicaps` or `composite_holes` for one —
--     one function, every scoring write (090's `phone_score_rounds()` builds
--     on it, so it follows). Reopen clears `certified_at` and the lock lifts.

-- (1)
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS certified_at timestamptz NULL;

-- (2)
CREATE TABLE IF NOT EXISTS round_certifications (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id  uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  action    text        NOT NULL CHECK (action IN ('certify', 'reopen')),
  by_user   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_round_certifications_round ON round_certifications(round_id, at);
ALTER TABLE round_certifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.round_certifications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_certifications TO service_role;

-- (3)
CREATE TABLE IF NOT EXISTS round_no_returns (
  round_id  uuid        NOT NULL REFERENCES rounds(id)  ON DELETE CASCADE,
  player_id uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  by_user   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, player_id)
);
ALTER TABLE round_no_returns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.round_no_returns FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_no_returns TO service_role;

-- (4)
CREATE OR REPLACE FUNCTION public.writable_rounds()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id FROM public.rounds r WHERE r.trip_id IN (SELECT public.writable_trips()) AND r.certified_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.writable_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.writable_rounds() TO authenticated, service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rounds' AND column_name = 'certified_at') AS certified_column,
--     has_column_privilege('authenticated', 'public.rounds', 'certified_at', 'SELECT')                                AS phones_read_it,
--     NOT has_table_privilege('authenticated', 'public.round_certifications', 'SELECT')                               AS log_closed,
--     NOT has_table_privilege('authenticated', 'public.round_no_returns', 'SELECT')                                   AS no_returns_closed,
--     (SELECT relrowsecurity FROM pg_class WHERE relname = 'round_certifications')                                    AS log_rls,
--     (SELECT relrowsecurity FROM pg_class WHERE relname = 'round_no_returns')                                        AS no_returns_rls,
--     (SELECT prosrc ILIKE '%certified_at IS NULL%' FROM pg_proc WHERE proname = 'writable_rounds')                   AS lock_in;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- 079's writable_rounds() back word for word first (every certified round
-- opens to phones again), then the two tables and the column:
--
--   CREATE OR REPLACE FUNCTION public.writable_rounds()
--   RETURNS SETOF uuid
--   LANGUAGE sql
--   STABLE
--   SECURITY DEFINER
--   SET search_path = ''
--   AS $$
--     SELECT r.id FROM public.rounds r WHERE r.trip_id IN (SELECT public.writable_trips())
--   $$;
--   DROP TABLE IF EXISTS round_no_returns;
--   DROP TABLE IF EXISTS round_certifications;
--   ALTER TABLE rounds DROP COLUMN IF EXISTS certified_at;
