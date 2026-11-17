import type { createAdminClient } from '@/lib/supabase-admin'
import { readHiddenTypes, readMemberHidden, type ClubEventType, type ClubNote } from '@/lib/clubEvents'

// A club's own events (`club_events`), what it shows its members
// (`clubs.hidden_event_types`) and what each member asks to see
// (`account_event_prefs`) — migration 095, read fail-soft: before it a club
// has no events of its own, shows everything, and every member sees it all.

type Db = ReturnType<typeof createAdminClient>

/** A table or column 095 makes, not there yet. */
export function missing095(e: { code?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || e.code === 'PGRST204')
}

/** The calendar is not set up yet (before 095). */
export class NotesNotReady extends Error {
  constructor() { super('club_events is missing (migration 095)'); this.name = 'NotesNotReady' }
}

const NOTE_COLS = 'id, ref, title, type, starts_on, ends_on, start_time, end_time, place, notes, visibility'
type NoteRow = {
  id: string; ref: string | null; title: string; type: ClubEventType; starts_on: string; ends_on: string | null
  start_time: string | null; end_time: string | null; place: string | null; notes: string | null; visibility: 'members' | 'office'
}
const asNote = (r: NoteRow): ClubNote => ({
  id: r.id, ref: r.ref, title: r.title, type: r.type, startsOn: r.starts_on, endsOn: r.ends_on,
  startTime: r.start_time, endTime: r.end_time, place: r.place, notes: r.notes, visibility: r.visibility,
})

/**
 * The club's own events, in date order — office ones too, for the
 * Clubhouse. `from` keeps those ending on or after a day. Null before 095.
 */
export async function readNotes(db: Db, clubId: string, opts: { from?: string; membersOnly?: boolean } = {}): Promise<ClubNote[] | null> {
  let q = db.from('club_events').select(NOTE_COLS).eq('club_id', clubId)
  if (opts.membersOnly) q = q.eq('visibility', 'members')
  if (opts.from) q = q.or(`ends_on.gte.${opts.from},and(ends_on.is.null,starts_on.gte.${opts.from})`)
  const { data, error } = await q.order('starts_on').order('start_time', { nullsFirst: true }).order('title').limit(2000)
  if (error) { if (missing095(error)) return null; throw error }
  return ((data ?? []) as NoteRow[]).map(asNote)
}

/** An event kept: a new one made, or this club's changed. The id. */
export async function saveNote(db: Db, clubId: string, n: Omit<ClubNote, 'id'> & { id: string | null }, by: { userId: string; batch?: string | null }): Promise<string> {
  const row = {
    club_id: clubId, ref: n.ref, title: n.title, type: n.type, starts_on: n.startsOn, ends_on: n.endsOn,
    start_time: n.startTime, end_time: n.endTime, place: n.place, notes: n.notes, visibility: n.visibility,
    updated_at: new Date().toISOString(),
    ...(by.batch ? { import_batch: by.batch } : {}),
  }
  const { data, error } = n.id
    ? await db.from('club_events').update(row).eq('id', n.id).eq('club_id', clubId).select('id').maybeSingle()
    : await db.from('club_events').insert({ ...row, created_by: by.userId }).select('id').single()
  if (error) { if (missing095(error)) throw new NotesNotReady(); throw error }
  if (!data) throw new Error('That event isn’t the club’s.')
  return (data as { id: string }).id
}

export async function deleteNote(db: Db, clubId: string, id: string): Promise<void> {
  const { error } = await db.from('club_events').delete().eq('id', id).eq('club_id', clubId)
  if (error) { if (missing095(error)) throw new NotesNotReady(); throw error }
}

/** The types the club does not show its members — none before 095. */
export async function readClubHidden(db: Db, clubId: string): Promise<ClubEventType[]> {
  const { data, error } = await db.from('clubs').select('hidden_event_types').eq('id', clubId).maybeSingle()
  if (error) return []
  return readHiddenTypes((data as { hidden_event_types?: unknown } | null)?.hidden_event_types)
}

export async function writeClubHidden(db: Db, clubId: string, types: ClubEventType[]): Promise<void> {
  const { error } = await db.from('clubs').update({ hidden_event_types: types.length ? types : null }).eq('id', clubId)
  if (error) { if (missing095(error)) throw new NotesNotReady(); throw error }
}

/** The types a member has asked not to see — none before 095. */
export async function readMemberHiddenOf(db: Db, userId: string): Promise<ClubEventType[]> {
  const { data, error } = await db.from('account_event_prefs').select('hidden_types').eq('user_id', userId).maybeSingle()
  if (error) return []
  return readMemberHidden((data as { hidden_types?: unknown } | null)?.hidden_types)
}

export async function writeMemberHidden(db: Db, userId: string, types: ClubEventType[]): Promise<void> {
  const { error } = await db.from('account_event_prefs').upsert({ user_id: userId, hidden_types: types, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { if (missing095(error)) throw new NotesNotReady(); throw error }
}
