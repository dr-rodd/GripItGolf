/**
 * Itinerary tests. Run with: npm run test:itinerary
 *
 * The running order of a trip — golf, stays and journeys, per day. Three
 * things have to hold:
 *
 *   · positions stay gapless and in order through every add, delete and move,
 *     because rounds are numbered from that order
 *   · an item reads as a person would say it: "4 hr drive", "2 tee times
 *     from 1:00 pm"
 *   · what has already happened is judged against a clock that is always
 *     passed in, so it can be tested without waiting for Tuesday
 */

import {
  type ItineraryItem,
  addItem, removeItem, moveItem, itemsForDay, renumber, golfItems,
  dayCount, dateForDay, describeDay, describeDuration, describeTime,
  describeItem, itemState, tripProgress, itemError,
  MAX_TEE_TIMES,
} from '../lib/itinerary'

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


/** The shape of a day: ids in order. */
const order = (items: ItineraryItem[], day: number) =>
  itemsForDay(items, day).map(i => i.id)

// ─── Ordering ──────────────────────────────────────────────────

section('Items land at the end of the day they are added to')
{
  let list: ItineraryItem[] = []
  list = addItem(list, { id: 'a', dayIndex: 0, kind: 'travel', fromPlace: 'Dublin', toPlace: 'Carne' })
  list = addItem(list, { id: 'b', dayIndex: 0, kind: 'golf', courseId: 'c1', teeTime: '13:00' })
  list = addItem(list, { id: 'c', dayIndex: 1, kind: 'stay', stayName: 'Ballina' })

  eq(order(list, 0), ['a', 'b'], 'the first day keeps them in the order they were added')
  eq(order(list, 1), ['c'], 'and another day starts again from zero')
  eq(list.filter(i => i.dayIndex === 0).map(i => i.position), [0, 1], 'positions count from zero')
  eq(list.find(i => i.id === 'c')?.position, 0, 'per day, not across the trip')
}

section('Positions close up when something is removed')
{
  let list: ItineraryItem[] = []
  for (const id of ['a', 'b', 'c']) list = addItem(list, { id, dayIndex: 0, kind: 'stay', stayName: id })

  list = removeItem(list, 'b')
  eq(order(list, 0), ['a', 'c'], 'the gap closes')
  eq(itemsForDay(list, 0).map(i => i.position), [0, 1],
    'and the positions are renumbered rather than left with a hole in them')

  eq(removeItem(list, 'nope').length, 2, 'removing something that is not there changes nothing')
}

section('Moving within a day')
{
  let list: ItineraryItem[] = []
  for (const id of ['a', 'b', 'c']) list = addItem(list, { id, dayIndex: 0, kind: 'stay', stayName: id })

  eq(order(moveItem(list, 'c', 0, 0), 0), ['c', 'a', 'b'], 'to the front')
  eq(order(moveItem(list, 'a', 0, 2), 0), ['b', 'c', 'a'], 'to the back')
  eq(order(moveItem(list, 'a', 0, 1), 0), ['b', 'a', 'c'], 'and into the middle')

  // A drag that overshoots is not a mistake worth refusing
  eq(order(moveItem(list, 'a', 0, 99), 0), ['b', 'c', 'a'], 'dropping past the end lands it last')
  eq(order(moveItem(list, 'a', 0, -5), 0), ['a', 'b', 'c'], 'and dropping above the top lands it first')

  eq(order(moveItem(list, 'ghost', 0, 0), 0), ['a', 'b', 'c'],
    'moving something that does not exist leaves the list alone')
}

section('Moving between days')
{
  let list: ItineraryItem[] = []
  list = addItem(list, { id: 'a', dayIndex: 0, kind: 'stay', stayName: 'a' })
  list = addItem(list, { id: 'b', dayIndex: 0, kind: 'stay', stayName: 'b' })
  list = addItem(list, { id: 'x', dayIndex: 1, kind: 'stay', stayName: 'x' })

  const moved = moveItem(list, 'a', 1, 0)
  eq(order(moved, 0), ['b'], 'it leaves the day it came from')
  eq(order(moved, 1), ['a', 'x'], 'and lands where it was dropped')
  eq(itemsForDay(moved, 0).map(i => i.position), [0],
    'the day it left closes its gap too')
  eq(moved.find(i => i.id === 'a')?.dayIndex, 1, 'and it belongs to the new day')
}

section('Renumbering is idempotent')
{
  let list: ItineraryItem[] = []
  for (const id of ['a', 'b', 'c']) list = addItem(list, { id, dayIndex: 0, kind: 'stay', stayName: id })
  eq(renumber(list), list, 'a tidy list is returned unchanged')

  // A list that arrives with silly positions is straightened out
  const messy: ItineraryItem[] = [
    { id: 'a', dayIndex: 0, position: 7, kind: 'stay', stayName: 'a' },
    { id: 'b', dayIndex: 0, position: 2, kind: 'stay', stayName: 'b' },
  ]
  eq(renumber(messy).map(i => [i.id, i.position]), [['b', 0], ['a', 1]],
    'and one with gaps is closed up, keeping its order')
}

