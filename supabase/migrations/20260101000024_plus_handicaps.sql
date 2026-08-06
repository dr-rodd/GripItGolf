-- Plus handicaps: shots GIVEN BACK, from the easiest hole down.
--
-- A player better than scratch has a plus handicap — "+1" — stored here as a
-- negative number. They give strokes to the course rather than receiving them,
-- and the allocation is the mirror of an ordinary handicap:
--
--   handicap 1   receives a shot on the HARDEST hole, SI 1
--   handicap +1  gives one back on the EASIEST hole, SI 18
--
-- So a +1 is level par by birdieing SI 18 and paring the other seventeen.
--
-- The trigger tested `v_stroke_index <= MOD(v_playing_handicap::INT, 18)`,
-- which for -1 is `stroke_index <= -1` — false on all eighteen holes. Only the
-- FLOOR term survived, and FLOOR(-1/18) is -1, so a +1 gave a shot back on
-- every hole. That asked a plus one to birdie all eighteen for level par, and
-- made +1 and +2 identical. The same error was in five copies of the formula
-- in the TypeScript, all now replaced by lib/handicap.ts.
--
-- Everything about an ordinary handicap is unchanged: for a non-negative
-- handicap this function is the same arithmetic it always was, so no card
-- belonging to a player of scratch or worse moves by a single point.

CREATE OR REPLACE FUNCTION shots_received(
  p_playing_handicap NUMERIC,
  p_stroke_index     INT
) RETURNS INT AS $$
DECLARE
  v_hcp   INT := ROUND(p_playing_handicap);
  v_given INT;
BEGIN
  IF v_hcp < 0 THEN
    -- Given back, counting down from the easiest hole. `19 - remainder` is
    -- where the extra one starts: a remainder of 1 is SI 18 alone, 3 is SI 16,
    -- 17 and 18.
    v_given := ABS(v_hcp);
    RETURN -((v_given / 18) + CASE WHEN p_stroke_index >= 19 - MOD(v_given, 18) THEN 1 ELSE 0 END);
  END IF;

  RETURN (v_hcp / 18) + CASE WHEN p_stroke_index <= MOD(v_hcp, 18) THEN 1 ELSE 0 END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION shots_received(NUMERIC, INT) IS
  'Shots received on a hole; negative for a plus handicap, which gives them back from SI 18 down. Mirrors lib/handicap.ts.';


-- ── The stableford trigger, using it ─────────────────────────
--
-- Unchanged in every other respect: the no-return short circuit, the composite
-- passthrough, the ladies par and stroke index. Only the shot allocation moves,
-- and only for a negative handicap.

CREATE OR REPLACE FUNCTION calculate_stableford()
RETURNS TRIGGER AS $$
DECLARE
  v_is_composite     BOOLEAN;
  v_par              SMALLINT;
  v_stroke_index     SMALLINT;
  v_playing_handicap NUMERIC(4,1);
  v_shots_received   INT;
  v_net_score        INT;
  v_gender           TEXT;
  v_par_ladies       SMALLINT;
  v_si_ladies        SMALLINT;
BEGIN
  NEW.updated_at := now();

  -- a) No Return: always 0 points
  IF NEW.no_return IS TRUE THEN
    NEW.stableford_points := 0;
    RETURN NEW;
  END IF;

  -- b) Composite players: trust the client-supplied value
  SELECT is_composite INTO v_is_composite FROM players WHERE id = NEW.player_id;
  IF v_is_composite THEN
    RETURN NEW;
  END IF;

  -- c) Normal calculation
  SELECT par, stroke_index, par_ladies, stroke_index_ladies
    INTO v_par, v_stroke_index, v_par_ladies, v_si_ladies
    FROM holes
   WHERE id = NEW.hole_id;

  SELECT playing_handicap
    INTO v_playing_handicap
    FROM round_handicaps
   WHERE round_id = NEW.round_id
     AND player_id = NEW.player_id;

  IF NEW.gross_score IS NULL OR v_playing_handicap IS NULL THEN
    NEW.stableford_points := 0;
    RETURN NEW;
  END IF;

  SELECT gender INTO v_gender FROM players WHERE id = NEW.player_id;

  -- Apply ladies par/SI for female players on any course that defines them
  IF v_gender = 'F' AND v_par_ladies IS NOT NULL AND v_si_ladies IS NOT NULL THEN
    v_par          := v_par_ladies;
    v_stroke_index := v_si_ladies;
  END IF;

  v_shots_received := shots_received(v_playing_handicap, v_stroke_index);
  v_net_score      := NEW.gross_score - v_shots_received;

  NEW.stableford_points := GREATEST(0, v_par + 2 - v_net_score);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── Re-score the cards that were wrong ───────────────────────
--
-- Scoped to plus handicaps and nothing else. An ordinary handicap gets exactly
-- the arithmetic it always got, so touching those rows could only introduce a
-- difference rather than correct one.
--
-- A no-op UPDATE is what re-fires the trigger; `gross_score = gross_score`
-- leaves the value alone and lets the BEFORE trigger recompute the points from
-- it. Safe to replay: it is idempotent, and it selects on the handicap rather
-- than on anything it changes.

UPDATE scores s
   SET gross_score = s.gross_score
  FROM round_handicaps rh
 WHERE rh.round_id  = s.round_id
   AND rh.player_id = s.player_id
   AND rh.playing_handicap < 0;
