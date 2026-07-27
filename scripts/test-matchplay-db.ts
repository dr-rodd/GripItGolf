/**
 * Matchplay schema integration test.
 *
 * Generates real brackets, writes them to a Postgres database, and checks that
 * the table's constraints accept everything the generator produces and reject
 * the shapes it must never produce.
 *
 * Needs a throwaway database — it creates and rolls back its own data, but
 * point it at a scratch instance rather than production:
 *
 *   MATCHPLAY_TEST_URL=postgresql://... npx tsx scripts/test-matchplay-db.ts
 *
 * Skips cleanly when that variable is unset, so it never blocks a build.
 */

import { Client } from 'pg'
import { generateBracket, bracketToRows, rowsInInsertOrder, type BracketPlayer } from '../lib/matchplay'

const URL = process.env.MATCHPLAY_TEST_URL
if (!URL) {
  console.log('MATCHPLAY_TEST_URL not set — skipping schema integration test.')
  process.exit(0)
}

let passed = 0, failed = 0
const failures: string[] = []

function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}

/** Expect a write to be refused by a constraint. */
async function rejects(c: Client, sql: string, params: unknown[], label: string) {
  try {
    await c.query('SAVEPOINT sp')
    await c.query(sql, params as never[])
    await c.query('ROLLBACK TO SAVEPOINT sp')
    failed++; failures.push(label)
    console.log(`  FAIL  ${label} (the database accepted it)`)
  } catch {
    await c.query('ROLLBACK TO SAVEPOINT sp')
    passed++
  }
}

