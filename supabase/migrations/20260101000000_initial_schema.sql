-- ============================================================
-- GripItGolf Initial Schema
-- Multi-trip golf platform
-- ============================================================

-- TRIPS
create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

-- TEAMS (scoped to a trip)
create table teams (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  color text not null default '#888888',
  created_at timestamptz not null default now()
);

-- PLAYERS (scoped to a trip)
create table players (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  name text not null,
  role text not null default 'player' check (role in ('dad', 'mum', 'child', 'player')),
  handicap numeric(4,1) not null default 0,
  created_at timestamptz not null default now()
);

-- COURSES (scoped to a trip)
create table courses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  slug text not null,
  location text,
  created_at timestamptz not null default now(),
  unique (trip_id, slug)
);

-- HOLES (18 per course)
create table holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  par int not null check (par between 3 and 5),
  stroke_index int not null check (stroke_index between 1 and 18),
  unique (course_id, hole_number)
);

-- ROUNDS (links a course to a round number within a trip)
create table rounds (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  round_number int not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  created_at timestamptz not null default now(),
  unique (trip_id, round_number),
  unique (trip_id, course_id)
);

-- ROUND HANDICAPS (snapshot per player per round)
create table round_handicaps (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  playing_handicap numeric(4,1) not null,
  unique (round_id, player_id)
);

-- SCORES (one row per player/hole/round)
create table scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  hole_id uuid not null references holes(id) on delete cascade,
  gross_score int,
  stableford_points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id, hole_id)
);

-- ============================================================
-- LIVE SCORING TABLES
-- ============================================================

create table live_rounds (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  started_at timestamptz not null default now(),
  session_finalised_at timestamptz,
  unique (round_id, player_id)
);

create table live_scores (
  id uuid primary key default gen_random_uuid(),
  live_round_id uuid not null references live_rounds(id) on delete cascade,
  hole_id uuid not null references holes(id) on delete cascade,
  gross_score int,
  updated_at timestamptz not null default now(),
  unique (live_round_id, hole_id)
);

create table live_player_locks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  locked_at timestamptz not null default now(),
  unique (round_id, player_id)
);

-- ============================================================
-- STABLEFORD TRIGGER
-- ============================================================

create or replace function calculate_stableford()
returns trigger as $$
declare
  v_par int;
  v_stroke_index int;
  v_playing_handicap numeric(4,1);
  v_shots_received int;
  v_net_score int;
  v_points int;
begin
  -- get hole details
  select par, stroke_index into v_par, v_stroke_index
  from holes where id = new.hole_id;

  -- get playing handicap snapshot
  select playing_handicap into v_playing_handicap
  from round_handicaps
  where round_id = new.round_id and player_id = new.player_id;

  if new.gross_score is null or v_playing_handicap is null then
    new.stableford_points := 0;
    return new;
  end if;

  v_shots_received := floor(v_playing_handicap / 18)::int
    + case when v_stroke_index <= mod(v_playing_handicap::int, 18) then 1 else 0 end;

  v_net_score := new.gross_score - v_shots_received;
  v_points := greatest(0, v_par + 2 - v_net_score);

  new.stableford_points := v_points;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_scores_stableford
before insert or update on scores
for each row execute function calculate_stableford();

-- ============================================================
-- VIEWS
-- ============================================================

create or replace view leaderboard_by_round as
select
  r.trip_id,
  r.id as round_id,
  r.round_number,
  t.id as team_id,
  t.name as team_name,
  t.color as team_color,
  h.hole_number,
  max(s.stableford_points) as best_points,
  sum(max(s.stableford_points)) over (
    partition by r.id, t.id
    order by h.hole_number
    rows between unbounded preceding and current row
  ) as running_team_total
from rounds r
join scores s on s.round_id = r.id
join players p on p.id = s.player_id
join teams t on t.id = p.team_id
join holes h on h.id = s.hole_id
where p.team_id is not null
group by r.trip_id, r.id, r.round_number, t.id, t.name, t.color, h.hole_number;

create or replace view leaderboard_summary as
select
  r.trip_id,
  r.id as round_id,
  r.round_number,
  t.id as team_id,
  t.name as team_name,
  t.color as team_color,
  sum(s.stableford_points) as total_points
from rounds r
join scores s on s.round_id = r.id
join players p on p.id = s.player_id
join teams t on t.id = p.team_id
where p.team_id is not null
group by r.trip_id, r.id, r.round_number, t.id, t.name, t.color
order by total_points desc;
