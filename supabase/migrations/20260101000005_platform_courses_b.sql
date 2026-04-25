-- ============================================================
-- Platform courses batch B: courses 13–25 of 25 + Old Tom Morris
-- (Portmarnock Championship through Waterville, plus Old Tom Morris
--  sourced from migration 20260101000002_seed_courses.sql)
-- For the three Rosapenna courses, 000002 hole data is authoritative.
-- ============================================================

-- ============================================================
-- COURSES
-- ============================================================

INSERT INTO courses (trip_id, name, slug, location, ladies_data_verified, ladies_data_note) VALUES
  (NULL, 'Portmarnock Golf Club -- Championship Course', 'portmarnock-championship',       'Portmarnock, Dublin, Ireland',              false, 'Ladies tee stroke index unverified — please check with the club before play'),
  (NULL, 'Portsalon Golf Club',                          'portsalon',                      'Fanad, Donegal, Ireland',                   true,  NULL),
  (NULL, 'Portstewart Golf Club -- The Strand Course',   'portstewart-strand',             'Portstewart, Londonderry, Northern Ireland', true,  NULL),
  (NULL, 'Rosapenna Golf Resort -- Sandy Hills Links',   'rosapenna-sandy-hills',          'Downings, Donegal, Ireland',                true,  NULL),
  (NULL, 'Rosapenna Golf Resort -- St Patricks Links',   'rosapenna-st-patricks',          'Downings, Donegal, Ireland',                true,  NULL),
  (NULL, 'Royal County Down Golf Club -- Championship',  'royal-county-down-championship', 'Newcastle, Down, Northern Ireland',         true,  NULL),
  (NULL, 'The Royal Dublin Golf Club',                   'royal-dublin',                   'Dollymount, Dublin, Ireland',               true,  NULL),
  (NULL, 'Royal Portrush Golf Club -- Dunluce Links',    'royal-portrush-dunluce',         'Portrush, Antrim, Northern Ireland',        true,  NULL),
  (NULL, 'Royal Portrush Golf Club -- Valley Links',     'royal-portrush-valley',          'Portrush, Antrim, Northern Ireland',        false, 'Ladies tee stroke index unverified — please check with the club before play'),
  (NULL, 'The Island Golf Club',                         'the-island',                     'Donabate, Dublin, Ireland',                 false, 'Ladies tee stroke index unverified — please check with the club before play'),
  (NULL, 'Tralee Golf Club',                             'tralee',                         'Ardfert, Tralee, Kerry, Ireland',           true,  NULL),
  (NULL, 'Trump International Golf Links -- Doonbeg',    'trump-international-doonbeg',    'Doonbeg, Clare, Ireland',                   true,  NULL),
  (NULL, 'Waterville Golf Links',                        'waterville',                     'Waterville, Kerry, Ireland',                true,  NULL),
  (NULL, 'Old Tom Morris',                               'old-tom-morris',                 'Rosapenna Resort, Co. Donegal',             true,  NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- HOLES
-- (hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
-- ============================================================

-- Portmarnock Championship (par 72 men / ladies same SI — partial)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  7::int, 4::int,  7::int),
  ( 2,      4,       15,     4,       15),
  ( 3,      4,       13,     4,       13),
  ( 4,      4,        1,     4,        1),
  ( 5,      4,        9,     4,        9),
  ( 6,      5,        5,     5,        5),
  ( 7,      3,       17,     3,       17),
  ( 8,      4,       11,     4,       11),
  ( 9,      4,        3,     4,        3),
  (10,      4,       12,     4,       12),
  (11,      4,        6,     4,        6),
  (12,      3,       16,     3,       16),
  (13,      5,       14,     5,       14),
  (14,      4,        2,     4,        2),
  (15,      3,        8,     3,        8),
  (16,      5,       18,     5,       18),
  (17,      4,        4,     4,        4),
  (18,      4,       10,     4,       10)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'portmarnock-championship' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Portsalon (par 72 men / 75 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 11::int, 4::int, 11::int),
  ( 2,      4,        3,     5,        3),
  ( 3,      4,       13,     4,       13),
  ( 4,      5,       17,     5,       17),
  ( 5,      3,        9,     3,        9),
  ( 6,      4,        1,     5,        1),
  ( 7,      4,        7,     4,        7),
  ( 8,      5,       15,     5,       15),
  ( 9,      4,        5,     4,        5),
  (10,      3,       18,     3,       18),
  (11,      5,       10,     5,       10),
  (12,      3,       12,     3,       12),
  (13,      4,       14,     4,       14),
  (14,      4,        2,     4,        2),
  (15,      3,       16,     3,       16),
  (16,      4,        6,     4,        6),
  (17,      5,        8,     5,        8),
  (18,      4,        4,     5,        4)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'portsalon' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Portstewart Strand (par 72 men / 73 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 11::int, 4::int,  7::int),
  ( 2,      4,        7,     4,        1),
  ( 3,      3,       13,     3,       17),
  ( 4,      5,        5,     5,        9),
  ( 5,      4,        1,     4,        3),
  ( 6,      3,       15,     3,       13),
  ( 7,      5,       17,     5,       11),
  ( 8,      4,        3,     4,        5),
  ( 9,      4,        9,     4,       15),
  (10,      4,       10,     4,        2),
  (11,      4,        4,     4,       14),
  (12,      3,       18,     3,       18),
  (13,      5,       16,     5,        6),
  (14,      5,       12,     5,        8),
  (15,      3,       14,     3,       16),
  (16,      4,        6,     4,        4),
  (17,      4,        2,     5,       12),
  (18,      4,        8,     4,       10)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'portstewart-strand' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Rosapenna Sandy Hills (par 72 men / 71 ladies — authoritative data from 000002)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 5::int, 13::int, 4::int,  5::int),
  ( 2,      4,        3,     4,       13),
  ( 3,      3,       17,     3,        7),
  ( 4,      4,       11,     4,       11),
  ( 5,      4,        5,     4,        1),
  ( 6,      4,        1,     4,       15),
  ( 7,      3,       15,     3,       17),
  ( 8,      5,        9,     5,        9),
  ( 9,      4,        7,     4,        3),
  (10,      4,        6,     4,       12),
  (11,      3,       12,     3,       10),
  (12,      4,       10,     4,       16),
  (13,      5,        8,     5,        2),
  (14,      4,       18,     4,       18),
  (15,      4,        2,     4,        8),
  (16,      3,       14,     3,       14),
  (17,      5,       16,     5,        4),
  (18,      4,        4,     4,        6)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'rosapenna-sandy-hills' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Rosapenna St Patricks Links (par 71 men / 72 ladies — authoritative data from 000002)
