'use client'

import { useEffect, useMemo, useState } from 'react'
import CourseSelect from '@/app/components/CourseSelect'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { IconChevronDown, IconChevronUp } from '@/app/components/icons'
import { FIELD, buttonClass } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import { LOCATION_NAME_MAX, NO_PLACES, roomNameIssue, shortCourse, type ClubPlaces } from '@/lib/clubLocations'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { useShell } from '../ShellContext'

/**
 * The club's locations (D277): the courses, worked out and listed unasked —
 * Course 1, Course 2… (just "Course" for a one-course club) — and the rooms
 * the club books into, in its own order. A course can be added before any
 * competition uses it; only one added by hand can be taken off. A room taken
 * off leaves its events with its name as their Where.
 */
export default function ClubLocations({ clubId }: { clubId: string }) {
  const { may } = useShell()
  const keeps = may('keep_calendar')
  const [places, setPlaces] = useState<ClubPlaces | null>(null)
  const [lost, setLost] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [addingCourse, setAddingCourse] = useState(false)
  const [busy, setBusy] = useState(false)
  const [say, setSay] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    let live = true
    void askClub('places', { clubId }).then(r => {
      if (!live) return
      if (r.ok) setPlaces(r.places ?? NO_PLACES); else setLost(true)
    })
    return () => { live = false }
  }, [clubId])

  async function act(action: string, body: Record<string, unknown>, done: string) {
    setBusy(true); setSay(null)
    const r = await askClub(action, { clubId, ...body })
    setBusy(false)
    if (!r.ok) { setSay({ text: r.error, error: true }); return false }
    setPlaces(r.places ?? places)
    setSay({ text: done, error: false })
    return true
  }

  const rooms = places?.rooms ?? []
  const addWhy = name.trim() ? roomNameIssue(name, rooms) : null
  const move = (i: number, by: -1 | 1) => {
    const ids = rooms.map(r => r.id)
    const j = i + by
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void act('location.order', { ids }, 'Order saved.')
  }

  return (
    <section id="locations" aria-labelledby="loc-title" className="scroll-mt-24">
      <h2 id="loc-title" className="t-card text-ink">Locations</h2>
      <p className="t-cap text-ink/65 mt-1">Where the club’s events happen. The courses are listed for you.</p>
      {lost && <p role="alert" className="t-cap text-ink/80 mt-3">Could not reach Green Dot — try again.</p>}
      {!places && !lost && <div className="skeleton h-24 rounded-tile mt-4" />}
      {places && (
        <>
          <h3 className="t-label text-ink mt-4">Courses</h3>
          {places.courses.length === 0 ? (
            <p className="t-cap text-ink/65 mt-1">No course yet — choose the home course, or add one.</p>
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {places.courses.map(c => (
                <li key={c.courseId} className="flex items-center gap-3 min-h-12">
                  <span className="flex-1 min-w-0">
                    <span className="block text-ink text-[15px] font-medium">{c.label}</span>
                    <span className="block t-cap text-ink/65 truncate">{shortCourse(c.name) === c.name ? c.name : `${shortCourse(c.name)} · ${c.name}`}</span>
                  </span>
                  {keeps && c.locationId && places.ready && (
                    <button type="button" disabled={busy} onClick={() => void act('location.delete', { id: c.locationId }, `${c.label} taken off.`)}
                      className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Take off</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {keeps && places.ready && (addingCourse
            ? <AddCourse taken={places.courses.map(c => c.courseId)} onPick={async id => { if (await act('location.course', { courseId: id }, 'Course added.')) setAddingCourse(false) }} onCancel={() => setAddingCourse(false)} />
            : <button type="button" onClick={() => setAddingCourse(true)} className={`${buttonClass('quiet', false, true)} ch-focus mt-2`}>Add another course</button>)}

          <h3 className="t-label text-ink mt-5">Rooms and places</h3>
          {!places.ready ? (
            <p className="t-cap text-ink/65 mt-1">Rooms aren’t set up yet — try again later.</p>
          ) : (
            <>
              {rooms.length === 0 && <p className="t-cap text-ink/65 mt-1">None yet — the bar, the function room, the locker rooms.</p>}
              <ul className="mt-1 divide-y divide-line">
                {rooms.map((r, i) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 min-h-12 py-1">
                    {renaming?.id === r.id ? (
                      <form className="flex flex-1 gap-2 min-w-[12rem]" onSubmit={async e => { e.preventDefault(); if (await act('location.save', { id: r.id, name: renaming.name }, 'Renamed.')) setRenaming(null) }}>
                        <input autoFocus aria-label={`New name for ${r.name}`} value={renaming.name} maxLength={LOCATION_NAME_MAX}
                          onChange={e => setRenaming({ id: r.id, name: e.target.value })} onKeyDown={e => { if (e.key === 'Escape') setRenaming(null) }} className={`${FIELD} ch-focus`} />
                        <button type="submit" disabled={busy || !!roomNameIssue(renaming.name, rooms, r.id)} className={`${buttonClass('secondary', false, true)} ch-focus`}>Save</button>
                      </form>
                    ) : (
                      <span className="flex-1 min-w-0 text-ink text-[15px] font-medium truncate">{r.name}</span>
                    )}
                    {keeps && renaming?.id !== r.id && (deleting === r.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="t-cap text-ink/80">Take {r.name} off? Its events keep the name as their Where.</span>
                        <button type="button" disabled={busy} onClick={async () => { if (await act('location.delete', { id: r.id }, `${r.name} taken off.`)) setDeleting(null) }} className={`${buttonClass('danger', false, true)} ch-focus`}>Take off</button>
                        <button type="button" onClick={() => setDeleting(null)} className={`${buttonClass('quiet', false, true)} ch-focus`}>Keep</button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${r.name} up`} className="ch-hover ch-focus rounded-tile w-9 h-9 inline-flex items-center justify-center text-ink disabled:text-ink/30"><IconChevronUp size={18} /></button>
                        <button type="button" disabled={busy || i === rooms.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${r.name} down`} className="ch-hover ch-focus rounded-tile w-9 h-9 inline-flex items-center justify-center text-ink disabled:text-ink/30"><IconChevronDown size={18} /></button>
                        <button type="button" onClick={() => { setRenaming({ id: r.id, name: r.name }); setSay(null) }} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Rename</button>
                        <button type="button" onClick={() => { setDeleting(r.id); setSay(null) }} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Take off</button>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              {keeps && (
                <form className="flex gap-2 mt-3" onSubmit={async e => { e.preventDefault(); if (!addWhy && name.trim() && await act('location.save', { name }, `${name.trim()} added.`)) setName('') }}>
                  <label htmlFor="loc-new" className="sr-only">A new place</label>
                  <input id="loc-new" value={name} maxLength={LOCATION_NAME_MAX} placeholder="e.g. Function room" onChange={e => setName(e.target.value)} className={`${FIELD} ch-focus`} />
                  <button type="submit" disabled={busy || !name.trim() || !!addWhy} className={`${buttonClass('secondary', false)} ch-focus whitespace-nowrap`}>Add</button>
                </form>
              )}
              {addWhy && <p className="t-cap text-rust-deep mt-2" role="alert">{addWhy}</p>}
            </>
          )}
          {say && <p role={say.error ? 'alert' : 'status'} className={`t-cap mt-3 ${say.error ? 'text-rust-deep' : 'text-ink/80'}`}>{say.text}</p>}
        </>
      )}
    </section>
  )
}

function AddCourse({ taken, onPick, onCancel }: { taken: string[]; onPick: (id: string) => void; onCancel: () => void }) {
  const { courses: listed } = usePlatformCourses(true)
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const courses = useMemo(() => [...listed.filter(c => !added.some(a => a.id === c.id)), ...added].filter(c => !taken.includes(c.id)), [listed, added, taken])
  return (
    <div className="mt-3">
      <CourseSelect courses={courses} value="" onChange={id => { if (id) onPick(id) }} onCourseAdded={c => setAdded(a => [...a.filter(x => x.id !== c.id), c])} />
      <button type="button" onClick={onCancel} className={`${buttonClass('quiet', false, true)} ch-focus mt-2`}>Cancel</button>
    </div>
  )
}
