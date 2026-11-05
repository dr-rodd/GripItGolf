/**
 * Seeding a match play event's field from another event (Ross, 4 Nov 2026):
 * the list rules (lib/fieldSeed.ts), bringing everything across against a
 * stand-in database (app/api/event/import/copyAcross.ts), and the two
 * creation doors' field and draw steps.
 *
 *   npm run test:field-seed
 */

import fs from 'fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  withSeeded, withoutSeeded, addLabel, seedPairs, fieldRow, tidyCode, drawStandings, EVENT_CODE, NO_FIELD_SEED,
  type FieldPlayer, type SeedPlayer,
} from '../lib/fieldSeed'
import { byStandings } from '../lib/bracketDraw'
import { copyAcross } from '../app/api/event/import/copyAcross'
import { hashPasscode } from '../lib/passcode'

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
const section = (n: string) => console.log(`\n${n}`)
const read = (p: string) => fs.readFileSync(p, 'utf8')

const row = (name: string, extra: Partial<FieldPlayer> = {}): FieldPlayer => ({ name, handicap: '', gender: 'M', ...extra })
const sp = (id: string, name: string, handicap: number | null = 10, gender = 'M'): SeedPlayer => ({ id, name, handicap, gender })

section('The other event\'s players join the list')
{
  eq(fieldRow(sp('a', ' Ross OG ', -2.0, 'M')), { name: 'Ross OG', handicap: '+2', gender: 'M', sourceId: 'a', brought: true },
    'a seeded player arrives as a row — a plus handicap with its sign, as it would be typed')
  eq(fieldRow(sp('b', 'Kate', null, 'F')).handicap, '', '  …and one with none yet is blank: pending, never scratch')
  const seeded = [sp('a', 'Ross'), sp('b', 'Kate'), sp('c', 'ross')]
  eq(withSeeded([row('')], seeded, true).map(r => r.name), ['', 'Ross', 'Kate'],
    'an empty first row stays for the organiser playing, and no name comes twice')
  eq(withSeeded([row('')], seeded, false).map(r => r.name), ['Ross', 'Kate'], '  …and goes when they are not playing')
  eq(withSeeded([row('Dave'), row(''), row('Kate')], seeded, true).map(r => r.name), ['Dave', 'Kate', 'Ross'],
    'names already typed stay where they are, the other empty rows go, a typed name is not doubled')
  const merged = withSeeded([row('Dave')], seeded, true)
  eq(addLabel([row('Dave')]), '+ Add another player', 'the add button asks for another player…')
  eq(addLabel(merged), '+ Add more players', '  …and for more once a field has come across (Ross, 4 Nov 2026)')
  eq(withoutSeeded(merged).map(r => r.name), ['Dave'], 'switching the seed off takes the players brought in back out')
  const typed = withSeeded([row('ross'), row('Kate', { handicap: '20', gender: 'F' })], [sp('a', 'Ross', 9.5), sp('b', 'Kate', 18, 'F')], true)
  eq(typed.map(r => [r.name, r.handicap, r.sourceId ?? null, !!r.brought]), [['ross', '9.5', 'a', false], ['Kate', '20', 'b', false]],
    'a typed name that was in the other event is that player — linked, its handicap where none was typed, a typed one kept')
  eq(withoutSeeded(typed), [row('ross', { handicap: '9.5' }), row('Kate', { handicap: '20', gender: 'F' })],
    '  …and switching the seed off leaves the typed rows, unlinked')
  eq(seedPairs(typed, new Map([['ross', 'n9']]), n => n.trim().toLowerCase()), [{ from: 'a', to: 'n9' }],
    '  …a linked typed row is paired too, so the organiser\'s own details come across')
  eq(withoutSeeded(withSeeded([row('')], seeded, false)), [row('')], '  …leaving one empty row to type in')
  const ids = new Map([['ross', 'n1'], ['dave', 'n2'], ['kate', 'n3']])
  eq(seedPairs(merged, ids, n => n.trim().toLowerCase()), [{ from: 'a', to: 'n1' }, { from: 'b', to: 'n3' }],
    'each player brought in is paired with who they are in the new event — a typed one nobody\'s')
  ok(EVENT_CODE.test(tidyCode(' qx7 k2p ')) && !EVENT_CODE.test(tidyCode('QX7K')), 'a code is tidied to six capitals')
}

