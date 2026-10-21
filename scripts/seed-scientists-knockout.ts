// Test fixture: an ongoing match play knockout of sixty-four players, each
// named for a prominent scientist, with the draw already made — a full
// Round of 64 to the Final, no byes. For exercising the bracket, the match
// pages, the match play card and the hub's next match without touching real
// trip data. Not wired into `npm test` — this writes rows, it doesn't check
// anything. Run by hand:
//
//   npx tsx scripts/seed-scientists-knockout.ts            writes it
//   npx tsx scripts/seed-scientists-knockout.ts --dry-run  checks the field
//                                                          and the draw only
//
// Follows the rows CreateKnockoutForm.tsx writes for an ongoing knockout
// (trips → players), with the organiser not playing so every name is free to
// claim, then makes the draw the way Trip Setup's MatchplayPanel does —
// `createBracket`'s own pure steps and its own `toRow`. Seeding is
// registration order (`sortPlayersBySeed`), so each player is stamped a
// second apart: a draw re-made from Trip Setup seeds the same way as this one.

import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { NO_FORMATS } from '../lib/formats'
import { hashPasscode } from '../lib/passcode'
import { knockoutBoards, knockoutSeed } from '../lib/bracketSetup'
import { generateBracket, bracketToRows, rowsInInsertOrder } from '../lib/matchplay'
import { firstDuplicateIndex } from '../lib/roster'

const DRY_RUN = process.argv.includes('--dry-run')

const EVENT_NAME = 'Scientists’ Knockout (test)'
const ORGANISER_PIN = '1905' // printed at the end — this is a test fixture, not a secret
// An ongoing knockout's period: from today to the end of March.
const START_DATE = new Date().toISOString().slice(0, 10)
const END_DATE = '2027-03-31'

// ─── The field ───────────────────────────────────────────────────────────
// In seeding order. Handicaps spread from plus to the high twenties, so the
// shots a match gives are worth testing; Newton's is a plus handicap, stored
// negative (lib/handicap.ts). Several first names repeat on purpose — Ernest,
// Robert, James, Carl, Max, John — which is what lib/displayNames.ts is for.

type Scientist = { name: string; gender: 'M' | 'F'; handicap: number }

