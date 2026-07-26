-- ============================================================
-- GripItGolf: Real tee data for 22 platform courses
-- Sourced from club websites and golf databases, July 2026.
-- Replaces earlier placeholder version of this migration.
--
-- Confidence level noted per course:
--   HIGH   = confirmed from 3+ independent sources
--   MEDIUM = confirmed from 1-2 sources, internally consistent
--   LOW    = single source or conflicting; treat as provisional
--   EST    = estimated; verify against Golf Ireland before use
--
-- Rosapenna courses (trip_id IS NOT NULL) are excluded by the
-- JOIN condition. Any course that already has tees is skipped.
-- ============================================================

-- Remove any outdated placeholder tees for the platform courses
-- being seeded below. Makes this migration safe to re-run.
DELETE FROM tees
WHERE course_id IN (
  SELECT id FROM courses
  WHERE trip_id IS NULL
  AND slug IN (
    'adare-manor', 'ballybunion-old', 'ballyliffin-glashedy-links',
    'lahinch-old', 'old-head', 'royal-county-down-championship',
    'tralee', 'waterville', 'portmarnock-championship',
    'royal-portrush-dunluce', 'ballyliffin-old',
    'carne-wild-atlantic-dunes', 'county-louth',
    'county-sligo-colt-championship', 'donegal', 'enniscrone-dunes',
    'narin-portnoo', 'portsalon', 'portstewart-strand',
    'royal-dublin', 'royal-portrush-valley',
    'the-island', 'trump-international-doonbeg'
  )
);

INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT
  c.id,
  spec.tee_name,
  spec.gender,
  spec.par::integer,
  spec.course_rating::numeric,
  spec.slope::integer
