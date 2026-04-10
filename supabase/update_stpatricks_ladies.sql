ALTER TABLE holes ADD COLUMN IF NOT EXISTS stroke_index_ladies integer;
ALTER TABLE holes ADD COLUMN IF NOT EXISTS par_ladies integer;

UPDATE tees SET par = 72 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND gender = 'F';

UPDATE holes SET stroke_index_ladies = 7,  par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 1;
UPDATE holes SET stroke_index_ladies = 11, par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 2;
UPDATE holes SET stroke_index_ladies = 17, par_ladies = 3 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 3;
UPDATE holes SET stroke_index_ladies = 3,  par_ladies = 5 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 4;
UPDATE holes SET stroke_index_ladies = 13, par_ladies = 3 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 5;
UPDATE holes SET stroke_index_ladies = 1,  par_ladies = 5 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 6;
UPDATE holes SET stroke_index_ladies = 9,  par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 7;
UPDATE holes SET stroke_index_ladies = 15, par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 8;
UPDATE holes SET stroke_index_ladies = 5,  par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 9;
UPDATE holes SET stroke_index_ladies = 6,  par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 10;
UPDATE holes SET stroke_index_ladies = 4,  par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 11;
UPDATE holes SET stroke_index_ladies = 2,  par_ladies = 5 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 12;
UPDATE holes SET stroke_index_ladies = 12, par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 13;
UPDATE holes SET stroke_index_ladies = 10, par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 14;
UPDATE holes SET stroke_index_ladies = 18, par_ladies = 3 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 15;
UPDATE holes SET stroke_index_ladies = 8,  par_ladies = 5 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 16;
UPDATE holes SET stroke_index_ladies = 16, par_ladies = 3 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 17;
UPDATE holes SET stroke_index_ladies = 14, par_ladies = 4 WHERE course_id = '11111111-0000-0000-0000-000000000003' AND hole_number = 18;
