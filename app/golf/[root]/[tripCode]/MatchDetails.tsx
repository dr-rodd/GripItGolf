'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  CONTACT_VISIBILITIES, MAX_PHONE, type ContactVisibility, type PlayerContact,
} from '@/lib/matchArrangements'
import { MAX_EMAIL } from '@/lib/email'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { Sheet } from '@/app/components/ItineraryForms'
import CourseSelect from '@/app/components/CourseSelect'
import { FIELD, FIELD_LABEL, ListRow, optionClass } from '@/app/components/ui'

/**
 * Your details on a match play event, from the hub (docs/event-use-cases.md,
 * story 2): your home club — offered first when one of your matches is
 * arranged — and, if you want, a phone number and an email for arranging
 * matches, shown to your opponent only or to the field, as you choose.
 *
 * The home club is a column on your player row (migration 057); the contact
 * details go through `/api/match/contact` into a table the browser cannot
 * read, because an opponent-only number cannot sit where anybody with the
 * event's code can read it.
 */
export default function MatchDetails({
  tripId, tripCode, playerId, homeCourseId, homeCourseName, contact, allowAddCourse,
}: {
  tripId: string
  tripCode: string
  playerId: string
  homeCourseId: string | null
  homeCourseName: string | null
  contact: PlayerContact | null
  allowAddCourse: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [home, setHome] = useState(homeCourseId ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [visibility, setVisibility] = useState<ContactVisibility>(contact?.visibility ?? 'opponent')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { courses } = usePlatformCourses(open)
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const allCourses = useMemo(() => {
    const known = new Set(courses.map(c => c.id))
    return [...courses, ...added.filter(c => !known.has(c.id))].sort((a, b) => a.name.localeCompare(b.name))
  }, [courses, added])

  function openSheet() {
    setHome(homeCourseId ?? '')
    setPhone(contact?.phone ?? '')
    setEmail(contact?.email ?? '')
    setVisibility(contact?.visibility ?? 'opponent')
    setError(null)
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    if ((home || null) !== homeCourseId) {
      const { error: err } = await supabase.from('players')
        .update({ home_course_id: home || null })
        .eq('id', playerId).eq('trip_id', tripId)
      if (err) {
        console.error('Home club write failed:', err)
        setSaving(false)
        setError('Could not save your home club — try again.')
        return
      }
    }
    try {
      const res = await fetch('/api/match/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode, phone, email, visibility }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setSaving(false)
        setError(body.message ?? 'Could not save your contact details — try again.')
        return
      }
    } catch {
      setSaving(false)
      setError('Could not reach the site — check your connection and try again.')
      return
    }
    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  const shown = [homeCourseName ?? 'No home club yet', contact?.phone || contact?.email ? 'contact details set' : null]
    .filter(Boolean).join(' · ')

  return (
    <>
      <div className="mt-3">
        <ListRow label="Your home club and contact" hint={shown} onClick={openSheet} />
      </div>

      {open && (
        <Sheet
          title="Your details"
          onClose={() => !saving && setOpen(false)}
          onAdd={save}
          addLabel={saving ? 'Saving…' : 'Save'}
          error={error}
        >
          <div>
            <label className={FIELD_LABEL}>Home club</label>
            <p className="t-cap text-ink/65 mb-2 leading-snug">Offered first when one of your matches is arranged.</p>
            <CourseSelect
              courses={allCourses}
              value={home}
              onChange={setHome}
              onCourseAdded={c => setAdded(prev => [...prev.filter(x => x.id !== c.id), c])}
              allowAdd={allowAddCourse}
            />
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="contact-phone">Phone (optional)</label>
            <input
              id="contact-phone" type="tel" inputMode="tel" autoComplete="tel"
              value={phone} onChange={e => setPhone(e.target.value)} maxLength={MAX_PHONE}
              className={FIELD}
            />
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="contact-email">Email (optional)</label>
            <input
              id="contact-email" type="email" inputMode="email" autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} maxLength={MAX_EMAIL}
              className={FIELD}
            />
          </div>

          <div>
            <p className={FIELD_LABEL}>Who sees them</p>
            <div className="flex flex-col gap-2">
              {CONTACT_VISIBILITIES.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVisibility(v.key)}
                  aria-pressed={visibility === v.key}
                  className={optionClass(visibility === v.key)}
                >
                  <span className="block text-sm font-medium text-ink">{v.label}</span>
                  <span className="block t-cap text-ink/65">{v.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}