section('The draw seeded from that event\'s leaderboard (Ross, 4 Nov 2026)')
{
  eq(byStandings(['dave', 'kate', 'ross', 'new'], ['ross', 'gone', 'kate', 'ross']), ['ross', 'kate', 'dave', 'new'],
    'the field in finishing order — those the board had first, then the rest as they were, nobody twice, nobody added')
  const rows = withSeeded([row('Ross OG')], [sp('o1', 'Ross OG'), sp('o2', 'Kate B'), sp('o3', 'Dave C')], true)
  const seed = {
    ...NO_FIELD_SEED, on: true,
    source: {
      code: 'OLDKO1', name: 'Summer 2026', tripId: 'T1', adminHash: null,
      boards: [
        { id: 'b1', title: 'Stableford Points', order: ['o3', 'o9', 'o1'] },
        { id: 'b2', title: 'Strokes', order: ['o9'] },
      ],
    },
  }
  eq(drawStandings(seed, rows, n => n.trim().toLowerCase()), [{ id: 'b1', title: 'Stableford Points', order: ['dave c', 'ross og'] }],
    'each leaderboard in this draw\'s own keys, through the players brought in — one none of this field is on dropped')
  eq(drawStandings(NO_FIELD_SEED, rows, n => n), [], '  …and nothing offered without a seeded field')
  const route = read('app/api/event/standings/route.ts')
  ok(route.includes("lb.audience === 'individual' && lb.competition === 'league'") && route.includes('buildRows(lb, ctx).map(r => r.id)')
    && route.includes('publicHash &&'),
    'the standings are each individual table\'s own order, from the board\'s own rows, behind the event\'s public PIN where it has one')
  const draw = read('app/components/DrawPlanner.tsx')
  ok(draw.includes('Seed from {from ?? \'the other event\'}&apos;s leaderboard') && draw.includes("method: 'seeded', order: byStandings(draft.order, board.order)")
    && draw.includes('Pick which leaderboard'),
    'the draw step offers it, a leaderboard to pick where there are several, and seeds the list from it')
}

// ─── A stand-in database ───────────────────────────────────────

type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>, missing: string[] = []) {
  const writes: string[] = []
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let cols: string[] | null = null
    let order: { col: string; asc: boolean } | null = null
    let limit: number | null = null
    let op: 'select' | 'insert' | 'upsert' | 'update' = 'select'
    let payload: Row | Row[] = []
    const run = async (): Promise<{ data: Row[] | null; error: { message: string } | null }> => {
      const rows = (tables[table] ??= [])
      if (op === 'select') {
        if (cols?.some(c => missing.includes(`${table}.${c}`))) return { data: null, error: { message: 'column does not exist' } }
        let out = rows.filter(r => filters.every(f => f(r)))
        if (order) {
          const { col, asc } = order
          out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
        }
        if (limit !== null) out = out.slice(0, limit)
        return { data: out.map(r => (cols ? Object.fromEntries(cols.map(c => [c, r[c] ?? null])) : r)), error: null }
      }
      writes.push(`${op} ${table}`)
      if (op === 'insert') rows.push(...(payload as Row[]))
      if (op === 'upsert') {
        for (const p of payload as Row[]) {
          const i = rows.findIndex(r => r.player_id === p.player_id)
          if (i >= 0) rows[i] = { ...rows[i], ...p }
          else rows.push(p)
        }
      }
      if (op === 'update') rows.filter(r => filters.every(f => f(r))).forEach(r => Object.assign(r, payload))
      return { data: null, error: null }
    }
    const b = {
      select(c: string) { cols = c.split(',').map(x => x.trim()); return b },
      eq(c: string, v: unknown) { filters.push(r => r[c] === v); return b },
      in(c: string, vs: unknown[]) { filters.push(r => vs.includes(r[c])); return b },
      order(c: string, o?: { ascending?: boolean }) { order = { col: c, asc: o?.ascending ?? true }; return b },
      limit(n: number) { limit = n; return b },
      insert(r: Row[]) { op = 'insert'; payload = r; return b },
      upsert(r: Row[]) { op = 'upsert'; payload = r; return b },
      update(r: Row) { op = 'update'; payload = r; return b },
      maybeSingle: () => run().then(res => ({ ...res, data: res.data?.[0] ?? null })),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
    }
    return b
  }
  return { client: { from } as unknown as SupabaseClient, tables, writes }
}

