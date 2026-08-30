// Test fixture: a team-league event, series-shaped, four houses of sixteen
// Harry Potter characters apiece (sixty-four players), for exercising
// team leaderboards, live scoring and the tee sheet without touching real
// trip data. Not wired into `npm test` — this writes rows, it doesn't check
// anything. Run by hand: `npx tsx scripts/seed-hp-series.ts`.
//
// Follows the exact insertion order and row shapes CreateLeagueForm.tsx
// writes for a series league, so this fixture is indistinguishable from one
// made through the wizard: trips → teams → players → team_members →
// itinerary_items → rounds → round_handicaps. A dedicated placeholder
// course is created (with 18 holes) so the events are scoreable without
// depending on which real courses exist in this database.

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables (.env.local)')
}
const supabase = createClient(supabaseUrl, supabaseAnonKey)

import type { LeagueSetup } from '../lib/leagueSetup'
import type { Leaderboard } from '../lib/leaderboards'
import { NO_FORMATS } from '../lib/formats'
import { hashPasscode } from '../lib/passcode'
import { toItemRow } from '../lib/itinerarySync'
import type { ItineraryItem } from '../lib/itinerary'

// ─── The field ───────────────────────────────────────────────────────────
// Sixteen a side, one house each. Not every name is a canonical member of
// that house in the books — some are filled in for headcount — but the
// four best-known Trio/rival/house characters lead each list.

const HOUSES: { name: string; color: string; players: string[] }[] = [
  {
    name: 'Gryffindor',
    color: '#7F0909',
    players: [
      'Harry Potter', 'Ron Weasley', 'Hermione Granger', 'Neville Longbottom',
      'Ginny Weasley', 'Fred Weasley', 'George Weasley', 'Percy Weasley',
      'Seamus Finnigan', 'Dean Thomas', 'Lavender Brown', 'Parvati Patil',
      'Oliver Wood', 'Katie Bell', 'Angelina Johnson', 'Colin Creevey',
    ],
  },
  {
    name: 'Slytherin',
    color: '#1A472A',
    players: [
      'Draco Malfoy', 'Vincent Crabbe', 'Gregory Goyle', 'Pansy Parkinson',
      'Blaise Zabini', 'Theodore Nott', 'Millicent Bulstrode', 'Marcus Flint',
      'Daphne Greengrass', 'Astoria Greengrass', 'Regulus Black',
      'Bellatrix Lestrange', 'Severus Snape', 'Tom Riddle', 'Horace Slughorn',
      'Narcissa Malfoy',
    ],
  },
  {
    name: 'Hufflepuff',
    color: '#ECB939',
    players: [
      'Cedric Diggory', 'Nymphadora Tonks', 'Susan Bones', 'Justin Finch-Fletchley',
      'Hannah Abbott', 'Ernie Macmillan', 'Zacharias Smith', 'Newt Scamander',
      'Pomona Sprout', 'Kevin Entwhistle', 'Wayne Hopkins', 'Owen Cauldwell',
      'Megan Jones', 'Eleanor Branstone', 'Rose Zeller', 'Leanne Roper',
    ],
  },
  {
    name: 'Ravenclaw',
    color: '#0E1A40',
    players: [
      'Luna Lovegood', 'Cho Chang', 'Padma Patil', 'Michael Corner',
      'Terry Boot', 'Anthony Goldstein', 'Marietta Edgecombe', 'Roger Davies',
      'Penelope Clearwater', 'Filius Flitwick', 'Lisa Turpin',
      'Mandy Brocklehurst', 'Su Li', 'Stewart Ackerley', 'Grant Page',
      'Orla Quirke',
    ],
  },
]

const ORGANISER_PIN = '4267' // printed at the end — this is a test fixture, not a secret

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function placeholderHoles(courseId: string) {
  return Array.from({ length: 18 }, (_, i) => ({
    course_id: courseId,
    hole_number: i + 1,
    par: 4,
    stroke_index: i + 1,
  }))
}

