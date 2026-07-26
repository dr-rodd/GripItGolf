-- Add course-specific tees for platform courses that have no tee data yet.
-- Tee names match the physical marker colours used at each course.
-- slope=113 / course_rating=par are placeholders until real slope/CR values are sourced.
--
-- Courses already seeded with real tee data (Rosapenna, Old Tom Morris)
-- are excluded by the NOT EXISTS guard.

INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT
  c.id,
  spec.tee_name,
  spec.gender,
  CASE WHEN spec.gender = 'M'
    THEN COALESCE((SELECT SUM(h.par)        FROM holes h WHERE h.course_id = c.id), 72)
    ELSE COALESCE((SELECT SUM(h.par_ladies) FROM holes h WHERE h.course_id = c.id), 72)
  END,
  CASE WHEN spec.gender = 'M'
    THEN COALESCE((SELECT SUM(h.par)        FROM holes h WHERE h.course_id = c.id), 72)
    ELSE COALESCE((SELECT SUM(h.par_ladies) FROM holes h WHERE h.course_id = c.id), 72)
  END,
  113
FROM (VALUES
  -- ── Championship courses: Black (scratch) + Yellow (standard) ─────────────
  ('adare-manor',                    'Black',  'M'),
  ('adare-manor',                    'Yellow', 'M'),
  ('adare-manor',                    'Red',    'F'),

  ('ballybunion-old',                'Black',  'M'),
  ('ballybunion-old',                'Yellow', 'M'),
  ('ballybunion-old',                'Red',    'F'),

  ('ballyliffin-glashedy-links',     'Black',  'M'),
  ('ballyliffin-glashedy-links',     'Yellow', 'M'),
  ('ballyliffin-glashedy-links',     'Red',    'F'),

  ('lahinch-old',                    'Black',  'M'),
  ('lahinch-old',                    'Yellow', 'M'),
  ('lahinch-old',                    'Red',    'F'),

  ('old-head',                       'Black',  'M'),
  ('old-head',                       'Yellow', 'M'),
  ('old-head',                       'Red',    'F'),

  ('royal-county-down-championship', 'Black',  'M'),
  ('royal-county-down-championship', 'Yellow', 'M'),
  ('royal-county-down-championship', 'Red',    'F'),

  ('tralee',                         'Black',  'M'),
  ('tralee',                         'Yellow', 'M'),
  ('tralee',                         'Red',    'F'),

  ('waterville',                     'Black',  'M'),
  ('waterville',                     'Yellow', 'M'),
  ('waterville',                     'Red',    'F'),

  -- ── Portmarnock: Blue as the medal tee ───────────────────────────────────
  ('portmarnock-championship',       'Blue',   'M'),
  ('portmarnock-championship',       'Yellow', 'M'),
  ('portmarnock-championship',       'Red',    'F'),

  -- ── Royal Portrush Dunluce (Open venue): three men's options ─────────────
  ('royal-portrush-dunluce',         'Black',  'M'),
  ('royal-portrush-dunluce',         'Blue',   'M'),
  ('royal-portrush-dunluce',         'Yellow', 'M'),
  ('royal-portrush-dunluce',         'Red',    'F'),

  -- ── Standard links: Yellow (visitors) + White (medal) ────────────────────
  ('ballyliffin-old',                'Yellow', 'M'),
  ('ballyliffin-old',                'White',  'M'),
  ('ballyliffin-old',                'Red',    'F'),

  ('carne-wild-atlantic-dunes',      'Yellow', 'M'),
  ('carne-wild-atlantic-dunes',      'White',  'M'),
  ('carne-wild-atlantic-dunes',      'Red',    'F'),

  ('county-louth',                   'Yellow', 'M'),
  ('county-louth',                   'White',  'M'),
  ('county-louth',                   'Red',    'F'),

  ('county-sligo-colt-championship', 'Yellow', 'M'),
  ('county-sligo-colt-championship', 'White',  'M'),
  ('county-sligo-colt-championship', 'Red',    'F'),

  ('donegal',                        'Yellow', 'M'),
  ('donegal',                        'White',  'M'),
  ('donegal',                        'Red',    'F'),

  ('enniscrone-dunes',               'Yellow', 'M'),
  ('enniscrone-dunes',               'White',  'M'),
  ('enniscrone-dunes',               'Red',    'F'),

  ('narin-portnoo',                  'Yellow', 'M'),
  ('narin-portnoo',                  'White',  'M'),
  ('narin-portnoo',                  'Red',    'F'),

  ('portsalon',                      'Yellow', 'M'),
  ('portsalon',                      'White',  'M'),
  ('portsalon',                      'Red',    'F'),

  ('portstewart-strand',             'Yellow', 'M'),
  ('portstewart-strand',             'White',  'M'),
  ('portstewart-strand',             'Red',    'F'),

  ('royal-dublin',                   'Yellow', 'M'),
  ('royal-dublin',                   'White',  'M'),
  ('royal-dublin',                   'Red',    'F'),

  ('royal-portrush-valley',          'Yellow', 'M'),
  ('royal-portrush-valley',          'White',  'M'),
  ('royal-portrush-valley',          'Red',    'F'),

  ('the-island',                     'Yellow', 'M'),
  ('the-island',                     'White',  'M'),
  ('the-island',                     'Red',    'F'),

  ('trump-international-doonbeg',    'Yellow', 'M'),
  ('trump-international-doonbeg',    'White',  'M'),
  ('trump-international-doonbeg',    'Red',    'F')

) AS spec(slug, tee_name, gender)
JOIN courses c ON c.slug = spec.slug AND c.trip_id IS NULL
WHERE NOT EXISTS (SELECT 1 FROM tees te WHERE te.course_id = c.id);
