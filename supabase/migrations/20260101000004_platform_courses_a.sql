-- ============================================================
-- Platform courses batch A: courses 1–12 of 25
-- (Adare Manor through Old Head Golf Links)
-- ============================================================

-- Allow platform courses (trip_id = NULL) alongside trip-scoped courses.
ALTER TABLE courses ALTER COLUMN trip_id DROP NOT NULL;

-- Unique slug per platform course (partial index — trip-scoped slugs unconstrained).
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_platform_slug
  ON courses(slug) WHERE trip_id IS NULL;

-- Per-round scheduled date set during trip creation.
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Ladies data quality flags.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS ladies_data_verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS ladies_data_note TEXT;

-- ============================================================
-- COURSES
-- ============================================================

INSERT INTO courses (trip_id, name, slug, location, ladies_data_verified, ladies_data_note) VALUES
  (NULL, 'Adare Manor Golf Course',                     'adare-manor',                    'Adare, Limerick, Ireland',                     true, NULL),
  (NULL, 'Ballybunion Golf Club -- Old Course',         'ballybunion-old',                'Ballybunion, Kerry, Ireland',                  true, NULL),
  (NULL, 'Ballyliffin Golf Club -- Glashedy Links',     'ballyliffin-glashedy-links',     'Ballyliffin, Donegal, Ireland',                true, NULL),
  (NULL, 'Ballyliffin Golf Club -- Old Links',          'ballyliffin-old',                'Ballyliffin, Donegal, Ireland',                true, NULL),
  (NULL, 'Carne Golf Links -- Wild Atlantic Dunes',     'carne-wild-atlantic-dunes',      'Belmullet, Mayo, Ireland',                     true, NULL),
  (NULL, 'County Louth Golf Club',                      'county-louth',                   'Baltray, Drogheda, Louth, Ireland',            true, NULL),
  (NULL, 'County Sligo Golf Club -- Colt Championship', 'county-sligo-colt-championship', 'Rosses Point, Sligo, Ireland',                 true, NULL),
  (NULL, 'Donegal Golf Club',                           'donegal',                        'Murvagh, Laghey, Donegal, Ireland',            true, NULL),
  (NULL, 'Enniscrone Golf Club -- The Dunes',           'enniscrone-dunes',               'Bartragh, Enniscrone, Sligo, Ireland',         true, NULL),
  (NULL, 'Lahinch Golf Club -- Old Course',             'lahinch-old',                    'Lahinch, Clare, Ireland',                      true, NULL),
  (NULL, 'Narin & Portnoo Links',                       'narin-portnoo',                  'Portnoo, Donegal, Ireland',                    true, NULL),
  (NULL, 'Old Head Golf Links',                         'old-head',                       'Kinsale, Cork, Ireland',                       true, NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- HOLES
-- (hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
-- ============================================================

-- Adare Manor (par 72 men / 72 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  5::int, 4::int,  3::int),
  ( 2,      4,        9,     4,        9),
  ( 3,      4,       13,     4,       13),
  ( 4,      3,       17,     3,       17),
  ( 5,      4,        1,     4,        7),
  ( 6,      3,       15,     3,       15),
  ( 7,      5,        7,     5,        5),
  ( 8,      4,        3,     4,       11),
  ( 9,      5,       11,     5,        1),
  (10,      4,       10,     4,       10),
  (11,      3,       14,     3,       16),
  (12,      5,        8,     5,        8),
  (13,      4,        6,     4,        4),
  (14,      4,        4,     4,        6),
  (15,      4,       16,     4,       14),
  (16,      3,       12,     3,       18),
  (17,      4,       18,     4,       12),
  (18,      5,        2,     5,        2)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'adare-manor' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Ballybunion Old (par 71 men / 74 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 11::int, 4::int,  9::int),
  ( 2,      4,        1,     5,        3),
  ( 3,      3,        9,     3,       13),
  ( 4,      5,       17,     5,        5),
  ( 5,      5,       13,     5,       11),
  ( 6,      4,        7,     4,        7),
  ( 7,      4,        5,     4,        1),
  ( 8,      3,       15,     3,       15),
  ( 9,      4,        3,     5,       17),
  (10,      4,       12,     4,       14),
  (11,      4,        2,     4,        2),
  (12,      3,        8,     3,       12),
  (13,      5,       18,     5,        6),
  (14,      3,       14,     3,       10),
  (15,      3,        4,     4,       18),
  (16,      5,       16,     5,       16),
  (17,      4,        6,     4,        4),
  (18,      4,       10,     4,        8)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'ballybunion-old' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Ballyliffin Glashedy Links (par 72 men / 72 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 10::int, 4::int, 10::int),
  ( 2,      4,        2,     4,        2),
  ( 3,      4,        8,     4,        8),
  ( 4,      5,       18,     5,       18),
  ( 5,      3,       16,     3,       16),
  ( 6,      4,       14,     4,       14),
  ( 7,      3,       12,     3,       12),
  ( 8,      4,        6,     4,        6),
  ( 9,      4,        4,     4,        4),
  (10,      4,       17,     4,       11),
  (11,      4,        7,     4,        7),
  (12,      4,        3,     4,        1),
  (13,      5,       11,     5,       13),
  (14,      3,       15,     3,       17),
  (15,      4,        1,     4,        3),
  (16,      4,        5,     4,        9),
  (17,      5,        9,     5,        5),
  (18,      4,       13,     4,       15)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'ballyliffin-glashedy-links' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Ballyliffin Old Links (par 71 men / 71 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 10::int, 4::int, 12::int),
  ( 2,      4,        2,     4,        2),
  ( 3,      4,        6,     4,        6),
  ( 4,      5,       14,     5,       10),
  ( 5,      3,       16,     3,       16),
  ( 6,      4,        8,     4,        4),
  ( 7,      3,       18,     3,       18),
  ( 8,      4,       12,     4,       14),
  ( 9,      4,        4,     4,        8),
  (10,      4,       17,     4,       13),
  (11,      4,        9,     4,        5),
  (12,      3,       13,     3,       17),
  (13,      4,       15,     4,        3),
  (14,      5,        3,     5,        1),
  (15,      4,        1,     4,        9),
  (16,      4,        7,     4,        7),
  (17,      3,       11,     3,       15),
  (18,      5,        5,     5,       11)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'ballyliffin-old' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Carne Wild Atlantic Dunes (par 72 men / 73 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 5::int, 15::int, 5::int, 15::int),
  ( 2,      4,        7,     4,        1),
  ( 3,      4,       11,     4,       17),
  ( 4,      5,        9,     5,        3),
  ( 5,      3,       13,     3,        7),
  ( 6,      4,        3,     4,        5),
  ( 7,      3,       17,     3,       18),
  ( 8,      5,        4,     5,       10),
  ( 9,      4,       12,     4,       11),
  (10,      3,       10,     3,       14),
  (11,      4,        8,     4,        6),
  (12,      4,        2,     4,        4),
  (13,      5,        6,     5,       12),
  (14,      3,       14,     3,        8),
  (15,      4,       18,     4,       13),
  (16,      3,       16,     3,       16),
  (17,      4,        1,     5,        9),
  (18,      5,        5,     5,        2)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'carne-wild-atlantic-dunes' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- County Louth (par 72 men / 75 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  4::int, 4::int,  5::int),
  ( 2,      5,       16,     5,       15),
  ( 3,      5,        8,     5,        3),
  ( 4,      4,       18,     4,       11),
  ( 5,      3,       12,     3,       13),
  ( 6,      5,       14,     5,        9),
  ( 7,      3,       10,     3,        7),
  ( 8,      4,        6,     4,        1),
  ( 9,      4,        2,     5,       17),
  (10,      4,        9,     4,        6),
  (11,      4,        1,     5,       12),
  (12,      4,        3,     4,        4),
  (13,      4,        5,     5,       18),
  (14,      4,       13,     4,       16),
  (15,      3,       17,     3,       14),
  (16,      4,        7,     4,        2),
  (17,      3,       15,     3,        8),
  (18,      5,       11,     5,       10)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'county-louth' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- County Sligo Colt Championship (par 71 men / 75 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  9::int, 5::int, 14::int),
  ( 2,      4,       15,     4,        5),
  ( 3,      5,        8,     5,        3),
  ( 4,      3,       11,     3,       17),
  ( 5,      5,       18,     5,       11),
  ( 6,      4,        6,     4,        6),
  ( 7,      4,        1,     5,        9),
  ( 8,      4,        4,     4,        1),
  ( 9,      3,       13,     3,       16),
  (10,      4,       16,     4,        8),
  (11,      4,        3,     4,        4),
  (12,      5,       14,     5,        7),
  (13,      3,       17,     3,       15),
  (14,      4,        5,     5,       13),
  (15,      4,        7,     4,        2),
  (16,      3,       12,     3,       18),
  (17,      4,        2,     5,       12),
  (18,      4,       10,     4,       10)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'county-sligo-colt-championship' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Donegal Golf Club (par 73 men / 73 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 5::int,  9::int, 5::int,  6::int),
  ( 2,      4,        3,     4,        2),
  ( 3,      3,       11,     3,       18),
  ( 4,      4,        1,     4,        8),
  ( 5,      3,        7,     3,       16),
  ( 6,      5,       17,     5,       10),
  ( 7,      4,       13,     4,       14),
  ( 8,      5,        5,     5,        4),
  ( 9,      4,       15,     4,       12),
  (10,      4,       16,     4,       11),
  (11,      4,        6,     4,       13),
  (12,      5,       14,     5,        3),
  (13,      3,       18,     3,       17),
  (14,      5,        2,     5,        1),
  (15,      4,        8,     4,        9),
  (16,      3,        4,     3,       15),
  (17,      4,       12,     4,        7),
  (18,      4,       10,     4,        5)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'donegal' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Enniscrone Dunes (par 73 men / 73 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  8::int, 4::int,  5::int),
  ( 2,      5,       10,     5,        4),
  ( 3,      3,       16,     3,       15),
  ( 4,      5,       12,     5,        9),
  ( 5,      4,        2,     4,       12),
  ( 6,      4,        4,     4,        7),
  ( 7,      5,       14,     5,        2),
  ( 8,      3,       18,     3,       18),
  ( 9,      4,        6,     4,       10),
  (10,      4,        5,     4,       14),
  (11,      3,       15,     3,       11),
  (12,      4,        3,     4,       16),
  (13,      4,       13,     4,       17),
  (14,      5,        7,     5,        3),
  (15,      4,        1,     4,        1),
  (16,      5,       11,     5,        6),
  (17,      3,       17,     3,       13),
  (18,      4,        9,     4,        8)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'enniscrone-dunes' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Lahinch Old Course (par 72 men / 74 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  8::int, 4::int,  3::int),
  ( 2,      5,       14,     5,        7),
  ( 3,      4,        4,     5,       11),
  ( 4,      5,       18,     5,        9),
  ( 5,      3,       16,     3,       15),
  ( 6,      4,        2,     4,        1),
  ( 7,      4,        6,     4,        5),
  ( 8,      3,       12,     3,       13),
  ( 9,      4,       10,     4,       17),
  (10,      4,        3,     4,        2),
  (11,      3,       13,     3,       18),
  (12,      5,        9,     5,        6),
  (13,      4,       17,     4,       12),
  (14,      4,        5,     5,       10),
  (15,      4,        1,     5,       16),
  (16,      3,       11,     3,       14),
  (17,      4,        7,     4,        8),
  (18,      5,       15,     4,        4)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'lahinch-old' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Narin & Portnoo Links (par 73 men / 73 ladies — same SI on official card)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int,  9::int, 4::int,  9::int),
  ( 2,      5,       15,     5,       15),
  ( 3,      3,       13,     3,       13),
  ( 4,      4,        1,     4,        1),
  ( 5,      4,        7,     4,        7),
  ( 6,      4,        3,     4,        3),
  ( 7,      3,       11,     3,       11),
  ( 8,      4,       17,     4,       17),
  ( 9,      4,        5,     4,        5),
  (10,      5,        2,     5,        2),
  (11,      3,       12,     3,       12),
  (12,      4,        8,     4,        8),
  (13,      5,       16,     5,       16),
  (14,      5,       10,     5,       10),
  (15,      5,        4,     5,        4),
  (16,      3,       18,     3,       18),
  (17,      4,        6,     4,        6),
  (18,      4,       14,     4,       14)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'narin-portnoo' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;

-- Old Head Golf Links (par 72 men / 72 ladies)
INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
SELECT c.id, v.n, v.p, v.s, v.pl, v.sl
FROM (VALUES
  ( 1::int, 4::int, 14::int, 4::int,  6::int),
  ( 2,      4,       10,     4,       14),
  ( 3,      3,       18,     3,       16),
  ( 4,      4,        2,     4,        2),
  ( 5,      4,        8,     4,        8),
  ( 6,      5,        4,     5,       10),
  ( 7,      3,       16,     3,       18),
  ( 8,      5,       12,     5,       12),
  ( 9,      4,        6,     4,        4),
  (10,      5,       11,     5,        9),
  (11,      3,       15,     3,       15),
  (12,      5,        1,     5,        3),
  (13,      3,       13,     3,       11),
  (14,      4,        3,     4,        1),
  (15,      4,       17,     4,       17),
  (16,      3,        9,     3,       13),
  (17,      5,        5,     5,        7),
  (18,      4,        7,     4,        5)
) AS v(n, p, s, pl, sl)
JOIN courses c ON c.slug = 'old-head' AND c.trip_id IS NULL
ON CONFLICT DO NOTHING;
