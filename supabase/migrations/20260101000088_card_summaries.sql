-- 088 — a summary row per signed card (stage (f); D121, D122, D152;
-- Ross, 14–15 Nov 2026).
--
-- PASTE THIS BEFORE THE DEPLOY. Nothing changes by pasting it: the table is
-- empty until a card is signed, and every reader treats a missing table as
-- "no stats yet". Nobody ever needs an account to join, play, score or watch
-- (D94); this only lets a golfer's own rounds be read without reading every
-- hole of every event again.
--
-- One row per player per signed round, written by the server from the
-- round's committed scores (lib/cardSummary.ts on lib/holeStats.ts — no
-- second copy of any rule), and rewritten whenever the card changes:
-- committed again, voided (the row goes), re-scored by a card check, or the
-- event moving into or out of a club (origin rewritten). A player's own card
-- only — nothing that depends on the rest of the field.
--
-- `origin` (D122): 'club' when the event is a verified club's, else
-- 'self_claimed' — an open event's round is self-claimed and never feeds a
-- handicap or a club honour. A club reads only its own events' rows.
--
-- Derived data: dropping it loses nothing — the backfill on /admin writes it
-- again from the scores. Server only: RLS on, no policy, closed to phones.

CREATE TABLE IF NOT EXISTS card_summaries (
  round_id        uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id       uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  trip_id         uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  course_id       uuid        NULL REFERENCES courses(id) ON DELETE SET NULL,
  tee_id          uuid        NULL,
  played_on       date        NULL,
  holes           smallint    NOT NULL CHECK (holes BETWEEN 0 AND 36),
  no_returns      smallint    NOT NULL DEFAULT 0,
  gross           smallint    NULL,
  par             smallint    NULL,
  points          smallint    NOT NULL DEFAULT 0,
  course_handicap numeric(5,1) NULL,
  putts           smallint    NULL,
  putts_holes     smallint    NOT NULL DEFAULT 0,
  fairways_hit    smallint    NOT NULL DEFAULT 0,
  fairways_tried  smallint    NOT NULL DEFAULT 0,
  gir             smallint    NOT NULL DEFAULT 0,
  gir_holes       smallint    NOT NULL DEFAULT 0,
  eagles          smallint    NOT NULL DEFAULT 0,
  birdies         smallint    NOT NULL DEFAULT 0,
  pars            smallint    NOT NULL DEFAULT 0,
  bogeys          smallint    NOT NULL DEFAULT 0,
  doubles         smallint    NOT NULL DEFAULT 0,
  origin          text        NOT NULL DEFAULT 'self_claimed' CHECK (origin IN ('club', 'self_claimed')),
  club_id         uuid        NULL REFERENCES clubs(id) ON DELETE SET NULL,
  rules_version   smallint    NOT NULL,
  written_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_card_summaries_player ON card_summaries(player_id, played_on);
CREATE INDEX IF NOT EXISTS idx_card_summaries_club   ON card_summaries(club_id, played_on) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_summaries_trip   ON card_summaries(trip_id);

ALTER TABLE card_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.card_summaries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_summaries TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     to_regclass('public.card_summaries') IS NOT NULL                              AS table_exists,
--     NOT has_table_privilege('authenticated', 'public.card_summaries', 'SELECT')   AS closed_to_phones,
--     NOT has_table_privilege('anon', 'public.card_summaries', 'SELECT')            AS closed_to_anon,
--     (SELECT relrowsecurity FROM pg_class WHERE relname = 'card_summaries')        AS rls_on;
--
-- After the backfill on /admin, a count by origin:
--
--   SELECT origin, count(*) FROM card_summaries GROUP BY origin;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time — it is derived from the scores and rebuilt by the
-- backfill:
--
--   DROP TABLE IF EXISTS card_summaries;