async function world(missing: string[] = [], sourcePin: string | null = '2468') {
  return fakeDb({
    trips: [
      { id: 'T1', trip_code: 'OLDKO1', settings_passcode_hash: sourcePin ? await hashPasscode(sourcePin) : null },
      { id: 'T2', trip_code: 'NEWKO2', settings_passcode_hash: await hashPasscode('1357') },
      { id: 'T3', trip_code: 'OTHER3', settings_passcode_hash: await hashPasscode('2468') },
    ],
    players: [
      { id: 'o1', trip_id: 'T1', name: 'Ross', nickname: 'Big Dog', colour: '#123456', home_course_id: 'c1' },
      { id: 'o2', trip_id: 'T1', name: 'Kate', nickname: null, colour: null, home_course_id: null },
      { id: 'x1', trip_id: 'T3', name: 'Stranger', nickname: 'Not yours' },
      { id: 'n1', trip_id: 'T2', name: 'Ross' },
      { id: 'n2', trip_id: 'T2', name: 'Kate' },
    ],
    player_contacts: [
      { player_id: 'o1', trip_id: 'T1', phone: '087 111', email: null, visibility: 'opponent' },
      { player_id: 'o2', trip_id: 'T1', phone: null, email: 'k@x.ie', visibility: 'public' },
      { player_id: 'x1', trip_id: 'T3', phone: '086 999', email: null, visibility: 'public' },
    ],
    event_messages: [
      { trip_id: 'T1', body: 'First notice', created_at: '2025-06-01T10:00:00Z' },
      { trip_id: 'T1', body: 'Second notice', created_at: '2025-06-02T10:00:00Z' },
      { trip_id: 'T3', body: 'Somebody else\'s', created_at: '2025-06-03T10:00:00Z' },
    ],
  }, missing)
}

const input = (extra: Partial<Parameters<typeof copyAcross>[1]> = {}) => ({
  from: 'OLDKO1', to: 'NEWKO2', fromPin: '2468', toPin: '1357',
  pairs: [{ from: 'o1', to: 'n1' }, { from: 'o2', to: 'n2' }], ...extra,
})

