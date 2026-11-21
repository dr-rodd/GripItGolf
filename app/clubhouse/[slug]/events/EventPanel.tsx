'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconX } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, Segmented, buttonClass } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import { NO_PLACES, onCourse, shortCourse, type ClubPlaces } from '@/lib/clubLocations'
import {
  CLUB_EVENT_TYPES, NOTE_NOTES_MAX, NOTE_PLACE_MAX, NOTE_TITLE_MAX, mayBeOffice, mayBlockSheet, noteIssue, readClubNote, typeLabel,
  type ClubEventType, type ClubNote, type Visibility,
} from '@/lib/clubEvents'

/**
 * One of the club's own events, made or changed (stage c1, M1–M3): a side
 * panel of 400 — the title, the type, the days, the times, where, notes,
 * and who sees it. Office only is offered only for an event that does not
 * touch the golf (Ross, 17 Nov 2026). Deleting asks once.
 */
export default function EventPanel({ clubId, note, day, blocking, onClose, onSaved }: {
  clubId: string
  /** The event being changed — none for a new one. */
  note: ClubNote | null
  /** A new event's first day, where it was asked for from a day. */
  day?: string
  /** A new block booking, from the Tee sheet: a Golf event that takes the sheet. */
  blocking?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [type, setType] = useState<ClubEventType>(note?.type ?? (blocking ? 'GOLF' : 'SOCIAL'))
  const [startsOn, setStartsOn] = useState(note?.startsOn ?? day ?? '')
  const [endsOn, setEndsOn] = useState(note?.endsOn ?? '')
  const [startTime, setStartTime] = useState(note?.startTime ?? '')
  const [endTime, setEndTime] = useState(note?.endTime ?? '')
  const [place, setPlace] = useState(note?.place ?? '')
  // D277: a room (or Other with its text) for most events; the course for Golf and Course — asked only when the club has two.
  const [room, setRoom] = useState<string>(note?.locationId ?? 'other')
  const [courseId, setCourseId] = useState<string>(note?.locationCourseId ?? '')
  const [places, setPlaces] = useState<ClubPlaces>(NO_PLACES)
  useEffect(() => {
    let live = true
    void askClub('places', { clubId }).then(r => { if (live && r.ok && r.places) setPlaces(r.places) })
    return () => { live = false }
  }, [clubId])
  const [notes, setNotes] = useState(note?.notes ?? '')
  const [visibility, setVisibility] = useState<Visibility>(note?.visibility ?? 'members')
  const [blocks, setBlocks] = useState(note?.blocksSheet ?? !!blocking)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sure, setSure] = useState(false)

  const office = mayBeOffice(type)
  const blockable = mayBlockSheet(type)
  const golfy = onCourse(type)
  const roomPicked = !golfy && room !== 'other' && places.rooms.some(x => x.id === room)
  const draft = readClubNote({
    title, type, startsOn, endsOn, startTime, endTime, notes, visibility: office ? visibility : 'members', blocksSheet: blockable && blocks,
    // A room or course picked leaves no free text behind; Other keeps it.
    place: roomPicked || (golfy && places.courses.length > 0) ? '' : place,
    locationId: roomPicked ? room : null,
    locationCourseId: golfy && places.courses.length > 1 && courseId && courseId !== places.courses[0].courseId ? courseId : null,
  })
  const issue = noteIssue(draft)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const r = await askClub('event.save', { clubId, id: note?.id, event: draft })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved()
    onClose()
  }

  async function remove() {
    if (!note) return
    if (!sure) { setSure(true); return }
    setBusy(true); setError('')
    const r = await askClub('event.delete', { clubId, id: note.id })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="event-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <form onSubmit={e => { e.preventDefault(); void save() }}
        className="ch-panel relative w-full md:w-[400px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <h2 id="event-title" className="t-h2 text-ink flex-1 break-words">{note ? note.title : blocking ? 'Block the tee sheet' : 'New event'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="ev-title" className={FIELD_LABEL}>Title</label>
            <input id="ev-title" className={`${FIELD} ch-focus`} value={title} maxLength={NOTE_TITLE_MAX} placeholder={blocking ? 'e.g. Corporate outing: Acme Ltd' : 'e.g. AGM'}
              autoFocus={!note} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ev-type" className={FIELD_LABEL}>Type</label>
            <select id="ev-type" className={`${FIELD} ch-focus`} value={type} onChange={e => setType(e.target.value as ClubEventType)}>
              {CLUB_EVENT_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            {type === 'GOLF' && <p className="t-cap text-ink/65 mt-2">On the calendar, not booked here — an interclub, a society, a corporate outing. A competition members book is made with New competition.</p>}
          </div>
          {blockable && (
            // A block booking (Ross, 17 Nov 2026): the event has the course, so nobody books a casual time under it.
            <button type="button" role="checkbox" aria-checked={blocks} onClick={() => setBlocks(v => !v)}
              className="ch-hover ch-focus w-full flex items-start gap-3 text-left rounded-tile -mx-2 px-2 py-2">
              <span aria-hidden="true" className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 flex-shrink-0 rounded-[6px] border ${blocks ? 'bg-accent-deep border-accent-deep text-white' : 'bg-surface border-line-strong'}`}>
                {blocks && <IconCheck size={16} />}
              </span>
              <span>
                <span className="t-label text-ink block">Takes the tee sheet</span>
                <span className="t-cap text-ink/65 block">
                  {blocks
                    ? startTime ? 'No casual tee times from when it starts to when it ends. Members see it on the tee sheet with these notes.' : 'No casual tee times all day. Give it times to take part of the day.'
                    : 'Block booking — a corporate outing, a society, the course closed.'}
                </span>
              </span>
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ev-from" className={FIELD_LABEL}>Day</label>
              <input id="ev-from" type="date" className={`${FIELD} ch-focus`} value={startsOn} onChange={e => setStartsOn(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ev-to" className={FIELD_LABEL}>Last day <span className="text-ink/65 font-normal">(if more than one)</span></label>
              <input id="ev-to" type="date" className={`${FIELD} ch-focus`} value={endsOn} min={startsOn || undefined} onChange={e => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ev-start" className={FIELD_LABEL}>Starts</label>
              <input id="ev-start" type="time" className={`${FIELD} ch-focus`} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ev-end" className={FIELD_LABEL}>Ends</label>
              <input id="ev-end" type="time" className={`${FIELD} ch-focus`} value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          {golfy ? (
            places.courses.length > 1 ? (
              <div>
                <label htmlFor="ev-course" className={FIELD_LABEL}>Course</label>
                <select id="ev-course" className={`${FIELD} ch-focus`} value={courseId || places.courses[0].courseId} onChange={e => setCourseId(e.target.value)}>
                  {places.courses.map(c => <option key={c.courseId} value={c.courseId}>{c.label} · {shortCourse(c.name)}</option>)}
                </select>
              </div>
            ) : places.courses.length === 0 && (
              <div>
                <label htmlFor="ev-place" className={FIELD_LABEL}>Where</label>
                <input id="ev-place" className={`${FIELD} ch-focus`} value={place} maxLength={NOTE_PLACE_MAX} placeholder="e.g. The first tee" onChange={e => setPlace(e.target.value)} />
              </div>
            )
          ) : (
            <div>
              {places.rooms.length > 0 && (
                <>
                  <label htmlFor="ev-room" className={FIELD_LABEL}>Where</label>
                  <select id="ev-room" className={`${FIELD} ch-focus`} value={roomPicked ? room : 'other'} onChange={e => setRoom(e.target.value)}>
                    {places.rooms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    <option value="other">Other</option>
                  </select>
                </>
              )}
              {!roomPicked && (
                <>
                  <label htmlFor="ev-place" className={places.rooms.length > 0 ? 'sr-only' : FIELD_LABEL}>{places.rooms.length > 0 ? 'Where else' : 'Where'}</label>
                  <input id="ev-place" className={`${FIELD} ch-focus ${places.rooms.length > 0 ? 'mt-2' : ''}`} value={place} maxLength={NOTE_PLACE_MAX}
                    placeholder={places.rooms.length > 0 ? 'Where else — e.g. The Strand Hotel' : 'e.g. The clubhouse bar'} onChange={e => setPlace(e.target.value)} />
                </>
              )}
            </div>
          )}
          <div>
            <label htmlFor="ev-notes" className={FIELD_LABEL}>Notes</label>
            <textarea id="ev-notes" rows={4} className={`${FIELD} ch-focus h-auto`} value={notes} maxLength={NOTE_NOTES_MAX} onChange={e => setNotes(e.target.value)} />
          </div>
          <div>
            <p className={FIELD_LABEL}>Who sees it</p>
            {office ? (
              <>
                <Segmented label="Who sees it" value={visibility} onChange={setVisibility}
                  options={[{ value: 'members', label: 'Members' }, { value: 'office', label: 'Office only' }] as const} />
                <p className="t-cap text-ink/65 mt-2">
                  {visibility === 'office' ? 'Only the Clubhouse — never the members app, not even an Officer’s.' : 'In the members app, where the club shows this type.'}
                </p>
              </>
            ) : (
              <p className="t-cap text-ink/80">Members. {typeLabel(type)} events touch the golf, so they’re always shown.</p>
            )}
          </div>
        </div>

        {error && <p role="alert" className="t-cap text-rust-deep mt-4">{error}</p>}
        <div className="flex flex-wrap gap-3 mt-6">
          <button type="submit" disabled={busy || !!issue} className={`${buttonClass('primary', false)} ch-focus`}>
            {busy ? 'Saving…' : note ? 'Save' : 'Add the event'}
          </button>
          <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
          {note && (
            <button type="button" disabled={busy} onClick={() => void remove()} className={`${buttonClass('quiet', false)} ch-focus text-rust-deep ml-auto`}>
              {sure ? 'Delete it' : 'Delete'}
            </button>
          )}
        </div>
        {issue && title && !error && <p className="t-cap text-ink/65 mt-3">{issue}</p>}
      </form>
    </div>
  )
}
