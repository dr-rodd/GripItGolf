-- 090 — a club competition's cards signed on the server (stage (d3); D176–
-- D178, as amended by Ross, 16 Nov 2026: a card is final only with the
-- player's approval on their own account and a marker's signature, the two
-- never the same account).
--
-- PASTE THIS AFTER THE DEPLOY. The server's signing route
-- (`/api/card/sign`) must be live before phones lose the `scores` write on a
-- competition round, or a group finalising in between could not. Before
-- it, the route answers that signing is not set up yet and the card stays
-- open, its holes safe in `live_scores`.
--
-- (1) `card_signatures` — one row a player a finalise (round, player, the
--     card it came from, who finalised and when; the player's approval; the
--     marker chosen — a row of the club's list — and their signature, or an
--     owner's or admin's in their place; sent back, and by whom). Server only.
--     A card sent back keeps its row, closed, and a fresh one is written when
--     it is finalised again — so the history is kept. One open row per
--     player per round.
-- (2) Phones keep writing `scores` everywhere except a club competition's
--     rounds, whose `scores` only the server writes, so a signed card cannot
--     change under its marker. `live_scores`, `live_rounds`, the locks and
--     the handicap snapshot are unchanged — a competition is scored on the
--     phones as ever.

-- (1)
CREATE TABLE IF NOT EXISTS card_signatures (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid        NOT NULL REFERENCES trips(id)        ON DELETE CASCADE,
  round_id         uuid        NOT NULL REFERENCES rounds(id)       ON DELETE CASCADE,
  player_id        uuid        NOT NULL REFERENCES players(id)      ON DELETE CASCADE,
  live_round_id    uuid        NULL     REFERENCES live_rounds(id)  ON DELETE SET NULL,
  finalised_by     uuid        NULL     REFERENCES auth.users(id)   ON DELETE SET NULL,
  finalised_at     timestamptz NOT NULL DEFAULT now(),
  approved_by      uuid        NULL     REFERENCES auth.users(id)   ON DELETE SET NULL,
  approved_at      timestamptz NULL,
  marker_member_id uuid        NULL     REFERENCES club_members(id) ON DELETE SET NULL,
  marked_by        uuid        NULL     REFERENCES auth.users(id)   ON DELETE SET NULL,
  marked_at        timestamptz NULL,
  marked_as        text        NULL CHECK (marked_as IS NULL OR marked_as IN ('marker', 'admin')),
  sent_back_by     uuid        NULL     REFERENCES auth.users(id)   ON DELETE SET NULL,
  sent_back_at     timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_signatures_open ON card_signatures(round_id, player_id) WHERE sent_back_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_card_signatures_trip   ON card_signatures(trip_id);
CREATE INDEX IF NOT EXISTS idx_card_signatures_marker ON card_signatures(marker_member_id) WHERE sent_back_at IS NULL AND marked_at IS NULL;
ALTER TABLE card_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.card_signatures FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_signatures TO service_role;

-- (2) 079's writable_rounds(), less the rounds of a club competition.
CREATE OR REPLACE FUNCTION public.phone_score_rounds()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id FROM public.rounds r JOIN public.trips t ON t.id = r.trip_id
  WHERE r.id IN (SELECT public.writable_rounds()) AND t.competition IS DISTINCT FROM 'club'
$$;
REVOKE ALL ON FUNCTION public.phone_score_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phone_score_rounds() TO authenticated, service_role;

DROP POLICY IF EXISTS scores_member_insert ON scores;
DROP POLICY IF EXISTS scores_member_update ON scores;
DROP POLICY IF EXISTS scores_member_delete ON scores;
CREATE POLICY scores_member_insert ON scores FOR INSERT TO authenticated WITH CHECK (round_id IN (SELECT public.phone_score_rounds()));
CREATE POLICY scores_member_update ON scores FOR UPDATE TO authenticated USING (round_id IN (SELECT public.phone_score_rounds())) WITH CHECK (round_id IN (SELECT public.phone_score_rounds()));
CREATE POLICY scores_member_delete ON scores FOR DELETE TO authenticated USING (round_id IN (SELECT public.phone_score_rounds()));

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     (SELECT relrowsecurity FROM pg_class WHERE relname = 'card_signatures')                         AS signatures_rls,
--     NOT has_table_privilege('authenticated', 'public.card_signatures', 'SELECT')                     AS signatures_closed,
--     has_table_privilege('service_role', 'public.card_signatures', 'INSERT')                          AS server_writes,
--     EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'phone_score_rounds')                              AS function_there,
--     (SELECT count(*) FROM pg_policies WHERE tablename = 'scores'
--        AND (qual ILIKE '%phone_score_rounds%' OR with_check ILIKE '%phone_score_rounds%')) = 3        AS scores_policies;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- The scores policies back to 079's word for word, then the table (every
-- signature with it — cards already signed keep their scores):
--
--   DROP POLICY IF EXISTS scores_member_insert ON scores;
--   DROP POLICY IF EXISTS scores_member_update ON scores;
--   DROP POLICY IF EXISTS scores_member_delete ON scores;
--   CREATE POLICY scores_member_insert ON scores FOR INSERT TO authenticated WITH CHECK (round_id IN (SELECT public.writable_rounds()));
--   CREATE POLICY scores_member_update ON scores FOR UPDATE TO authenticated USING (round_id IN (SELECT public.writable_rounds())) WITH CHECK (round_id IN (SELECT public.writable_rounds()));
--   CREATE POLICY scores_member_delete ON scores FOR DELETE TO authenticated USING (round_id IN (SELECT public.writable_rounds()));
--   DROP FUNCTION IF EXISTS public.phone_score_rounds();
--   DROP TABLE IF EXISTS card_signatures;
