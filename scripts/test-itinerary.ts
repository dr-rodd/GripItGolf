/**
 * Itinerary tests. Run with: npm run test:itinerary
 *
 * The running order of a trip — golf, stays, journeys and activities, per
 * day. Three things have to hold:
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
  addStay, nightsAvailable,
  MAX_TEE_TIMES, MAX_NIGHTS, MAX_ACTIVITY_NAME,
} from '../lib/itinerary'
import { isTempId, diffItems, toItemRow, touchesGolf } from '../lib/itinerarySync'
import fs from 'fs'

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

// ─── A stay over several nights ────────────────────────────────

section('A stay is entered once and lands on every night it covers')
{
  const four = addStay([], { id: 's', dayIndex: 0, stayName: 'The guesthouse' }, 4, 5)
  eq(four.length, 4, 'four nights is four tiles')
  eq(four.map(i => i.dayIndex), [0, 1, 2, 3], 'on four consecutive days')
  eq(new Set(four.map(i => i.stayName)).size, 1, 'all carrying the same name')

  // Each night is its own item, so one can be deleted without the rest
  eq(new Set(four.map(i => i.id)).size, 4, 'and each one has an id of its own')
  eq(removeItem(four, four[1].id).length, 3, 'so a single night can be dropped')

  // The default is the plain single-night stay it replaced
  const one = addStay([], { id: 's', dayIndex: 0, stayName: 'The guesthouse' }, 1, 5)
  eq(one.length, 1, 'one night is one tile')
  eq(one[0].kind, 'stay', 'and it is still a stay')
}

section('A stay cannot run off the end of the trip')
{
  // Three nights asked for, starting on the last day of a three-day trip
  const late = addStay([], { id: 's', dayIndex: 2, stayName: 'Guesthouse' }, 3, 3)
  eq(late.map(i => i.dayIndex), [2], 'only the nights the trip actually has are added')

  const mid = addStay([], { id: 's', dayIndex: 1, stayName: 'Guesthouse' }, 5, 3)
  eq(mid.map(i => i.dayIndex), [1, 2], 'and it stops at the last day rather than overrunning')

  // Junk counts settle to one night rather than to none
  eq(addStay([], { id: 's', dayIndex: 0, stayName: 'X' }, 0, 3).length, 1, 'zero nights is one')
  eq(addStay([], { id: 's', dayIndex: 0, stayName: 'X' }, -2, 3).length, 1, 'and so is a negative')
  eq(addStay([], { id: 's', dayIndex: 0, stayName: 'X' }, 99, 30).length, MAX_NIGHTS,
    'while a silly number is capped')
}

section('A stay slots in beside whatever is already on those days')
{
  // Golf on day 1 already; the stay should land after it, not on top of it
  let list = addItem([], { id: 'g', dayIndex: 1, kind: 'golf', courseId: 'c1', teeCount: 1 })
  list = addStay(list, { id: 's', dayIndex: 0, stayName: 'Guesthouse' }, 2, 3)

  eq(itemsForDay(list, 1).map(i => i.kind), ['golf', 'stay'],
    'the night is added after the golf that was already there')
  eq(itemsForDay(list, 1).map(i => i.position), [0, 1], 'with positions still gapless')
  eq(itemsForDay(list, 0).map(i => i.kind), ['stay'], 'and the first night stands alone')
}

section('How many nights the form can offer')
{
  eq(nightsAvailable(0, 5), 5, 'from the first day of a five-day trip, five')
  eq(nightsAvailable(3, 5), 2, 'from the fourth, two')
  eq(nightsAvailable(4, 5), 1, 'from the last, one')
  eq(nightsAvailable(9, 5), 1, 'and never fewer than one, whatever it is asked')
  eq(nightsAvailable(0, 60), MAX_NIGHTS, 'nor more than the cap')
}

// ─── Saving an edit back ────────────────────────────────────────
//
// lib/itinerarySync.ts turns an edited list into what to write. The store
// that actually writes it (lib/itineraryStore.ts) is not exercised here —
// no database in this suite — but everything it decides *from* is pure and
// lives here instead.

section('An id issued locally is not a saved row yet')
{
  ok(isTempId('tmp-0'), 'a freshly issued id is temporary')
  ok(isTempId('tmp-41'), 'whatever number it carries')
  ok(!isTempId('11111111-1111-1111-1111-111111111111'), 'a real id is not')
  ok(!isTempId(''), 'nor is nothing at all')
}

section('The diff between what was loaded and what is about to be saved')
{
  const golf: ItineraryItem = { id: 'g1', dayIndex: 0, position: 0, kind: 'golf', courseId: 'c1', teeCount: 1 }
  const stay: ItineraryItem = { id: 's1', dayIndex: 1, position: 0, kind: 'stay', stayName: 'Inn' }
  const before = [golf, stay]

  eq(diffItems(before, before), { toInsert: [], toUpdate: before, toDelete: [] },
    'nothing changed reads as everything surviving, nothing new or gone')

  const removed = [golf]
  eq(diffItems(before, removed).toDelete, ['s1'], 'a dropped item is the only one deleted')
  eq(diffItems(before, removed).toUpdate, [golf], 'and the survivor is still written')

  const added: ItineraryItem = { id: 'tmp-0', dayIndex: 0, position: 1, kind: 'travel', fromPlace: 'A', toPlace: 'B' }
  const withNew = [...before, added]
  eq(diffItems(before, withNew).toInsert, [added], 'a temp-id item is new, whatever kind it is')
  eq(diffItems(before, withNew).toUpdate, before, 'and the ones that already existed are unaffected')

  const moved = [{ ...golf, position: 5 }, stay]
  eq(diffItems(before, moved).toUpdate.find(i => i.id === 'g1')?.position, 5,
    'a moved item carries its new slot into the write')
  eq(diffItems(before, moved).toInsert, [], 'moving is not adding')
  eq(diffItems(before, moved).toDelete, [], 'nor is it removing')
}

section('A row is only ever one kind of thing')
{
  const golf: ItineraryItem = {
    id: 'g1', dayIndex: 0, position: 0, kind: 'golf', courseId: 'c1', teeTime: '13:00', teeCount: 2,
  }
  const row = toItemRow('trip-1', golf)
  eq(row.course_id, 'c1', 'golf carries its course')
  eq(row.tee_time, '13:00', 'and its time')
  eq(row.stay_name, null, 'but nothing a stay would carry')
  eq(row.travel_mode, null, 'nor a journey')

  const travel: ItineraryItem = {
    id: 'tmp-3', dayIndex: 0, position: 0, kind: 'travel',
    travelMode: 'car', fromPlace: 'Dublin', toPlace: 'Carne', durationMins: 240,
  }
  const trow = toItemRow('trip-1', travel)
  eq(trow.course_id, null, 'a journey carries no course')
  eq(trow.from_place, 'Dublin', 'but does carry where it starts')
  eq('id' in trow, false, 'and a not-yet-saved item sends no id at all')

  eq('id' in toItemRow('trip-1', golf), true, 'while a real one sends its own')
  eq(toItemRow('trip-1', golf).id, 'g1', 'unchanged')
}

section('Whether a save would touch golf at all')
{
  const golf: ItineraryItem = { id: 'g1', dayIndex: 0, position: 0, kind: 'golf', courseId: 'c1', teeCount: 1 }
  const stay: ItineraryItem = { id: 's1', dayIndex: 1, position: 0, kind: 'stay', stayName: 'Inn' }
  const before = [golf, stay]

  ok(!touchesGolf(before, before), 'nothing changed touches nothing')
  ok(!touchesGolf(before, [golf, { ...stay, stayName: 'A different inn' }]),
    'a stay changing on its own does not')

  ok(touchesGolf(before, [{ ...golf, courseId: 'c2' }, stay]), 'a different course does')
  ok(touchesGolf(before, [{ ...golf, dayIndex: 1 }, stay]), 'moving golf to another day does')
  ok(!touchesGolf(before, [{ ...golf, teeTime: '09:00' }, stay]),
    'but a tee time on its own does not — no round column holds it')

  const newGolf: ItineraryItem = { id: 'tmp-1', dayIndex: 1, position: 1, kind: 'golf', courseId: 'c3', teeCount: 1 }
  ok(touchesGolf(before, [...before, newGolf]), 'adding a round does')
  ok(touchesGolf(before, [stay]), 'and removing one does')

  // The point of the golf lock: a trip with scores can still have its dinner
  // booked. If adding an activity counted as touching golf, the editor would
  // refuse the save on a trip already under way — which is every trip that
  // would actually want one.
  const dinner: ItineraryItem = {
    id: 'tmp-9', dayIndex: 0, position: 2, kind: 'activity',
    activityName: 'Dinner', activityTime: '19:00',
  }
  ok(!touchesGolf(before, [...before, dinner]), 'adding an activity does not')
  ok(!touchesGolf([...before, dinner], before), 'nor does removing one')
}

// ─── Activities ────────────────────────────────────────────────

section('An activity is a name and, if you have one, a time')
{
  const dinner: ItineraryItem = {
    id: 'a1', dayIndex: 1, position: 0, kind: 'activity',
    activityName: 'Dinner at the Beach House', activityTime: '19:30',
  }

  eq(describeItem(dinner).title, 'Dinner at the Beach House', 'the name is the tile')
  eq(describeItem(dinner).detail, '7:30 pm', 'and the time reads as a person says it')

  // A plan without a time is still a plan — that is why the column is
  // nullable. The tile must not announce what it does not know.
  const quiz: ItineraryItem = { ...dinner, id: 'a2', activityName: 'Pub quiz', activityTime: null }
  eq(describeItem(quiz).detail, '', 'no time means no detail line, not "no time"')

  // A blank name never reaches the database — `itemError` refuses it — but
  // an old row or a bad hand-write should not render an empty tile.
  eq(describeItem({ ...dinner, activityName: null }).title, 'Activity',
    'and a nameless one still says what it is')

  eq(itemError({ kind: 'activity', activityName: 'Dinner' }), null, 'a name is all it needs')
  eq(itemError({ kind: 'activity', activityName: '   ' }), 'Say what it is',
    'whitespace is not a name')
  eq(itemError({ kind: 'activity' }), 'Say what it is', 'nor is nothing')
  ok(itemError({ kind: 'activity', activityName: 'x'.repeat(MAX_ACTIVITY_NAME) }) === null,
    'a name right on the limit is fine')
  ok(itemError({ kind: 'activity', activityName: 'x'.repeat(MAX_ACTIVITY_NAME + 1) }) !== null,
    'and one over it is not')

  // The time is optional, and stays optional. This is the pin that catches
  // somebody "tidying up" by making it required.
  eq(itemError({ kind: 'activity', activityName: 'Pub quiz', activityTime: null }), null,
    'an activity with no time saves')
}

section('An activity carries its own columns and nobody else\'s')
{
  const dinner: ItineraryItem = {
    id: 'a1', dayIndex: 0, position: 0, kind: 'activity',
    activityName: '  Dinner  ', activityTime: '19:00',
  }
  const row = toItemRow('trip-1', dinner)
  eq(row.kind, 'activity', 'the row says what it is')
  eq(row.activity_name, 'Dinner', 'the name is trimmed on the way in')
  eq(row.activity_time, '19:00', 'and the time goes through as it stands')
  eq(row.course_id, null, 'no course')
  eq(row.tee_time, null, 'no tee time')
  eq(row.stay_name, null, 'no bed')
  eq(row.travel_mode, null, 'and no journey')

  eq(toItemRow('trip-1', { ...dinner, activityTime: null }).activity_time, null,
    'an activity with no time writes a null, not an empty string')

  // The other three must null the new columns, or `ck_itinerary_shape`
  // refuses the row — which is a failed save, not a wrong tile, and is
  // exactly the failure this pin exists to catch before it ships.
  const golf: ItineraryItem = { id: 'g1', dayIndex: 0, position: 0, kind: 'golf', courseId: 'c1', teeCount: 1 }
  const stay: ItineraryItem = { id: 's1', dayIndex: 0, position: 1, kind: 'stay', stayName: 'Inn' }
  const travel: ItineraryItem = { id: 't1', dayIndex: 0, position: 2, kind: 'travel', toPlace: 'Carne' }
  for (const [name, item] of [['golf', golf], ['a stay', stay], ['a journey', travel]] as const) {
    const r = toItemRow('trip-1', item)
    eq(r.activity_name, null, `${name} carries no activity name`)
    eq(r.activity_time, null, `  …and no activity time`)
  }

  // A stray value on the wrong kind is dropped rather than written. The
  // database would refuse it; this is what stops it getting that far.
  const confused = toItemRow('trip-1', { ...golf, activityName: 'Dinner', activityTime: '19:00' })
  eq(confused.activity_name, null, 'a golf item that somehow picked up a name writes none')
}

section('An activity with a time is not under way before it')
{
  const at = (h: number, m = 0) => new Date(2026, 3, 17, h, m)
  const dinner: ItineraryItem = {
    id: 'a1', dayIndex: 0, position: 0, kind: 'activity',
    activityName: 'Dinner', activityTime: '19:00',
  }

  // Anything today with no time of its own counts as under way all day,
  // which is right for a bed and wrong for a table booked for seven.
  eq(itemState(dinner, '2026-04-17', at(9)), 'future', 'nine in the morning is not dinner time')
  eq(itemState(dinner, '2026-04-17', at(19)), 'now', 'seven is')
  eq(itemState(dinner, '2026-04-17', at(22)), 'now',
    'and it stays under way to the end of the day rather than being given an invented length')

  eq(itemState(dinner, '2026-04-16', at(9)), 'past', 'yesterday is behind you whatever the clock says')
  eq(itemState(dinner, '2026-04-18', at(23)), 'future', 'and tomorrow is not')

  const quiz: ItineraryItem = { ...dinner, activityTime: null }
  eq(itemState(quiz, '2026-04-17', at(9)), 'now',
    'without a time the whole day counts as under way, same as a stay')
}

// ─── The schema agrees with the model ──────────────────────────

section('Migration 027 and lib/itinerary.ts describe the same table')
{
  const sql = fs.readFileSync(
    'supabase/migrations/20260101000027_itinerary_activities.sql', 'utf-8')

  ok(/kind IN \('golf', 'stay', 'travel', 'activity'\)/.test(sql),
    'the kind check knows all four kinds')
  ok(/ADD COLUMN IF NOT EXISTS activity_name/.test(sql), 'the name column is added')
  ok(/ADD COLUMN IF NOT EXISTS activity_time/.test(sql), 'and the time column')

  // Both constraints are replaced, not added alongside. Two overlapping
  // CHECKs on one column is how a row comes to be refused for a reason
  // neither of them appears to give.
  // The old kind check is found by what it checks, not by what it is called.
  // 021 wrote it inline on the column, so Postgres named it — conventionally
  // `itinerary_items_kind_check`, but that is a convention, not a promise,
  // and a DROP aimed at the wrong name succeeds while doing nothing. The old
  // constraint would then still be refusing 'activity' with nothing in the
  // file to explain why.
  ok(/pg_constraint/.test(sql) && /DROP CONSTRAINT %I/.test(sql),
    'the old kind check is dropped by what it checks, not by a guessed name')
  ok(/conname <> 'ck_itinerary_shape'/.test(sql),
    '  …leaving the shape check alone, which is named explicitly and replaced on its own')
  ok(/DROP CONSTRAINT IF EXISTS ck_itinerary_shape/.test(sql),
    'and the old shape check is dropped by that name')

  // The shape constraint is a CASE with no ELSE. An unmatched kind returns
  // NULL, and a CHECK passes on NULL — so a branch that was never written
  // would have left activity rows exempt from the shape rule entirely.
  const shape = sql.slice(sql.indexOf('ADD CONSTRAINT ck_itinerary_shape'))
  for (const kind of ['golf', 'stay', 'travel', 'activity']) {
    ok(new RegExp(`WHEN '${kind}'`).test(shape), `the shape check has a branch for ${kind}`)
  }
  ok(/WHEN 'activity'[\s\S]*activity_name IS NOT NULL/.test(shape),
    'an activity must carry a name')

  // Every other kind nulls the new columns. `toItemRow` already does this —
  // these two pins are what make the database refuse a row that slipped
  // through anyway rather than storing a drive with a dinner attached.
  for (const kind of ['golf', 'stay', 'travel']) {
    const branch = shape.slice(shape.indexOf(`WHEN '${kind}'`))
      .split('WHEN ').slice(0, 2).join('')
    ok(/activity_name IS NULL/.test(branch) && /activity_time IS NULL/.test(branch),
      `${kind} carries neither activity column`)
  }

  // Written but never read is the quiet version of this bug: the row saves,
  // the tile is blank on reload, and nothing anywhere reports a failure.
  for (const page of [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/setup/page.tsx',
  ]) {
    const src = fs.readFileSync(page, 'utf-8')
    ok(src.includes('activity_name, activity_time'),
      `${page.split('/').slice(-2).join('/')} selects the new columns`)
    ok(src.includes('activityName: r.activity_name'),
      `  …and maps them onto the item`)
  }
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