-- Hole 16 plays as par 5 from ladies tees.
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  9::int, 4::int,  7::int),
  ( 2,      4,       11,     4,       11),
  ( 3,      3,       17,     3,       17),
  ( 4,      5,        5,     5,        3),
  ( 5,      3,       13,     3,       13),
  ( 6,      5,        7,     5,        1),
  ( 7,      4,        3,     4,        9),
  ( 8,      4,       15,     4,       15),
  ( 9,      4,        1,     4,        5),
  (10,      4,        8,     4,        6),
  (11,      4,        6,     4,        4),
  (12,      5,        4,     5,        2),
  (13,      4,       12,     4,       12),
  (14,      4,       10,     4,       10),
  (15,      3,       18,     3,       18),
  (16,      4,        2,     5,        8),
  (17,      3,       14,     3,       16),
  (18,      4,       16,     4,       14)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'rosapenna-st-patricks' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Royal County Down Championship (par 71 men / 76 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 5::int, 13::int, 5::int, 13::int),
  ( 2,      4,        9,     4,        3),
  ( 3,      4,        3,     5,        9),
  ( 4,      3,       15,     3,       15),
  ( 5,      4,        7,     4,        7),
  ( 6,      4,       11,     4,        1),
  ( 7,      3,       17,     3,       17),
  ( 8,      4,        1,     5,        5),
  ( 9,      4,        5,     5,       11),
  (10,      3,       18,     3,       16),
  (11,      4,        8,     4,        2),
  (12,      5,       16,     5,        8),
  (13,      4,        2,     5,       12),
  (14,      3,       12,     3,       14),
  (15,      4,        4,     5,        4),
  (16,      4,       14,     4,       18),
  (17,      4,       10,     4,        6),
  (18,      5,        6,     5,       10)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'royal-county-down-championship' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- The Royal Dublin Golf Club (par 72 men / 74 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 10::int, 4::int,  6::int),
  ( 2,      5,       18,     5,       13),
  ( 3,      4,        8,     4,       17),
  ( 4,      3,       16,     3,        9),
  ( 5,      4,        2,     5,       16),
  ( 6,      5,        6,     5,        5),
  ( 7,      3,       12,     3,       15),
  ( 8,      4,        4,     4,        7),
  ( 9,      3,       14,     3,       10),
  (10,      4,        1,     4,        1),
  (11,      5,       11,     5,       14),
  (12,      3,       15,     3,        8),
  (13,      4,        3,     5,       11),
  (14,      5,       13,     4,        2),
  (15,      4,        7,     4,        4),
  (16,      4,       17,     4,       18),
  (17,      4,        9,     4,        3),
  (18,      4,        5,     5,       12)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'royal-dublin' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Royal Portrush Dunluce Links (par 72 men / 74 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  7::int, 4::int,  9::int),
  ( 2,      5,       13,     5,        3),
  ( 3,      3,       17,     3,       17),
  ( 4,      4,        1,     5,        7),
  ( 5,      4,       15,     4,       13),
  ( 6,      3,       11,     3,       15),
  ( 7,      5,        5,     5,        1),
  ( 8,      4,        9,     4,       11),
  ( 9,      4,        3,     5,        5),
  (10,      4,       16,     4,       14),
  (11,      5,        8,     5,        4),
  (12,      5,       12,     5,       10),
  (13,      3,       18,     3,       18),
  (14,      4,        2,     4,        2),
  (15,      4,       10,     4,        6),
  (16,      3,        4,     3,       16),
  (17,      4,       14,     4,       12),
  (18,      4,        6,     4,        8)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'royal-portrush-dunluce' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Royal Portrush Valley Links (par 71 — ladies SI not published, fallback to mens)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 11::int, 4::int, 11::int),
  ( 2,      4,        7,     4,        7),
  ( 3,      3,       15,     3,       15),
  ( 4,      5,        9,     5,        9),
  ( 5,      4,        1,     4,        1),
  ( 6,      4,        5,     4,        5),
  ( 7,      4,       13,     4,       13),
  ( 8,      5,        3,     5,        3),
  ( 9,      3,       17,     3,       17),
  (10,      4,        2,     4,        2),
  (11,      5,       10,     5,       10),
  (12,      4,        4,     4,        4),
  (13,      3,       18,     3,       18),
  (14,      4,       12,     4,       12),
  (15,      3,       16,     3,       16),
  (16,      5,        8,     5,        8),
  (17,      3,        6,     3,        6),
  (18,      4,       14,     4,       14)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'royal-portrush-valley' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- The Island Golf Club (par 72 — official card uses single SI column for all tees)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  4::int, 4::int,  4::int),
  ( 2,      4,        8,     4,        8),
  ( 3,      5,       16,     5,       16),
  ( 4,      3,       14,     3,       14),
  ( 5,      4,        6,     4,        6),
  ( 6,      4,       18,     4,       18),
  ( 7,      4,       12,     4,       12),
  ( 8,      4,       10,     4,       10),
  ( 9,      4,        2,     4,        2),
  (10,      5,        9,     5,        9),
  (11,      4,       13,     4,       13),
  (12,      4,        3,     4,        3),
  (13,      3,        7,     3,        7),
  (14,      4,       15,     4,       15),
  (15,      5,       17,     5,       17),
  (16,      3,       11,     3,       11),
  (17,      4,        5,     4,        5),
  (18,      4,        1,     4,        1)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'the-island' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Tralee Golf Club (par 72 men / 72 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 12::int, 4::int,  8::int),
  ( 2,      5,        4,     5,        4),
  ( 3,      3,       16,     3,       16),
  ( 4,      4,        8,     4,       14),
  ( 5,      5,        6,     5,       12),
  ( 6,      4,       10,     4,        6),
  ( 7,      3,       18,     3,       18),
  ( 8,      4,        2,     4,        2),
  ( 9,      4,       14,     4,       10),
  (10,      4,        3,     4,        3),
  (11,      5,        7,     5,        7),
  (12,      3,        1,     3,        1),
  (13,      4,       15,     4,       17),
  (14,      4,       11,     4,       15),
  (15,      3,       13,     3,       11),
  (16,      4,        9,     4,       13),
  (17,      5,        5,     5,        5),
  (18,      4,       17,     4,        9)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'tralee' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Trump International Doonbeg (par 72 — mens and ladies SI identical on official card)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 5::int,  3::int, 5::int,  3::int),
  ( 2,      4,       13,     4,       13),
  ( 3,      4,       11,     4,       11),
  ( 4,      5,       15,     5,       15),
  ( 5,      4,        5,     4,        5),
  ( 6,      4,        9,     4,        9),
  ( 7,      3,       17,     3,       17),
  ( 8,      5,        1,     5,        1),
  ( 9,      3,        7,     3,        7),
  (10,      5,        4,     5,        4),
  (11,      3,       12,     3,       12),
  (12,      4,       14,     4,       14),
  (13,      5,       16,     5,       16),
  (14,      3,        8,     3,        8),
  (15,      4,       10,     4,       10),
  (16,      4,        2,     4,        2),
  (17,      3,       18,     3,       18),
  (18,      4,        6,     4,        6)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'trump-international-doonbeg' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Waterville Golf Links (par 72 men / 73 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 11::int, 4::int, 13::int),
  ( 2,      4,        1,     5,       17),
  ( 3,      4,        3,     4,        3),
  ( 4,      3,       17,     3,       15),
  ( 5,      5,       13,     5,        5),
  ( 6,      3,       15,     3,       11),
  ( 7,      4,        7,     4,        9),
  ( 8,      4,        9,     4,        7),
  ( 9,      4,        5,     4,        1),
  (10,      4,        2,     4,        6),
  (11,      5,       12,     5,       12),
  (12,      3,       14,     3,       16),
  (13,      5,       18,     5,       10),
  (14,      4,        4,     4,        4),
  (15,      4,        6,     4,        8),
  (16,      4,       10,     4,        2),
  (17,      3,       16,     3,       18),
  (18,      5,        8,     5,       14)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'waterville' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Old Tom Morris (par 71 men / 71 ladies — authoritative data from 000002)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  6::int, 4::int, 14::int),
  ( 2,      3,       18,     3,       18),
  ( 3,      4,        4,     4,       10),
  ( 4,      4,       12,     4,        2),
  ( 5,      4,        8,     4,        8),
  ( 6,      4,        2,     4,        6),
  ( 7,      3,       16,     3,       16),
  ( 8,      5,       14,     5,        4),
  ( 9,      4,       10,     4,       12),
  (10,      4,        5,     4,        7),
  (11,      4,        1,     5,       13),
  (12,      4,        7,     4,        1),
  (13,      4,       15,     4,       17),
  (14,      3,       13,     3,        9),
  (15,      4,        3,     4,        5),
  (16,      5,       17,     5,       11),
  (17,      3,       11,     3,       15),
  (18,      5,        9,     5,        3)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'old-tom-morris' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;
