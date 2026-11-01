/**
 * Tee sheet booking tests. Run with: npm run test:tee-booking
 *
 * Ross, 1 Nov 2026: on a round played in partnerships the tee sheet is
 * where they are made — the players playing together form the
 * partnership. A pairs time is rows of pairings, a team time one team,
 * anything else seats of their own. The rules are lib/teeSheet.ts
 * (`seatGrid`, `seatTargets`, `listName`) and lib/teeBooking.ts (the
 * draft and what saving it means), checked here directly; then the wiring.
 */

import fs from 'fs'
import { seatGrid, seatTargets, listName, type SlotGroup, type SeatCell } from '../lib/teeSheet'
import {
  draftFrom, nextSeat, placeUnit, takeOut, vacate, playingWith, draftRows, bookingPlan, type DraftSeat,
} from '../lib/teeBooking'
import { teeMode, partnershipsFixed, roundPartnership } from '../lib/partnerships'
import type { Leaderboard } from '../lib/leaderboards'
import { type Freeze, FREEZE_IDLE_MS, frozenSlots, beaten, liftedRounds, readFreezes } from '../lib/teeFreeze'

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

const p = (id: string) => ({ id, name: id })
const solo = (...ids: string[]): SlotGroup => ({ teamId: null, teamName: null, players: ids.map(p) })
const team = (t: string, ...ids: string[]): SlotGroup => ({ teamId: t, teamName: t, players: ids.map(p) })
const show = (rows: SeatCell[][]) => rows.map(r => r.map(c => (c.kind === 'player' ? c.player.id : c.kind)))
const shape = (d: DraftSeat[]) => d.map(c => (c === null ? '_' : c === 'none' ? 'x' : c.isNew ? `${c.id}*` : c.id))
const u = (id: string, teamId: string | null = null) => ({ id, name: id, teamId })

// ─── Which kind of tee time ────────────────────────────────────