async function run() {
  const code = generateCode()
  console.log(`Creating "Hogwarts Cup" — series, team, ${HOUSES.reduce((n, h) => n + h.players.length, 0)} players — code ${code}`)

  // ── Placeholder venue ────────────────────────────────────────────────
  // A series event still needs a real course per event slot (the wizard's
  // venuesComplete check). One dedicated course, reused for all three
  // events, keeps this fixture self-contained.
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .insert({ name: `Hogwarts Cup Grounds (${code})`, card_verified: false })
    .select('id')
    .single()
  if (courseErr || !course) throw new Error(`Course: ${courseErr?.message}`)

  const { error: holesErr } = await supabase.from('holes').insert(placeholderHoles(course.id))
  if (holesErr) throw new Error(`Holes: ${holesErr.message}`)
  console.log('  ✓ placeholder course + 18 holes')

  // ── The trip row ─────────────────────────────────────────────────────
  const passcodeHash = await hashPasscode(ORGANISER_PIN)

  const setup: LeagueSetup = {
    format: 'league',
    schedule: 'series',
    entry: 'organiser',
  }

  const teamBoard: Leaderboard = {
    id: 'lb-league-team',
    audience: 'team',
    competition: 'league',
    scoring: 'stableford',
    combine: 'total',
    teamFormat: 'better_ball',
  }

  const SERIES_EVENTS = 3 // numbered, no dates — more can be added later from the running order

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      name: 'Hogwarts Cup',
      slug: code.toLowerCase(),
      trip_code: code,
      status: 'upcoming',
      start_date: null,
      end_date: null,
      kind: 'tournament',
      settings_passcode_hash: passcodeHash,
      formats: {
        ...NO_FORMATS,
        league: { ...NO_FORMATS.league },
        matchplay: { ...NO_FORMATS.matchplay },
      },
      leaderboards: [teamBoard],
      bracket_setup: setup,
    })
    .select('id')
    .single()
  if (tripErr || !trip) throw new Error(`Trip: ${tripErr?.message}`)
  const tripId = trip.id
  console.log('  ✓ trip created')

  // ── Teams — the four houses ──────────────────────────────────────────
  const { data: teams, error: teamsErr } = await supabase
    .from('teams')
    .insert(HOUSES.map(h => ({ trip_id: tripId, name: h.name, color: h.color })))
    .select('id, name')
  if (teamsErr || !teams) throw new Error(`Teams: ${teamsErr?.message}`)
  console.log(`  ✓ ${teams.length} teams (houses)`)

  const teamIdByName = new Map(teams.map(t => [t.name, t.id]))

  // ── Players — sixteen a house, first player is the organiser ────────
  const playerInputs = HOUSES.flatMap((house, hi) =>
    house.players.map((name, pi) => ({
      name,
      team_id: teamIdByName.get(house.name)!,
      isLead: hi === 0 && pi === 0,
      // A spread of handicaps rather than one flat number, purely so a
      // team leaderboard has something to differentiate on.
      handicap: 2 + ((hi * 16 + pi) % 24),
      gender: (pi % 3 === 0 ? 'F' : 'M') as 'M' | 'F',
    }))
  )

  const { data: insertedPlayers, error: playersErr } = await supabase
    .from('players')
    .insert(
      playerInputs.map(p => ({
        trip_id: tripId,
        name: p.name,
        handicap: p.handicap,
        gender: p.gender,
        role: 'player',
        is_lead: p.isLead,
        claimed: p.isLead,
        team_id: p.team_id,
      }))
    )
    .select('id, name, handicap, team_id')
  if (playersErr || !insertedPlayers) throw new Error(`Players: ${playersErr?.message}`)
  console.log(`  ✓ ${insertedPlayers.length} players`)

  // players.team_id is kept in step with team_members for the 'main' sheet
  // (supabase/migrations/20260101000023_team_sets.sql) — write both.
  const { error: membersErr } = await supabase.from('team_members').insert(
    insertedPlayers.map(p => ({
      trip_id: tripId,
      team_id: p.team_id,
      team_set: 'main',
      player_id: p.id,
    }))
  )
  if (membersErr) throw new Error(`Team members: ${membersErr.message}`)

  // ── Schedule — three numbered events, same venue, no dates ──────────
  const items: ItineraryItem[] = Array.from({ length: SERIES_EVENTS }, (_, i) => ({
    id: `tmp-day-${i}`,
    dayIndex: i,
    position: 0,
    kind: 'golf',
    courseId: course.id,
    teeTime: null,
    teeCount: 1,
  }))

  const { data: savedItems, error: itinErr } = await supabase
    .from('itinerary_items')
    .insert(items.map(item => toItemRow(tripId, item)))
    .select('id, day_index, position')
  if (itinErr || !savedItems) throw new Error(`Itinerary: ${itinErr?.message}`)

  const savedBySlot = new Map(savedItems.map(r => [`${r.day_index}:${r.position}`, r.id]))

  const { data: rounds, error: roundsErr } = await supabase
    .from('rounds')
    .insert(
      items.map((item, i) => ({
        trip_id: tripId,
        course_id: item.courseId,
        round_number: i + 1,
        status: 'upcoming',
        itinerary_item_id: savedBySlot.get(`${item.dayIndex}:${item.position}`) ?? null,
      }))
    )
    .select('id')
  if (roundsErr || !rounds) throw new Error(`Rounds: ${roundsErr.message}`)
  console.log(`  ✓ ${rounds.length} events scheduled (series, no dates)`)

  // ── Handicap snapshots ───────────────────────────────────────────────
  const hcpRows = rounds.flatMap(round =>
    insertedPlayers.map(p => ({
      round_id: round.id,
      player_id: p.id,
      playing_handicap: Math.round(p.handicap ?? 0),
    }))
  )
  const { error: hcpErr } = await supabase.from('round_handicaps').insert(hcpRows)
  if (hcpErr) throw new Error(`Handicaps: ${hcpErr.message}`)

  console.log('\nDone.')
  console.log(`  Event code:    ${code}`)
  console.log(`  Organiser PIN: ${ORGANISER_PIN}`)
  console.log(`  Hub:           /trip/${code}`)
}

run().catch(err => {
  console.error('\nSeed failed:', err.message)
  process.exit(1)
})
