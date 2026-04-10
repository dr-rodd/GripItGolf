-- Fix unique constraint on tees: allow same name for different genders
-- (e.g. White(M) and White(F) on Old Tom Morris)

ALTER TABLE tees DROP CONSTRAINT uq_tees_course_name;

ALTER TABLE tees ADD CONSTRAINT uq_tees_course_name_gender
  UNIQUE (course_id, name, gender);