section('The board governing the round says how its tee times bind')
{
  const solo18: Leaderboard = { id: 's', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total' }
  const pairs: Leaderboard = { id: 'p', audience: 'team', competition: 'league', scoring: 'stableford', combine: 'total', teamPick: 'self', teamSize: 2 }
  const fours: Leaderboard = { id: 'f', audience: 'team', competition: 'league', scoring: 'stableford', combine: 'total', teamPick: 'self', teamSize: 4 }
  const draw: Leaderboard = { id: 'k', audience: 'team', competition: 'matchplay' }
  eq(teeMode(roundPartnership([solo18], 'r1')), 'separate', 'individuals: everybody their own seat')
  eq(teeMode(roundPartnership([pairs], 'r1')), 'pairs', 'pairs: a row of two is a pairing')
  eq(teeMode(roundPartnership([fours], 'r1')), 'team', 'fours: the time is one team')
  eq(teeMode(roundPartnership([draw], 'r1')), 'pairs', 'a pairs knockout books in pairs…')
  ok(partnershipsFixed(roundPartnership([draw], 'r1')) && !partnershipsFixed(roundPartnership([pairs], 'r1')),
    '  …as drawn — the sheet never re-pairs a knockout (Ross, 1 Nov 2026)')
}

// ─── The seats ─────────────────────────────────────────────────

section('Seats follow the format')
{
  eq(show(seatGrid([solo('a', 'b', 'c')], 4, 'separate')), [['a', 'b'], ['c', 'open']], 'separate: in booking order, own seats')
  ok(seatGrid([solo('a', 'b')], 4, 'separate').flat().every(c => c.kind !== 'player' || !Object.values(c.joins).some(Boolean)),
    '  …joined to nobody')
  eq(show(seatGrid([solo('a')], 3, 'separate')), [['a', 'open'], ['open', 'none']], 'a threeball leaves the fourth place empty')
  eq(show(seatGrid([solo('a')], 2, 'separate')), [['a', 'open']], 'a two-ball is one row')

  const three = seatGrid([solo('a', 'b', 'c')], 4, 'team')
  ok(three[0][0].kind === 'player' && three[0][0].joins.right && three[0][0].joins.down && three[1][1].kind === 'open',
    'team: everybody on the time is one ticket — three an L')
  ok(seatGrid([solo('a', 'b', 'c', 'd')], 4, 'team').flat().every(c => c.kind === 'player' && Object.values(c.joins).filter(Boolean).length === 2),
    '  …four the whole grid')

  eq(show(seatGrid([solo('a', 'b')], 4, 'pairs')), [['a', 'open'], ['b', 'open']],
    'pairs: a player with no partner has a row to themselves, their partner\'s seat open')
  eq(show(seatGrid([solo('c'), team('T', 'a', 'b')], 4, 'pairs')), [['a', 'b'], ['c', 'open']], '  …a pair takes a row')
  const pair = seatGrid([team('T', 'a', 'b')], 4, 'pairs')[0]
  ok(pair[0].kind === 'player' && pair[0].joins.right && !pair[0].joins.down, '  …joined across, never down')
  eq(show(seatGrid([solo('a', 'b', 'c')], 4, 'pairs')), [['a', 'c'], ['b', 'open']],
    'three with no partners on a pairs time: nobody dropped, the third beside the first')
  ok(seatGrid([solo('a', 'b', 'c')], 4, 'pairs')[0][0].kind === 'player'
    && !(seatGrid([solo('a', 'b', 'c')], 4, 'pairs')[0][0] as Extract<SeatCell, { kind: 'player' }>).joins.right,
    '  …and not joined, because they are not partners')
}

section('Where the + goes')
{
  const kinds = (rows: SeatCell[][], mode: 'pairs' | 'team' | 'separate') =>
    seatTargets(rows, mode).map(t => (t ? (t.kind === 'join' ? `join:${t.with}` : t.kind) : '.'))
  eq(kinds(seatGrid([solo('a')], 4, 'separate'), 'separate'), ['.', 'add', '.', '.'], 'one +, in the next free seat')
  eq(kinds(seatGrid([solo('a', 'b')], 4, 'team'), 'team'), ['.', '.', 'add', '.'], '  …and on a team time, adding to the team')
  eq(kinds(seatGrid([], 4, 'pairs'), 'pairs'), ['start', '.', 'start', '.'], 'pairs: the first seat of each empty row starts a pairing')
  eq(kinds(seatGrid([solo('a')], 4, 'pairs'), 'pairs'), ['.', 'join:a', 'start', '.'],
    '  …the seat beside a player on their own joins their pairing, the row below starts another')
  eq(kinds(seatGrid([team('T', 'a', 'b'), team('S', 'c', 'd')], 4, 'pairs'), 'pairs'), ['.', '.', '.', '.'], 'a full time has no +')
  eq(kinds(seatGrid([solo('a')], 3, 'pairs'), 'pairs'), ['.', 'join:a', 'start', '.'], 'a pairs threeball: the last seat starts its own')
}

section('A partnership in the list reads as one')
{
  eq(listName(['Ross', 'Dave']), 'Ross & Dave', 'two with an & (Ross, 1 Nov 2026)')
  eq(listName(['Ross', 'Dave', 'Seán']), 'Ross, Dave, Seán', 'three or four with commas')
  eq(listName(['Ross']), 'Ross', 'one is just their name')
}

// ─── The draft ─────────────────────────────────────────────────

section('Booking a pairs time: you, then your partner, then the next pairing')
{
  let d = draftFrom(seatGrid([], 4, 'pairs'))
  d = placeUnit(d, [u('me')], 'pairs', 0)!
  eq(shape(d), ['me*', '_', '_', '_'], 'you start in the seat you tapped')
  eq(nextSeat(d, 'pairs', null), 1, '  …and the other half of your ticket is where the next pick goes')
  d = placeUnit(d, [u('dave')], 'pairs', nextSeat(d, 'pairs', null))!
  eq(nextSeat(d, 'pairs', null), 2, 'once your pairing is made, the next row')
  d = placeUnit(d, [u('sean', 'S'), u('john', 'S')], 'pairs', nextSeat(d, 'pairs', null))!
  eq(shape(d), ['me*', 'dave*', 'sean*', 'john*'], 'a partnership takes a row of its own')
  eq(nextSeat(d, 'pairs', null), null, 'and a full time has nowhere left')

  let e = draftFrom(seatGrid([], 4, 'pairs'))
  e = placeUnit(e, [u('me')], 'pairs', 0)!
  e = takeOut(e, 0)
  eq(shape(e), ['_', '_', '_', '_'], 'you can take yourself out and book others')
  e = placeUnit(e, [u('me')], 'pairs', 0)!
  eq(nextSeat(e, 'pairs', 2), 2, 'tapping the row below leaves you on your own and starts another there')

  const joined = draftFrom(seatGrid([solo('ross')], 4, 'pairs'))
  eq(placeUnit(joined, [u('kate'), u('mary')], 'pairs', 1)?.map(c => (c && c !== 'none' ? c.id : c)), ['ross', null, 'kate', 'mary'],
    'a pair picked beside a lone player goes to a row of its own, not split')
  eq(placeUnit(draftFrom(seatGrid([team('T', 'a', 'b'), solo('c')], 4, 'pairs')), [u('x'), u('y')], 'pairs', 3), null,
    'and does not fit where no row is free')
}

section('Changing a partnership on the sheet: off, and a replacement in')
{
  const d = draftFrom(seatGrid([team('P', 'ross', 'dave')], 4, 'pairs'))
  const { draft: left, off } = vacate(d, 0)
  eq(off, 'ross', 'somebody already on the time comes off it')
  eq(shape(left), ['_', 'dave', '_', '_'], '  …leaving their seat free')
  eq(nextSeat(left, 'pairs', 0), 0, '  …for the replacement')
  const replaced = placeUnit(left, [u('kate')], 'pairs', 0)!
  eq(bookingPlan(replaced, 'pairs', false, t => (t === 'P' ? 1 : 0)).links, [{ members: ['kate', 'dave'], teamId: 'P' }],
    'the replacement joins the partner left waiting, in the same team')
  eq(vacate(replaced, 0).off, null, 'a pick of this booking\'s own just comes back out')
}

section('Booking a team time, and a separate one')
{
  let d = draftFrom(seatGrid([solo('a')], 4, 'team'))
  d = placeUnit(d, [u('b'), u('c')], 'team', nextSeat(d, 'team', null))!
  eq(shape(d), ['a', 'b*', 'c*', '_'], 'picks fill the next free seats')
  eq(playingWith(d, 'team', 3), ['a', 'b', 'c'], '  …and play with everybody on the time')
  eq(playingWith(d, 'separate', 3), [], 'a separate time plays with nobody')
  eq(placeUnit(d, [u('x'), u('y')], 'team', 3), null, 'two do not fit in one seat')
}

section('What saving means')
{
  const size = (n: Record<string, number>) => (t: string) => n[t] ?? 0
  const pairs = placeUnit(draftFrom(seatGrid([solo('ross')], 4, 'pairs')), [u('kate')], 'pairs', 1)!
  eq(bookingPlan(pairs, 'pairs', false, size({})), { book: ['kate'], links: [{ members: ['ross', 'kate'], teamId: null }] },
    'joining a player on their own makes a new pairing of the two')
  const waiting = placeUnit(draftFrom(seatGrid([team('W', 'ross')], 4, 'pairs')), [u('kate')], 'pairs', 1)!
  eq(bookingPlan(waiting, 'pairs', false, size({ W: 1 })).links, [{ members: ['ross', 'kate'], teamId: 'W' }],
    '  …or joins the team of one already waiting for a partner')
  const already = placeUnit(draftFrom(seatGrid([], 4, 'pairs')), [u('a', 'P'), u('b', 'P')], 'pairs', 0)!
  eq(bookingPlan(already, 'pairs', false, size({ P: 2 })), { book: ['a', 'b'], links: [] }, 'partners already partnered stay as they are')
  const alone = placeUnit(draftFrom(seatGrid([], 4, 'pairs')), [u('me')], 'pairs', 0)!
  eq(bookingPlan(alone, 'pairs', false, size({})).links, [], 'one on their own is not a pairing')
  eq(bookingPlan(pairs, 'pairs', true, size({})).links, [], 'a knockout\'s pairings are never re-made on the sheet')

  const fours = placeUnit(draftFrom(seatGrid([team('F', 'a', 'b')], 4, 'team')), [u('c')], 'team', 2)!
  eq(bookingPlan(fours, 'team', false, size({ F: 2 })).links, [{ members: ['a', 'b', 'c'], teamId: 'F' }],
    'a team time: the newcomer joins the team already on it')
  const fresh = placeUnit(draftFrom(seatGrid([solo('a')], 4, 'team')), [u('b')], 'team', 1)!
  eq(bookingPlan(fresh, 'team', false, size({})).links, [{ members: ['a', 'b'], teamId: null }], '  …or the two make one')
  eq(bookingPlan(placeUnit(draftFrom(seatGrid([solo('a')], 4, 'separate')), [u('b')], 'separate', 1)!, 'separate', false, size({})).links, [],
    'a separate time links nobody')
}

section('The draft is drawn as it will be saved')
{
  const d = placeUnit(draftFrom(seatGrid([solo('ross')], 4, 'pairs')), [u('kate')], 'pairs', 1)!
  const rows = draftRows(d, 'pairs')
  ok(rows[0][0].kind === 'player' && rows[0][0].joins.right, 'a row being made a pairing is drawn as one ticket')
}

// ─── Wiring ────────────────────────────────────────────────────

section('The sheet books in place')
{
  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('seatTargets(') && client.includes('bookingPlan('), 'the sheet places its + signs and saves through the rules')
  ok(!client.includes('Pick your team') && !client.includes('Make this group a team') && !client.includes('Pick a team from this time'),
    'the seats do the linking — no team picker trip, no make-a-team buttons')
  ok(client.includes('liftTo(') && client.includes('reducedMotion()') && client.includes('putt(t)'),
    'the time lifts to the top on the putt curve, at once under Reduce Motion')
  const seats = read('app/trip/[tripCode]/teesheet/TeeSeats.tsx')
  ok(seats.includes('press rounded-tile border border-dashed border-line-strong'), 'a + pushes down under the thumb')
}

