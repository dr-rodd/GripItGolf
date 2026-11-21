import type { createAdminClient } from '@/lib/supabase-admin'
import { NO_PLACES, clubCourses, type ClubPlaces, type ClubRoom } from '@/lib/clubLocations'

// A club's locations (`club_locations`, migration 099), read fail-soft:
// before it the club has no rooms, and its courses are still worked out from
// its home course and its competitions (lib/clubLocations.ts).

type Db = ReturnType<typeof createAdminClient>

/** A table or column 099 makes, not there yet. */
export function missing099(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || ((e.code === '42703' || e.code === 'PGRST204') && /location/.test(e.message ?? '')))
}

/** Locations are not set up yet (before 099). */
export class LocationsNotReady extends Error {
  constructor() { super('club_locations is missing (migration 099)'); this.name = 'LocationsNotReady' }
}

type Row = { id: string; name: string | null; course_id: string | null; position: number }

/** The stored rows: rooms, and courses added by hand. Null before 099. */
export async function readLocationRows(db: Db, clubId: string): Promise<Row[] | null> {
  const { data, error } = await db.from('club_locations').select('id, name, course_id, position').eq('club_id', clubId).order('position').order('created_at')
  if (error) { if (missing099(error)) return null; throw error }
  return (data ?? []) as Row[]
}

/**
 * Every place the club books into: its courses (home first, then added, then
 * those its competitions use — `used`) and its rooms. Never fails: a part
 * that cannot be read is left out.
 */
export async function readPlaces(db: Db, clubId: string, used: string[]): Promise<ClubPlaces> {
  const [rows, home] = await Promise.all([
    readLocationRows(db, clubId).catch(() => null),
    db.from('clubs').select('home_course_id').eq('id', clubId).maybeSingle(),
  ])
  const homeCourseId = home.error ? null : (home.data as { home_course_id?: string | null } | null)?.home_course_id ?? null
  const added = (rows ?? []).filter(r => r.course_id).map(r => ({ id: r.id, courseId: r.course_id!, position: r.position }))
  const ids = [...new Set([homeCourseId, ...added.map(a => a.courseId), ...used].filter((x): x is string => !!x))]
  const named = ids.length ? await db.from('courses').select('id, name').in('id', ids) : { data: [], error: null }
  const names = new Map(((named.error ? [] : named.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
  const rooms: ClubRoom[] = (rows ?? []).filter(r => r.name).map(r => ({ id: r.id, name: r.name!, position: r.position }))
  return { ...NO_PLACES, courses: clubCourses({ homeCourseId, added, used, names }), rooms, ready: rows !== null }
}

/** A room kept: new, or renamed. The id. */
export async function saveRoom(db: Db, clubId: string, room: { id: string | null; name: string; position: number }): Promise<string> {
  const now = new Date().toISOString()
  const r = room.id
    ? await db.from('club_locations').update({ name: room.name, updated_at: now }).eq('id', room.id).eq('club_id', clubId).not('name', 'is', null).select('id').maybeSingle()
    : await db.from('club_locations').insert({ club_id: clubId, name: room.name, position: room.position }).select('id').single()
  if (r.error) { if (missing099(r.error)) throw new LocationsNotReady(); throw r.error }
  if (!r.data) throw new Error('That place isn’t the club’s.')
  return (r.data as { id: string }).id
}

/** A course added to the club's list by hand. */
export async function addCourse(db: Db, clubId: string, courseId: string, position: number): Promise<void> {
  const { error } = await db.from('club_locations').upsert({ club_id: clubId, course_id: courseId, position }, { onConflict: 'club_id,course_id', ignoreDuplicates: true })
  if (error) { if (missing099(error)) throw new LocationsNotReady(); throw error }
}

/**
 * A location taken off the list. A room's events keep its name as their
 * free text, so nothing loses where it was; a course's events go back to
 * Course 1.
 */
export async function deleteLocation(db: Db, clubId: string, id: string): Promise<void> {
  const { data, error } = await db.from('club_locations').select('id, name').eq('id', id).eq('club_id', clubId).maybeSingle()
  if (error) { if (missing099(error)) throw new LocationsNotReady(); throw error }
  if (!data) throw new Error('That place isn’t the club’s.')
  const name = (data as { name: string | null }).name
  if (name) {
    const kept = await db.from('club_events').update({ place: name.slice(0, 80) }).eq('club_id', clubId).eq('location_id', id).is('place', null)
    if (kept.error && !missing099(kept.error)) throw kept.error
  }
  const del = await db.from('club_locations').delete().eq('id', id).eq('club_id', clubId)
  if (del.error) throw del.error
}

/** The rooms in a new order — each one's place in the list. */
export async function orderRooms(db: Db, clubId: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await db.from('club_locations').update({ position: i }).eq('id', ids[i]).eq('club_id', clubId)
    if (error) { if (missing099(error)) throw new LocationsNotReady(); throw error }
  }
}