// ─── Rounds come from golf items ───────────────────────────────

section('Golf items are the rounds, in trip order')
{
  let list: ItineraryItem[] = []
  list = addItem(list, { id: 'r2', dayIndex: 1, kind: 'golf', courseId: 'c2' })
  list = addItem(list, { id: 'stay', dayIndex: 0, kind: 'stay', stayName: 'hotel' })
  list = addItem(list, { id: 'r1', dayIndex: 0, kind: 'golf', courseId: 'c1' })
  list = addItem(list, { id: 'drive', dayIndex: 1, kind: 'travel', toPlace: 'Carne' })

  eq(golfItems(list).map(i => i.id), ['r1', 'r2'],
    'day first, then position — which is the order rounds are numbered in')
  ok(!golfItems(list).some(i => i.kind !== 'golf'), 'and nothing else is a round')

  // The same course twice is ordinary: opening and closing on the same links
  let repeat: ItineraryItem[] = []
  repeat = addItem(repeat, { id: 'a', dayIndex: 0, kind: 'golf', courseId: 'c1' })
  repeat = addItem(repeat, { id: 'b', dayIndex: 2, kind: 'golf', courseId: 'c1' })
  eq(golfItems(repeat).length, 2, 'a course played twice makes two rounds')
}

// ─── Days ──────────────────────────────────────────────────────

section('How many days a trip runs')
{
  eq(dayCount('2026-07-30', '2026-08-02'), 4, 'four days, counting both ends')
  eq(dayCount('2026-07-30', '2026-07-30'), 1, 'a single day is one day')
  eq(dayCount(null, null), 1, 'with no dates at all there is still one day to fill')
  eq(dayCount('2026-07-30', null), 1, 'and one end is not enough to count from')

  eq(dateForDay('2026-07-30', 0), '2026-07-30', 'day one is the start date')
  eq(dateForDay('2026-07-30', 3), '2026-08-02', 'and day four is three days later')
  eq(dateForDay('2026-07-30', 2), '2026-08-01', 'crossing the end of a month')
  eq(dateForDay(null, 2), null, 'with no start date a day has no date')

  ok(describeDay('2026-07-31', 1).startsWith('Friday'), 'a day is named by its weekday')
  eq(describeDay(null, 2), 'Day 3', 'and falls back to its number when undated')
}

// ─── Reading an item ───────────────────────────────────────────

section('Durations read as anyone would say them')
{
  eq(describeDuration(240), '4 hr', 'four hours')
  eq(describeDuration(270), '4 hr 30', 'and a half')
  eq(describeDuration(45), '45 min', 'under an hour is just minutes')
  eq(describeDuration(60), '1 hr', 'exactly an hour drops the minutes')
  eq(describeDuration(0), '', 'no time at all says nothing')
  eq(describeDuration(null), '', 'and neither does a missing one')
}

section('Times read off a clock, not a timetable')
{
  eq(describeTime('13:00'), '1:00 pm', 'the afternoon')
  eq(describeTime('09:05'), '9:05 am', 'the morning, with its minutes padded')
  eq(describeTime('00:30'), '12:30 am', 'after midnight is twelve, not zero')
  eq(describeTime('12:00'), '12:00 pm', 'and noon is twelve, not zero either')
  eq(describeTime(null), '', 'no time reads as nothing')
}

section('A tile says what it is and the one thing worth knowing')
{
  const golf = describeItem(
    { id: 'g', dayIndex: 0, position: 0, kind: 'golf', teeTime: '13:00', teeCount: 2 }, 'Carne')
  eq(golf.title, 'Carne', 'golf is named by its course')
  eq(golf.detail, '2 tee times from 1:00 pm', 'with the groups and when the first goes off')

  const one = describeItem(
    { id: 'g', dayIndex: 0, position: 0, kind: 'golf', teeTime: '08:00', teeCount: 1 }, 'Carne')
  eq(one.detail, 'tee time from 8:00 am', 'a single group is not "1 tee times"')

  const noTime = describeItem({ id: 'g', dayIndex: 0, position: 0, kind: 'golf', teeCount: 1 }, 'Carne')
  eq(noTime.detail, 'tee time', 'and an unknown tee time is simply left out')
  eq(describeItem({ id: 'g', dayIndex: 0, position: 0, kind: 'golf' }).title, 'Golf',
    'a course that could not be resolved still says what it is')

  const stay = describeItem({ id: 's', dayIndex: 0, position: 0, kind: 'stay', stayName: 'Ballina guesthouse' })
  eq(stay.title, 'Ballina guesthouse', 'a stay is named by where it is')
  eq(stay.detail, 'Overnight', 'and says so')

  const drive = describeItem({
    id: 't', dayIndex: 0, position: 0, kind: 'travel',
    travelMode: 'car', fromPlace: 'Dublin', toPlace: 'Carne', durationMins: 240,
  })
  eq(drive.title, 'Dublin to Carne', 'a journey is named by its ends')
  eq(drive.detail, '4 hr drive', 'and reads as "4 hr drive", the way it was asked for')

  eq(describeItem({ id: 't', dayIndex: 0, position: 0, kind: 'travel', travelMode: 'flight', toPlace: 'Faro', durationMins: 180 }).detail,
    '3 hr flight', 'a flight is a flight')
  eq(describeItem({ id: 't', dayIndex: 0, position: 0, kind: 'travel', travelMode: 'train', fromPlace: 'Cork', durationMins: 90 }).title,
    'Cork', 'one end is enough to name a journey by')
  eq(describeItem({ id: 't', dayIndex: 0, position: 0, kind: 'travel' }).title, 'Journey',
    'and neither end still gives a usable tile')
}