section('Leaving a partnership happens at your tee time (stage 2)')
{
  const teamsPage = read('app/trip/[tripCode]/teams/page.tsx')
  ok(teamsPage.includes(".from('tee_assignments').select('round_id, slot_index').eq('trip_id', trip.id).eq('player_id', viewerPlayerId)"),
    'the Teams page asks where this player stands on the tee sheets')
  ok(teamsPage.includes('r.scheduled_date.slice(0, 10) < today') && teamsPage.includes('roundPartnership(boards, r.id'),
    '  …for the next round to come, on the list that round\'s partnerships are kept on')
  const teams = read('app/trip/[tripCode]/teams/TeamsClient.tsx')
  ok(teams.includes('/teesheet?round=${encodeURIComponent(myTeeTimes[sheet.id].roundId)}&edit=${myTeeTimes[sheet.id].slot}'),
    'Leave on a booked partnership goes to the tee time (Ross, 1 Nov 2026)')
  ok(teams.includes('onClick={() => leave(sheet, myTeam)}'), '  …and is the same Leave as ever where none is booked')

  const sheetPage = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(sheetPage.includes('editSlot={editSlot}'), 'the sheet takes the tee time to open')
  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes("start: onTime(rows), purpose: 'leave' })") && client.includes('Take yourself off with your ✕'),
    '  …opens it, lifted, saying how')
  ok(client.includes('const { draft: after, off } = vacate(draft, k)') && client.includes('mayTakeOut: seat => takeOff(here, seat) !== null'),
    'anybody this phone may remove comes off in the booking')
  ok(client.includes("const block = together && c.teamId && b.purpose !== 'leave'"),
    '  …a partnership kept for the whole event as one block, unless its player is leaving it')
  const order = ['deleteAssignments(booking.slot, booking.removed)', 'leaveTeams(booking.slot, booking.removed', 'addPlayers(booking.slot, book)', 'linkPartnerships(booking.slot, links']
  ok(order.every((x, i) => client.indexOf(x) >= 0 && (i === 0 || client.indexOf(x) > client.indexOf(order[i - 1]))),
    'saving: off the time and out of the partnership, then the bookings, then the new partnerships')
  ok(client.includes("if (info && !fixed && (info.isDay || booking.purpose === 'leave')) {"),
    '  …a knockout\'s pairings stay as drawn, and an event-long one is only left from the Teams page')
  ok(!client.includes('go on together') && !client.includes('goes on together'), 'the list does not say partners go on together (Ross, 1 Nov 2026)')
  ok(client.includes('!partnered(meId) || myTeam === theirs'), 'a team of one joins a player on their own like anybody unpartnered')
}