const FIELD: Scientist[] = [
  { name: 'Isaac Newton',             gender: 'M', handicap: -1.2 },
  { name: 'Marie Curie',              gender: 'F', handicap: 2.4 },
  { name: 'Albert Einstein',          gender: 'M', handicap: 3.1 },
  { name: 'Charles Darwin',           gender: 'M', handicap: 4.8 },
  { name: 'Rosalind Franklin',        gender: 'F', handicap: 5.6 },
  { name: 'Galileo Galilei',          gender: 'M', handicap: 6.3 },
  { name: 'Ada Lovelace',             gender: 'F', handicap: 7.0 },
  { name: 'Nikola Tesla',             gender: 'M', handicap: 7.9 },
  { name: 'Michael Faraday',          gender: 'M', handicap: 8.4 },
  { name: 'Lise Meitner',             gender: 'F', handicap: 9.2 },
  { name: 'James Clerk Maxwell',      gender: 'M', handicap: 9.8 },
  { name: 'Niels Bohr',               gender: 'M', handicap: 10.5 },
  { name: 'Emmy Noether',             gender: 'F', handicap: 11.1 },
  { name: 'Max Planck',               gender: 'M', handicap: 11.7 },
  { name: 'Richard Feynman',          gender: 'M', handicap: 12.3 },
  { name: 'Dorothy Hodgkin',          gender: 'F', handicap: 12.9 },
  { name: 'Erwin Schrödinger',        gender: 'M', handicap: 13.4 },
  { name: 'Werner Heisenberg',        gender: 'M', handicap: 14.0 },
  { name: 'Chien-Shiung Wu',          gender: 'F', handicap: 14.6 },
  { name: 'Paul Dirac',               gender: 'M', handicap: 15.2 },
  { name: 'Alan Turing',              gender: 'M', handicap: 15.8 },
  { name: 'Barbara McClintock',       gender: 'F', handicap: 16.3 },
  { name: 'Stephen Hawking',          gender: 'M', handicap: 16.9 },
  { name: 'Louis Pasteur',            gender: 'M', handicap: 17.5 },
  { name: 'Jocelyn Bell Burnell',     gender: 'F', handicap: 18.1 },
  { name: 'Gregor Mendel',            gender: 'M', handicap: 18.6 },
  { name: 'Johannes Kepler',          gender: 'M', handicap: 19.2 },
  { name: 'Katherine Johnson',        gender: 'F', handicap: 19.8 },
  { name: 'Nicolaus Copernicus',      gender: 'M', handicap: 20.4 },
  { name: 'Dmitri Mendeleev',         gender: 'M', handicap: 21.0 },
  { name: 'Rachel Carson',            gender: 'F', handicap: 21.5 },
  { name: 'Ernest Rutherford',        gender: 'M', handicap: 22.1 },
  { name: 'Enrico Fermi',             gender: 'M', handicap: 0.6 },
  { name: 'Vera Rubin',               gender: 'F', handicap: 1.8 },
  { name: 'Robert Boyle',             gender: 'M', handicap: 3.7 },
  { name: 'William Rowan Hamilton',   gender: 'M', handicap: 5.0 },
  { name: 'Grace Hopper',             gender: 'F', handicap: 6.7 },
  { name: 'Ernest Walton',            gender: 'M', handicap: 8.1 },
  { name: 'John Bell',                gender: 'M', handicap: 9.5 },
  { name: 'Mary Anning',              gender: 'F', handicap: 10.8 },
  { name: 'George Boole',             gender: 'M', handicap: 12.0 },
  { name: 'Antoine Lavoisier',        gender: 'M', handicap: 13.2 },
  { name: 'Caroline Herschel',        gender: 'F', handicap: 14.3 },
  { name: 'Alexander Fleming',        gender: 'M', handicap: 15.5 },
  { name: 'Edwin Hubble',             gender: 'M', handicap: 16.6 },
  { name: 'Kathleen Lonsdale',        gender: 'F', handicap: 17.8 },
  { name: 'Carl Sagan',               gender: 'M', handicap: 18.9 },
  { name: 'Linus Pauling',            gender: 'M', handicap: 20.0 },
  { name: 'Francis Crick',            gender: 'M', handicap: 21.2 },
  { name: 'James Watson',             gender: 'M', handicap: 22.6 },
  { name: 'Robert Hooke',             gender: 'M', handicap: 23.3 },
  { name: 'Christiaan Huygens',       gender: 'M', handicap: 24.0 },
  { name: 'Blaise Pascal',            gender: 'M', handicap: 24.7 },
  { name: 'Leonhard Euler',           gender: 'M', handicap: 25.4 },
  { name: 'Carl Friedrich Gauss',     gender: 'M', handicap: 26.1 },
  { name: 'Archimedes',               gender: 'M', handicap: 26.8 },
  { name: 'Edward Jenner',            gender: 'M', handicap: 27.4 },
  { name: 'Alfred Wegener',           gender: 'M', handicap: 28.0 },
  { name: 'Robert Koch',              gender: 'M', handicap: 23.0 },
  { name: 'Srinivasa Ramanujan',      gender: 'M', handicap: 4.2 },
  { name: 'Subrahmanyan Chandrasekhar', gender: 'M', handicap: 11.4 },
  { name: 'Amedeo Avogadro',          gender: 'M', handicap: 19.5 },
  { name: 'Max Born',                 gender: 'M', handicap: 7.3 },
  { name: 'John Dalton',              gender: 'M', handicap: 25.9 },
]

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function checkField() {
  if (FIELD.length !== 64) throw new Error(`The field is ${FIELD.length}, not 64`)
  const dup = firstDuplicateIndex(FIELD.map(p => p.name))
  if (dup !== -1) throw new Error(`${FIELD[dup].name} is in the field twice`)
}

/** The draw over the field in seeding order — the same pure steps as `createBracket`. */
function makeDraw(tripId: string, playerIds: string[]) {
  const matches = generateBracket(playerIds.map((id, i) => ({ id, name: FIELD[i].name })))
  return rowsInInsertOrder(bracketToRows(tripId, matches))
}

