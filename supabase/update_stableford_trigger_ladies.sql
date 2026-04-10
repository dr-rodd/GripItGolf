-- Update stableford trigger to use par_ladies / stroke_index_ladies
-- for female players on St Patrick's course.

CREATE OR REPLACE FUNCTION calculate_stableford()
RETURNS TRIGGER AS $$
DECLARE
  v_par              SMALLINT;
  v_stroke_index     SMALLINT;
  v_playing_handicap SMALLINT;
  v_shots_received   SMALLINT;
  v_net_score        SMALLINT;
  v_gender           TEXT;
  v_course_id        UUID;
  v_par_ladies       SMALLINT;
  v_si_ladies        SMALLINT;
BEGIN
  SELECT par, stroke_index, par_ladies, stroke_index_ladies, course_id
    INTO v_par, v_stroke_index, v_par_ladies, v_si_ladies, v_course_id
    FROM holes
   WHERE id = NEW.hole_id;

  SELECT playing_handicap
    INTO v_playing_handicap
    FROM round_handicaps
   WHERE round_id = NEW.round_id
     AND player_id = NEW.player_id;

  SELECT gender INTO v_gender FROM players WHERE id = NEW.player_id;

  -- Use ladies par/stroke_index for female players on St Patrick's course
  IF v_gender = 'F'
     AND v_course_id = '11111111-0000-0000-0000-000000000003'
     AND v_par_ladies IS NOT NULL
     AND v_si_ladies IS NOT NULL
  THEN
    v_par          := v_par_ladies;
    v_stroke_index := v_si_ladies;
  END IF;

  v_shots_received := FLOOR(v_playing_handicap::numeric / 18)::smallint
                    + CASE WHEN v_stroke_index <= (v_playing_handicap % 18) THEN 1 ELSE 0 END;

  v_net_score := NEW.gross_score - v_shots_received;
  NEW.stableford_points := GREATEST(0, v_par + 2 - v_net_score);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