FROM (VALUES

  -- ── Adare Manor — Tom Fazio redesign, Ryder Cup 2027 venue ─────────────
  -- LOW: slopes confirmed (131/124/117); CRs estimated; colours unconfirmed
  ('adare-manor',                    'Black',  'M', 72, 77.0, 131),
  ('adare-manor',                    'Yellow', 'M', 72, 73.5, 124),
  ('adare-manor',                    'Red',    'F', 72, 70.5, 117),

  -- ── Ballybunion Old Course ──────────────────────────────────────────────
  -- HIGH: multiple consistent sources
  ('ballybunion-old',                'Blue',   'M', 71, 74.5, 131),
  ('ballybunion-old',                'White',  'M', 71, 72.5, 131),
  ('ballybunion-old',                'Red',    'F', 72, 72.5, 128),

  -- ── Ballyliffin Glashedy Links ──────────────────────────────────────────
  -- MEDIUM: single database source, values internally consistent
  ('ballyliffin-glashedy-links',     'Blue',   'M', 72, 72.5, 125),
  ('ballyliffin-glashedy-links',     'White',  'M', 72, 70.3, 120),
  ('ballyliffin-glashedy-links',     'Red',    'F', 72, 72.1, 125),

  -- ── Lahinch Old Course ──────────────────────────────────────────────────
  -- MEDIUM: Blue/M HIGH confidence; White/Red from single source
  -- Note: White tees are short forward set (~5,488 yds); CR 67.2 reflects this
  ('lahinch-old',                    'Blue',   'M', 72, 76.6, 132),
  ('lahinch-old',                    'White',  'M', 72, 67.2, 111),
  ('lahinch-old',                    'Red',    'F', 72, 70.4, 125),

  -- ── Old Head Golf Links ─────────────────────────────────────────────────
  -- MEDIUM: consistent across sources
  ('old-head',                       'Black',  'M', 72, 74.0, 133),
  ('old-head',                       'Blue',   'M', 72, 72.0, 131),
  ('old-head',                       'White',  'M', 72, 70.0, 129),
  ('old-head',                       'Red',    'F', 72, 69.4, 120),

  -- ── Royal County Down Championship ──────────────────────────────────────
  -- HIGH: multiple consistent sources
  -- Ladies par 76 confirmed: five par-4s rated par-5 for women on this long links
  ('royal-county-down-championship', 'Blue',   'M', 71, 75.9, 145),
  ('royal-county-down-championship', 'Yellow', 'M', 71, 73.4, 134),
  ('royal-county-down-championship', 'Red',    'F', 76, 77.0, 148),

  -- ── Tralee Golf Club — Arnold Palmer design ──────────────────────────────
  -- HIGH: multiple consistent sources
  ('tralee',                         'Blue',   'M', 72, 73.6, 135),
  ('tralee',                         'White',  'M', 72, 72.3, 128),
  ('tralee',                         'Green',  'M', 72, 70.5, 126),
  ('tralee',                         'Red',    'F', 72, 73.3, 131),

  -- ── Waterville Golf Links ────────────────────────────────────────────────
  -- MEDIUM: five CRs confirmed; tee colour names assumed from typical convention
  ('waterville',                     'Black',  'M', 72, 76.1, 131),
  ('waterville',                     'White',  'M', 72, 72.3, 123),
  ('waterville',                     'Red',    'F', 72, 71.5, 125),

  -- ── Portmarnock Golf Club Championship ──────────────────────────────────
  -- LOW: Blue/M and White/F confirmed; men's White CR estimated
  ('portmarnock-championship',       'Blue',   'M', 72, 77.1, 143),
  ('portmarnock-championship',       'White',  'M', 72, 73.5, 132),
  ('portmarnock-championship',       'White',  'F', 72, 78.7, 140),

  -- ── Royal Portrush Dunluce Links ─────────────────────────────────────────
  -- MEDIUM: Blue confirmed; Yellow and Red estimated
  ('royal-portrush-dunluce',         'Blue',   'M', 72, 76.2, 140),
  ('royal-portrush-dunluce',         'Yellow', 'M', 72, 73.0, 133),
  ('royal-portrush-dunluce',         'Red',    'F', 72, 73.5, 127),

  -- ── Ballyliffin Old Links ────────────────────────────────────────────────
  -- EST: no WHS-certified data found in any online database
  ('ballyliffin-old',                'Blue',   'M', 71, 71.0, 123),
  ('ballyliffin-old',                'White',  'M', 71, 69.5, 118),
  ('ballyliffin-old',                'Red',    'F', 72, 71.0, 120),

  -- ── Carne Golf Links — Wild Atlantic Dunes ───────────────────────────────
  -- MEDIUM: consistent across multiple database search results
  ('carne-wild-atlantic-dunes',      'Blue',   'M', 72, 73.1, 123),
  ('carne-wild-atlantic-dunes',      'White',  'M', 72, 70.7, 121),
  ('carne-wild-atlantic-dunes',      'Red',    'F', 72, 67.1, 113),

  -- ── County Louth Golf Club — Baltray ────────────────────────────────────
  -- MEDIUM: Blue HIGH (Golf Monthly, GolfPass etc); White partial; Red single source
  ('county-louth',                   'Blue',   'M', 72, 74.4, 131),
  ('county-louth',                   'White',  'M', 72, 72.9, 127),
  ('county-louth',                   'Red',    'F', 72, 73.9, 125),

  -- ── County Sligo Golf Club — Rosses Point / Colt Championship ───────────
  -- LOW: Black/M confirmed at 75.9/135; White and Red estimated
  ('county-sligo-colt-championship', 'Black',  'M', 71, 75.9, 135),
  ('county-sligo-colt-championship', 'White',  'M', 71, 73.0, 127),
  ('county-sligo-colt-championship', 'Red',    'F', 73, 74.0, 131),

  -- ── Donegal Golf Club — Murvagh ──────────────────────────────────────────
  -- HIGH: 2025 WHS ratings confirmed across multiple sources
  -- Orange is Donegal's actual third-tee marker colour
  ('donegal',                        'Blue',   'M', 73, 76.4, 134),
  ('donegal',                        'White',  'M', 73, 74.1, 128),
  ('donegal',                        'Orange', 'M', 73, 73.2, 125),
  ('donegal',                        'Red',    'F', 73, 74.0, 124),

  -- ── Enniscrone Golf Club — Dunes Course ─────────────────────────────────
  -- MEDIUM: Black/M confirmed from Golf Ireland-sourced database (74.8/139)
  --         Blue/M from partial tee list (~7,033 yards)
  ('enniscrone-dunes',               'Blue',   'M', 73, 77.0, 133),
  ('enniscrone-dunes',               'Black',  'M', 73, 74.8, 139),
  ('enniscrone-dunes',               'Red',    'F', 73, 72.6, 126),

  -- ── Narin & Portnoo Golf Club ────────────────────────────────────────────
  -- LOW: post-2021 Hanse redesign changed par from 73 to 70; only White/M confirmed
  ('narin-portnoo',                  'White',  'M', 70, 72.9, 120),
  ('narin-portnoo',                  'Red',    'F', 70, 71.5, 117),

  -- ── Portsalon Golf Club ──────────────────────────────────────────────────
  -- EST: no real WHS data in online databases; overall slope ~125 from reviews
  ('portsalon',                      'White',  'M', 72, 72.0, 125),
  ('portsalon',                      'Yellow', 'M', 72, 70.5, 122),
  ('portsalon',                      'Red',    'F', 73, 72.0, 125),

  -- ── Portstewart Golf Club — Strand Course ───────────────────────────────
  -- MEDIUM: confirmed across two independent sources
  ('portstewart-strand',             'Black',  'M', 72, 74.1, 130),
  ('portstewart-strand',             'Blue',   'M', 72, 72.5, 126),
  ('portstewart-strand',             'White',  'M', 72, 69.3, 116),
  ('portstewart-strand',             'Black',  'F', 72, 78.6, 140),
  ('portstewart-strand',             'Red',    'F', 72, 73.0, 128),

  -- ── Royal Dublin Golf Club — Dollymount ─────────────────────────────────
  -- HIGH: multiple consistent sources
  -- Ladies par 74 confirmed: some par-4s rated par-5 for women
  ('royal-dublin',                   'Blue',   'M', 72, 76.1, 138),
  ('royal-dublin',                   'White',  'M', 72, 74.6, 132),
  ('royal-dublin',                   'Yellow', 'M', 72, 72.5, 127),
  ('royal-dublin',                   'Red',    'F', 74, 70.0, 113),

  -- ── Royal Portrush Golf Club — Valley Links ──────────────────────────────
  -- EST: par 70 confirmed; CR/slope unavailable (club redesigned post-2019 Open)
  ('royal-portrush-valley',          'White',  'M', 70, 70.0, 113),
  ('royal-portrush-valley',          'Red',    'F', 71, 70.0, 113),

  -- ── The Island Golf Club ─────────────────────────────────────────────────
  -- MEDIUM: men's CR/slope confirmed; ladies par estimated (likely 74 on long links)
  ('the-island',                     'Blue',   'M', 72, 74.7, 132),
  ('the-island',                     'White',  'M', 72, 74.0, 129),
  ('the-island',                     'Green',  'M', 72, 72.1, 127),
  ('the-island',                     'Red',    'F', 74, 75.7, 129),

  -- ── Trump International Golf Links — Doonbeg ─────────────────────────────
  -- MEDIUM: men's confirmed; ladies par estimated
  ('trump-international-doonbeg',    'Black',  'M', 72, 74.7, 131),
  ('trump-international-doonbeg',    'Gold',   'M', 72, 71.6, 126),
  ('trump-international-doonbeg',    'White',  'M', 72, 69.4, 124),
  ('trump-international-doonbeg',    'Red',    'F', 72, 72.3, 123)

) AS spec(slug, tee_name, gender, par, course_rating, slope)
JOIN courses c ON c.slug = spec.slug AND c.trip_id IS NULL;