async function run() {
  checkField()

  if (DRY_RUN) {
    const ids = FIELD.map((_, i) => `player-${i + 1}`)
    const rows = makeDraw('dry-run', ids)
    const byes = rows.filter(r => r.player_a_is_bye || r.player_b_is_bye).length
    const byRound = new Map<string, number>()
    for (const r of rows) byRound.set(r.round_name, (byRound.get(r.round_name) ?? 0) + 1)
    console.log(`Dry run — ${FIELD.length} players, ${rows.length} matches, ${byes} byes`)
    for (const [name, n] of byRound) console.log(`  ${name}: ${n}`)
    const first = rows.filter(r => r.round_number === 1).slice(0, 4)
    for (const r of first) {
      const a = FIELD[Number(r.player_a_id!.split('-')[1]) - 1].name
      const b = FIELD[Number(r.player_b_id!.split('-')[1]) - 1].name
      console.log(`  ${r.round_name} ${r.slot + 1}: (${r.seed_a}) ${a} v (${r.seed_b}) ${b}`)
    }
    return
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables (.env.local)')
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  // After the variables are known to be there: the store builds the browser
  // client as it loads, and throws without them.
  const { toRow } = await import('../lib/matchplayStore')

  const passcodeHash = await hashPasscode(ORGANISER_PIN)

  // ── The event ────────────────────────────────────────────────────────
  // A code already taken is refused by the database; try a fresh one.
  let code = ''
  let tripId = ''
  for (let attempt = 0; attempt < 5 && !tripId; attempt++) {
    code = generateCode()
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        name: EVENT_NAME,
        slug: code.toLowerCase(),
        trip_code: code,
        status: 'upcoming',
        start_date: START_DATE,
        end_date: END_DATE,
        kind: 'tournament',
        settings_passcode_hash: passcodeHash,
        formats: {
          ...NO_FORMATS,
          league: { ...NO_FORMATS.league },
          matchplay: { ...NO_FORMATS.matchplay },
        },
        bracket_setup: knockoutSeed('continuous'),
        leaderboards: knockoutBoards(),
      })
      .select('id')
      .single()
    if (trip) tripId = trip.id
    else if (error?.code !== '23505') throw new Error(`Trip: ${error?.message}`)
  }
  if (!tripId) throw new Error('Trip: no free event code after five tries')
  console.log(`Creating "${EVENT_NAME}" — ongoing knockout, ${FIELD.length} players — code ${code}`)

  // ── The field ────────────────────────────────────────────────────────
  // Nobody is the lead player and nobody is claimed: the organiser is not
  // playing, so every name is free for a tester to pick.
  const base = Date.now()
  const { data: players, error: playersErr } = await supabase
    .from('players')
    .insert(FIELD.map((p, i) => ({
      trip_id: tripId,
      name: p.name,
      handicap: p.handicap,
      gender: p.gender,
      role: 'player',
      is_lead: false,
      claimed: false,
      team_id: null,
      created_at: new Date(base + i * 1000).toISOString(),
    })))
    .select('id, name')
  if (playersErr || !players) throw new Error(`Players: ${playersErr?.message}`)
  const idByName = new Map(players.map(p => [p.name as string, p.id as string]))
  const playerIds = FIELD.map(p => {
    const id = idByName.get(p.name)
    if (!id) throw new Error(`Players: ${p.name} did not come back`)
    return id
  })
  console.log(`  ✓ ${players.length} players`)

  // ── The draw ─────────────────────────────────────────────────────────
  const rows = makeDraw(tripId, playerIds).map(r => toRow({ ...r, entrant_type: 'player' }))
  const { error: drawErr } = await supabase.from('matchplay_matches').insert(rows)
  if (drawErr) throw new Error(`Draw: ${drawErr.message}`)
  console.log(`  ✓ the draw — ${rows.length} matches, Round of 64 to the Final`)

  console.log('\nDone.')
  console.log(`  Event code:    ${code}`)
  console.log(`  Organiser PIN: ${ORGANISER_PIN}`)
  console.log(`  Hub:           /trip/${code}`)
}

run().catch(err => {
  console.error('\nSeed failed:', err.message)
  process.exit(1)
})