section('A time is frozen while a phone books it (Ross, 1 Nov 2026)')
{
  const f = (key: string, slot: number, since: number, seen = since, round = 'r1'): Freeze => ({ key, round, slot, since, seen })
  const now = 1_000_000
  const all = [f('me', 0, now - 5), f('them', 2, now - 10), f('old', 3, now - FREEZE_IDLE_MS - 1), f('other-round', 1, now, now, 'r2')]
  eq([...frozenSlots(all, 'r1', 'me', now)], [2],
    'other phones\' times on this round are frozen — not this phone\'s own, not one gone quiet, not another round\'s')
  ok(beaten([f('me', 2, now), f('them', 2, now - 1)], f('me', 2, now), now), 'two tap one time: the earlier freeze wins…')
  ok(!beaten([f('me', 2, now - 1), f('them', 2, now)], f('me', 2, now - 1), now), '  …so the later one loses, not the earlier')
  ok(beaten([f('b', 2, now), f('a', 2, now)], f('b', 2, now), now) && !beaten([f('b', 2, now), f('a', 2, now)], f('a', 2, now), now),
    '  …and a dead heat goes the same way on every phone')
  ok(!beaten([f('me', 2, now), f('them', 1, now - 9)], f('me', 2, now), now), '  …a freeze on another time is no contest')
  eq(liftedRounds([f('them', 2, 1), f('me', 0, 1)], [f('me', 0, 1)], 'me'), ['r1'],
    'another phone\'s freeze going is the signal to read that round again')
  eq(liftedRounds([f('me', 0, 1)], [], 'me'), [], '  …this phone\'s own is not')
  eq(readFreezes({ a: [{ round: 'r1', slot: 2, since: 5, seen: 6 }], b: [{ round: 'r1', slot: -1, since: 5, seen: 6 }], c: [{ slot: 2 }], d: [] }),
    [{ key: 'a', round: 'r1', slot: 2, since: 5, seen: 6 }], 'a freeze is another phone talking — anything malformed is dropped')

  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('if (frozen.has(slot)) {') && client.includes('freeze.hold(round.id, slot)'),
    'opening a time freezes it, and a frozen one will not open')
  ok(client.includes('Being booked — one moment.') && client.includes('const targets = mayBook && !isFrozen'),
    '  …and on other phones it shows as frozen, with no + to tap')
  ok(/freeze\.hold\(round\.id, slotIndex\)[\s\S]{0,400}finally \{\s*freeze\.release\(\)/.test(client),
    'a ✕ on the sheet writes under the time\'s freeze too, so every write tells the other phones to look again')
  ok(client.includes("lifted => { if (lifted === roundId) router.refresh() }"), '  …which they do when it thaws')
  const save = client.slice(client.indexOf('async function saveBooking'))
  ok(save.indexOf('const fresh = await resyncRound()') >= 0 && save.indexOf('const fresh = await resyncRound()') < save.indexOf('deleteAssignments('),
    'Save asks the database before writing anything…')
  ok(client.includes("'This time changed while you were booking — here it is now.'"), '  …and writes nothing if the time changed meanwhile')
  const hook = read('app/trip/[tripCode]/teesheet/useTeeFreeze.ts')
  ok(hook.includes("supabase.channel(`tee-sheet:${tripId}`, { config: { presence: { key } } })") && !/from\('/.test(hook),
    'the freezes are presence on one channel per event — nothing stored')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