// ─── Has it happened? ──────────────────────────────────────────

const at = (iso: string) => new Date(iso)

section('What is behind you dims')
{
  const stay: ItineraryItem = { id: 's', dayIndex: 0, position: 0, kind: 'stay', stayName: 'x' }

  eq(itemState(stay, '2026-07-29', at('2026-07-30T09:00')), 'past', 'yesterday is past')
  eq(itemState(stay, '2026-07-31', at('2026-07-30T09:00')), 'future', 'tomorrow is still to come')
  eq(itemState(stay, '2026-07-30', at('2026-07-30T09:00')), 'now',
    'and something today with no time of its own counts as under way')

  eq(itemState(stay, null, at('2026-07-30T09:00')), 'future',
    'an undated item is never in the past — it has not been scheduled, not missed')
}

section('A round is judged by its tee time')
{
  const round = (teeTime: string, teeCount = 1): ItineraryItem =>
    ({ id: 'g', dayIndex: 0, position: 0, kind: 'golf', teeTime, teeCount })

  eq(itemState(round('13:00'), '2026-07-30', at('2026-07-30T09:00')), 'future',
    'before the first group goes off')
  eq(itemState(round('13:00'), '2026-07-30', at('2026-07-30T14:30')), 'now',
    'while it is being played')
  eq(itemState(round('13:00'), '2026-07-30', at('2026-07-30T19:00')), 'past',
    'and once there has been time to finish')

  // Four and a half hours, plus ten minutes for every group after the first
  eq(itemState(round('13:00', 1), '2026-07-30', at('2026-07-30T17:45')), 'past',
    'one group is done by quarter to six')
  eq(itemState(round('13:00', 6), '2026-07-30', at('2026-07-30T17:45')), 'now',
    'but six groups are still out there')

  // The day still decides, whatever the clock says
  eq(itemState(round('13:00'), '2026-07-29', at('2026-07-30T09:00')), 'past',
    'yesterday morning is past even at a tee time that has not come round today')
}

section('Progress across the trip')
{
  const items: ItineraryItem[] = [
    { id: 'a', dayIndex: 0, position: 0, kind: 'stay', stayName: 'a' },
    { id: 'b', dayIndex: 1, position: 0, kind: 'stay', stayName: 'b' },
    { id: 'c', dayIndex: 2, position: 0, kind: 'stay', stayName: 'c' },
  ]
  eq(tripProgress(items, '2026-07-30', at('2026-08-01T12:00')), { done: 2, total: 3 },
    'two days in, two are behind you')
  eq(tripProgress(items, '2026-07-30', at('2026-07-29T12:00')), { done: 0, total: 3 },
    'before it starts, none of it')
  eq(tripProgress(items, '2026-07-30', at('2026-08-10T12:00')), { done: 3, total: 3 },
    'and long after, all of it')
  eq(tripProgress([], '2026-07-30', at('2026-08-01T12:00')), { done: 0, total: 0 },
    'an empty trip has nothing to be done')
}

// ─── Validation ────────────────────────────────────────────────

section('What an item needs before it can be added')
{
  eq(itemError({ kind: 'golf', courseId: 'c1', teeCount: 1 }), null, 'golf needs a course')
  ok(itemError({ kind: 'golf', teeCount: 1 })?.includes('course') === true, 'and says so without one')
  ok(itemError({ kind: 'golf', courseId: 'c1', teeCount: 0 }) !== null, 'no groups is not a round')
  ok(itemError({ kind: 'golf', courseId: 'c1', teeCount: MAX_TEE_TIMES + 1 }) !== null,
    'nor is more than a course could hold')
  eq(itemError({ kind: 'golf', courseId: 'c1' }), null,
    'a tee time is optional — it is often not known when the trip is planned')

  eq(itemError({ kind: 'stay', stayName: 'Ballina guesthouse' }), null, 'a stay needs a name')
  ok(itemError({ kind: 'stay', stayName: '   ' }) !== null, 'and whitespace is not one')

  eq(itemError({ kind: 'travel', toPlace: 'Carne' }), null, 'a journey needs somewhere to go')
  eq(itemError({ kind: 'travel', fromPlace: 'Dublin' }), null, 'or somewhere to leave')
  ok(itemError({ kind: 'travel' }) !== null, 'but not neither')
  ok(itemError({ kind: 'travel', toPlace: 'Carne', durationMins: 99999 }) !== null,
    'and a journey cannot take a week')
  eq(itemError({ kind: 'travel', toPlace: 'Carne' }), null,
    'while a duration is optional, like the tee time')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