async function main() {
  const c = new Client({ connectionString: URL })
  await c.connect()
  await c.query('BEGIN')

  try {
    // A trip to hang everything off
    const trip = await c.query(
      `INSERT INTO trips (name, slug, trip_code, status)
       VALUES ('Matchplay Test', 'matchplay-test', 'MPTEST', 'upcoming') RETURNING id`
    )
    const tripId = trip.rows[0].id as string

    for (const count of [2, 6, 9, 11, 20, 32]) {
      await c.query('SAVEPOINT per_count')

      // Real player rows so the foreign keys have something to point at
      const players: BracketPlayer[] = []
      for (let i = 1; i <= count; i++) {
        const r = await c.query(
          `INSERT INTO players (trip_id, name, handicap, gender, role)
           VALUES ($1, $2, $3, 'M', 'player') RETURNING id`,
          [tripId, `Player ${i}`, 10]
        )
        players.push({ id: r.rows[0].id, name: `Player ${i}` })
      }

      const matches = generateBracket(players)
      const rows = rowsInInsertOrder(bracketToRows(tripId, matches))

      for (const row of rows) {
        await c.query(
          `INSERT INTO matchplay_matches
             (id, trip_id, round_number, round_name, slot,
              player_a_id, player_b_id, player_a_is_bye, player_b_is_bye,
              seed_a, seed_b, winner_player_id, next_match_id, next_slot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [row.id, row.trip_id, row.round_number, row.round_name, row.slot,
           row.player_a_id, row.player_b_id, row.player_a_is_bye, row.player_b_is_bye,
           row.seed_a, row.seed_b, row.winner_player_id, row.next_match_id, row.next_slot]
        )
      }

      const stored = await c.query(
        `SELECT count(*)::int AS n FROM matchplay_matches WHERE trip_id = $1`, [tripId]
      )
      eq(stored.rows[0].n, rows.length, `${count} players: every match stored`)

      // Advancement survives the round trip
      const orphans = await c.query(
        `SELECT count(*)::int AS n FROM matchplay_matches m
          WHERE m.trip_id = $1 AND m.next_match_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM matchplay_matches t WHERE t.id = m.next_match_id)`,
        [tripId]
      )
      eq(orphans.rows[0].n, 0, `${count} players: no match points at a missing target`)

      const finals = await c.query(
        `SELECT count(*)::int AS n FROM matchplay_matches
          WHERE trip_id = $1 AND next_match_id IS NULL`, [tripId]
      )
      eq(finals.rows[0].n, 1, `${count} players: exactly one match advances nowhere`)

      // Byes arrive already settled
      const byes = await c.query(
        `SELECT count(*)::int AS n FROM matchplay_matches
          WHERE trip_id = $1 AND (player_a_is_bye OR player_b_is_bye)
            AND winner_player_id IS NULL`, [tripId]
      )
      eq(byes.rows[0].n, 0, `${count} players: no bye is left undecided`)

      await c.query('ROLLBACK TO SAVEPOINT per_count')
    }

    // ── Constraints must refuse malformed matches ──────────────
    // Three players: two to contest a match, and a third who is in the trip
    // but not in that match — the one a bogus winner is set to.
    const p = await c.query(
      `INSERT INTO players (trip_id, name, handicap, gender, role)
       VALUES ($1,'Solo',10,'M','player'),
              ($1,'Other',10,'M','player'),
              ($1,'Bystander',10,'M','player') RETURNING id`, [tripId]
    )
    const [p1, p2, p3] = p.rows.map(r => r.id as string)
    ok(!!p3, 'the bystander player exists, so the winner check is genuinely exercised')
    const base = `INSERT INTO matchplay_matches
      (trip_id, round_number, round_name, slot, player_a_id, player_b_id,
       player_a_is_bye, player_b_is_bye, winner_player_id, next_match_id, next_slot)`

    await rejects(c,
      `${base} VALUES ($1,1,'Final',90,NULL,NULL,true,true,NULL,NULL,NULL)`, [tripId],
      'refuses a match where both sides are byes')

    await rejects(c,
      `${base} VALUES ($1,1,'Final',91,$2,NULL,true,false,NULL,NULL,NULL)`, [tripId, p1],
      'refuses a bye slot that also holds a player')

    await rejects(c,
      `${base} VALUES ($1,1,'Final',92,$2,$2,false,false,NULL,NULL,NULL)`, [tripId, p1],
      'refuses a player drawn against themselves')

    await rejects(c,
      `${base} VALUES ($1,1,'Final',93,$2,$3,false,false,$2,NULL,'A')`, [tripId, p1, p2],
      'refuses an onward slot with no onward match')

    await rejects(c,
      `${base} VALUES ($1,1,'Final',94,$2,$3,false,false,$4,NULL,NULL)`,
      [tripId, p1, p2, p3],
      'refuses a winner who is not one of the two players')

    await c.query('SAVEPOINT dup')
    await c.query(`${base} VALUES ($1,1,'Final',95,$2,$3,false,false,NULL,NULL,NULL)`, [tripId, p1, p2])
    await rejects(c,
      `${base} VALUES ($1,1,'Final',95,$2,$3,false,false,NULL,NULL,NULL)`, [tripId, p1, p2],
      'refuses two matches in the same round and slot')
    await c.query('ROLLBACK TO SAVEPOINT dup')

    await rejects(c,
      `${base} VALUES ($1,0,'Final',96,$2,$3,false,false,NULL,NULL,NULL)`, [tripId, p1, p2],
      'refuses a round number below 1')

    await rejects(c,
      `${base} VALUES ($1,1,'Final',-1,$2,$3,false,false,NULL,NULL,NULL)`, [tripId, p1, p2],
      'refuses a negative slot')

    await rejects(c,
      `${base} VALUES ($1,1,'Final',97,$2,$3,false,false,NULL,NULL,'C')`, [tripId, p1, p2],
      'refuses an onward slot that is not A or B')

    // Deleting a trip takes its bracket with it
    await c.query('SAVEPOINT cascade')
    await c.query(`${base} VALUES ($1,1,'Final',98,$2,$3,false,false,NULL,NULL,NULL)`, [tripId, p1, p2])
    await c.query(`DELETE FROM trips WHERE id = $1`, [tripId])
    const left = await c.query(
      `SELECT count(*)::int AS n FROM matchplay_matches WHERE trip_id = $1`, [tripId])
    eq(left.rows[0].n, 0, 'deleting a trip removes its bracket')
    await c.query('ROLLBACK TO SAVEPOINT cascade')

  } finally {
    await c.query('ROLLBACK')
    await c.end()
  }

  console.log(`\n${'─'.repeat(56)}`)
  if (failed === 0) console.log(`✓ all ${passed} schema checks passed`)
  else {
    console.log(`✗ ${failed} of ${passed + failed} schema checks failed:`)
    for (const f of failures) console.log(`   · ${f}`)
    process.exitCode = 1
  }
}

main().catch(e => { console.error(e); process.exitCode = 1 })
