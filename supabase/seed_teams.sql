-- Insert 4 teams
INSERT INTO teams (id, name, color) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Team Grady',  '#3B82F6'),
  ('33333333-0000-0000-0000-000000000002', 'Team Martin', '#EC4899'),
  ('33333333-0000-0000-0000-000000000003', 'Team Peters', '#10B981'),
  ('33333333-0000-0000-0000-000000000004', 'Team Paul',   '#F59E0B');

-- Assign players to teams
UPDATE players SET team_id = '33333333-0000-0000-0000-000000000001' WHERE name IN ('John', 'Aisling', 'Ross');
UPDATE players SET team_id = '33333333-0000-0000-0000-000000000002' WHERE name IN ('Martin', 'Eithne', 'Matthew');
UPDATE players SET team_id = '33333333-0000-0000-0000-000000000003' WHERE name IN ('Peter', 'Liz', 'Dave');
UPDATE players SET team_id = '33333333-0000-0000-0000-000000000004' WHERE name IN ('Paul', 'Gillian', 'Sam');