async function main() {
  section('With the other event\'s organiser PIN, everything comes across')
  {
    const db = await world()
    const out = await copyAcross(db.client, input())
    eq(out, { status: 200, body: { ok: true, contacts: 2, notices: 2, missed: [] } }, 'both PINs right: contacts and notices copied')
    const mine = db.tables.player_contacts.filter(c => c.trip_id === 'T2')
    eq(mine.map(c => [c.player_id, c.phone, c.email, c.visibility]),
      [['n1', '087 111', null, 'opponent'], ['n2', null, 'k@x.ie', 'public']],
      '  …each contact under the new player, with the visibility its player chose')
    const ross = db.tables.players.find(p => p.id === 'n1')!
    eq([ross.nickname, ross.colour, ross.home_course_id], ['Big Dog', '#123456', 'c1'], '  …and what each player set for themselves')
    const notes = db.tables.event_messages.filter(m => m.trip_id === 'T2')
    eq(notes.map(n => n.body), ['First notice', 'Second notice'], '  …and the notices, oldest first…')
    ok(String(notes[0].created_at) < String(notes[1].created_at) && String(notes[0].created_at) > '2026', '  …stamped now, in the same order')
  }

  section('Nothing comes without both locks')
  {
    const wrong = await world()
    eq((await copyAcross(wrong.client, input({ fromPin: '0000' }))).status, 403, 'the other event\'s PIN wrong: refused…')
    eq(wrong.writes, [], '  …and nothing written')
    const wrongTo = await world()
    eq((await copyAcross(wrongTo.client, input({ toPin: '9999' }))).status, 403, 'the new event\'s PIN wrong: refused too')
    const open = await world([], null)
    eq((await copyAcross(open.client, input())).status, 403, 'an event with no organiser PIN has nobody to vouch for its players\' details')
    eq((await copyAcross(open.client, input({ from: 'NOPE01' }))).status, 404, 'an event that does not exist is not found')
  }

  section('Only each event\'s own players')
  {
    const db = await world()
    const out = await copyAcross(db.client, input({ pairs: [{ from: 'x1', to: 'n1' }, { from: 'o2', to: 'x1' }, { from: 'o1', to: 'n1' }] }))
    eq(out.body.contacts, 1, 'a pair naming another event\'s player is dropped — the pairs came from a browser')
    ok(!db.tables.player_contacts.some(c => c.trip_id === 'T2' && c.phone === '086 999'), '  …so a stranger\'s number never comes across')
    eq(db.tables.players.find(p => p.id === 'x1')!.nickname, 'Not yours', '  …and nobody outside the two events is changed')
  }

  section('A database short a migration loses that detail alone')
  {
    const db = await world(['players.colour'])
    const out = await copyAcross(db.client, input())
    ok(out.body.contacts === 2 && out.body.notices === 2, 'no colour column: contacts and notices still come')
    eq(db.tables.players.find(p => p.id === 'n1')!.nickname, 'Big Dog', '  …and the nicknames')
  }

  section('The creation doors')
  {
    const ko = read('app/dashboard/create/CreateKnockoutForm.tsx')
    const trip = read('app/dashboard/create/CreateTripForm.tsx')
    const field = read('app/dashboard/create/MatchPlayField.tsx')
    const seed = read('app/dashboard/create/SeedFromEvent.tsx')
    ok(ko.includes("'Next, let’s add the field', 'Plan the draw', 'Ready to go'")
      && trip.includes("'Next, let’s add the field', 'Plan the draw', 'Ready to go'"),
      'both match play doors: the field, then the draw as a step of its own (Ross, 4 Nov 2026)')
    ok(ko.includes('<MatchPlayField') && trip.includes('<MatchPlayField') && (trip.match(/<CreationDraw /g) ?? []).length === 1
      && trip.includes('heading={false}') && ko.includes('heading={false}'),
      '  …one field step for both, and the draw no longer inside it')
    ok(field.includes('New players can be added up until the draw') && field.includes('until the') && field.includes('day of play'),
      'the field step says what to expect, in a box at the top')
    ok(field.includes("document.getElementById(`field-hcp-${i}`)?.focus()") && field.includes('id={`field-hcp-${i}`}'),
      'Enter after a name goes on to that player\'s handicap')
    ok(seed.includes('Seed the field from another event') && seed.includes("'Enter'") && seed.includes('<IconCheck')
      && seed.includes('public_passcode_hash') && seed.includes('Bring across everything (optional)'),
      'seeding: the event\'s code, its public PIN where it has one, Enter turning to a tick, then optionally its organiser PIN')
    ok(ko.includes('bringAcross(seed, code, passcode,') && trip.includes('bringAcross(seed, code, passcode,'),
      'creating the event brings everything across when the organiser PIN was given — a failure never stops it')
    const privacy = read('app/privacy/page.tsx')
    ok(privacy.includes('can be used by whoever holds its organiser PIN, in other events they'),
      'the privacy notice says what a player shares can be used by an event\'s organiser in other events (Ross, 4 Nov 2026)')
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
