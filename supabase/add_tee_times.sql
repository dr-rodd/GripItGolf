-- ============================================================
-- TEE TIMES
-- day_number: 1=Thursday (Old Tom Morris)
--             2=Friday (St Patricks Links)
--             3=Saturday (Sandy Hills Links)
-- group_number: 1/2/3 maps to tee time slot in that day
-- ============================================================

CREATE TABLE tee_times (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_number   SMALLINT NOT NULL CHECK (day_number BETWEEN 1 AND 3),
  group_number SMALLINT NOT NULL CHECK (group_number BETWEEN 1 AND 3),
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each player appears at most once per day
  CONSTRAINT uq_tee_times_day_player UNIQUE (day_number, player_id)
);

CREATE INDEX idx_tee_times_day ON tee_times(day_number);
