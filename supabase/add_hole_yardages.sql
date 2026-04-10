CREATE TABLE hole_tee_yardages (
  hole_id  UUID     NOT NULL REFERENCES holes(id) ON DELETE CASCADE,
  tee_id   UUID     NOT NULL REFERENCES tees(id)  ON DELETE CASCADE,
  yardage  SMALLINT NOT NULL CHECK (yardage > 0),
  PRIMARY KEY (hole_id, tee_id)
);
