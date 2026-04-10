-- Add no_return flag to scores table
-- Run in Supabase SQL editor

ALTER TABLE scores ADD COLUMN IF NOT EXISTS no_return BOOLEAN NOT NULL DEFAULT false;

-- Update the stableford trigger to force 0 points on NR holes
CREATE OR REPLACE FUNCTION calculate_stableford()
RETURNS TRIGGER AS $$
DECLARE
  v_par              SMALLINT;
  v_stroke_index     SMALLINT;
  v_playing_handicap SMALLINT;
  v_shots_received   SMALLINT;
  v_net_score        SMALLINT;
BEGIN
  -- No Return always scores 0
  IF NEW.no_return THEN
    NEW.stableford_points := 0;
    RETURN NEW;
  END IF;

  SELECT par, stroke_index
    INTO v_par, v_stroke_index
    FROM holes
   WHERE id = NEW.hole_id;

  SELECT playing_handicap
    INTO v_playing_handicap
    FROM round_handicaps
   WHERE round_id = NEW.round_id
     AND player_id = NEW.player_id;

  v_shots_received := FLOOR(v_playing_handicap::numeric / 18)::smallint
                    + CASE WHEN v_stroke_index <= (v_playing_handicap % 18) THEN 1 ELSE 0 END;

  v_net_score := NEW.gross_score - v_shots_received;
  NEW.stableford_points := GREATEST(0, v_par + 2 - v_net_score);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
