'use client'

import { useMemo, useState } from 'react'
import {
  filterCourses, countyList, countyOf, courseNameError, countyError, websiteError,
  emptyTeeDraft, teeDraftBlank, teeDraftError, parseTeeDraft,
  MAX_COURSE_NAME, MAX_LOCATION, MAX_COUNTY, MAX_WEBSITE, IRISH_COUNTIES,
  type DirectoryCourse, type TeeDraft,
} from '@/lib/courseDirectory'
import type { SuggestedTee } from '@/lib/courseLookup'
import CardCheck from '@/app/scoring/CardCheck'
import { FIELD, FIELD_LABEL, buttonClass, Badge } from './ui'
import { IconChevronDown, IconX, IconPlus } from './icons'

/**
 * Choosing a course, now that the list outgrew a dropdown.
 *
 * A native select was fine for twelve Irish links; a directory anyone can
 * add to needs a search box and a way to narrow. This is the stats page's
 * course picker grown up: the same rows, the same green dot for the one
 * that counts — opened as its own screen, with the controls pinned at the
 * top while the list scrolls under them.
 *
 * The other thing this screen is: the door for new courses. The add form
 * lives here rather than on some admin page because the moment you need it
 * is the moment the search came back empty. A course added here is a
 * platform row — every trip sees it — and it arrives *unverified*: pars
 * and stroke indices only ever come from a scorecard, so the form ends by
 * asking for a photo of one, and is honest that waiting until the day
 * works too.
 *
 * All state is local. The one thing that leaves is `onCourseAdded`, so the
 * caller's course list learns what the directory now holds.
 */

type View =
  | { kind: 'closed' }
  | { kind: 'browse' }
  | { kind: 'add' }
  | { kind: 'created'; course: DirectoryCourse }

export default function CourseSelect({
  courses, value, onChange, onCourseAdded,
}: {
  courses: DirectoryCourse[]
  /** The chosen course id, or '' for none yet. */
  value: string
  onChange: (id: string) => void
  /**
   * A course was added (or re-announced with `card_verified` freshly true).
   * Upsert it by id — the picker itself only reads `courses`.
   */
  onCourseAdded: (course: DirectoryCourse) => void
}) {
  const [view, setView] = useState<View>({ kind: 'closed' })
  const [search, setSearch] = useState('')
  const [county, setCounty] = useState<string | null>(null)

  const counties = useMemo(() => countyList(courses), [courses])
  const shown = useMemo(
    () => filterCourses(courses, search, county),
    [courses, search, county],
  )
  const chosen = courses.find(c => c.id === value) ?? null

  function close() {
    setView({ kind: 'closed' })
    setSearch('')
    setCounty(null)
  }

  const chip = (on: boolean) =>
    `flex-shrink-0 inline-flex items-center px-3.5 py-2 t-label rounded-xl border transition-colors duration-150 ${
      on
        ? 'bg-accent-deep text-white font-bold border-accent-deep'
        : 'bg-surface border-bark/12 text-ink/65 hover:text-ink/80'
    }`

  // ── The field the sheet opens from ──
  const trigger = (
    <button
      type="button"
      onClick={() => setView({ kind: 'browse' })}
      className={`${FIELD} flex items-center gap-3 text-left`}
    >
      <span className={`flex-1 min-w-0 truncate ${chosen ? 'text-ink' : 'text-ink/60'}`}>
        {chosen ? chosen.name : 'Choose a course'}
      </span>
      {chosen?.card_verified === false && <Badge>Awaiting scorecard</Badge>}
      <span className="flex-shrink-0 text-ink/65">
        <IconChevronDown size={16} />
      </span>
    </button>
  )

  if (view.kind === 'closed') return trigger

  return (
    <>
      {trigger}
      <div className="fixed inset-0 z-[60] flex flex-col bg-cream">
        {/* ── Header — always pinned, like the stats page's own ── */}
        <div className="flex-shrink-0 border-b border-bark/12">
          <div className="max-w-lg mx-auto w-full px-4 pt-4 pb-3 flex items-center justify-between">
            <h2 className="t-h2 text-ink">
              {view.kind === 'browse' ? 'Choose a course'
                : view.kind === 'add' ? 'Add a new course'
                : 'Course added'}
            </h2>
            <button
              type="button"
              onClick={view.kind === 'add' ? () => setView({ kind: 'browse' }) : close}
              aria-label={view.kind === 'add' ? 'Back to the course list' : 'Close'}
              className="w-11 h-11 -mr-2 flex items-center justify-center text-ink/65 hover:text-ink"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* The instrument's controls: search, then where. They stay put
              while the list scrolls away underneath — the whole point of
              this screen over the dropdown it replaced. */}
          {view.kind === 'browse' && (
            <div className="max-w-lg mx-auto w-full px-4 pb-3">
              {/* No autofocus: this screen opens as a list to read, and the
                  keyboard was rising over half of it before a single course
                  had been seen. It arrives when the search is tapped. */}
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or town"
                className={FIELD}
                aria-label="Search courses"
              />
              {counties.length > 1 && (
                <div className="flex gap-1.5 mt-2.5 overflow-x-auto -mx-1 px-1 pb-1">
                  <button type="button" aria-pressed={county === null}
                    onClick={() => setCounty(null)} className={chip(county === null)}>
                    All
                  </button>
                  {counties.map(c => (
                    <button key={c} type="button" aria-pressed={county === c}
                      onClick={() => setCounty(county === c ? null : c)} className={chip(county === c)}>
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {/* The way to a new course — up here in the pinned header, not
                  at the foot of the screen, because the keyboard owns the
                  foot of the screen the moment the search is tapped, and the
                  moment you need this button is the moment a search found
                  nothing. */}
              <div className="flex items-center justify-between gap-3 mt-2.5">
                <p className="t-cap text-ink/65">Golf course not listed?</p>
                <button
                  type="button"
                  onClick={() => setView({ kind: 'add' })}
                  className={`${buttonClass('secondary', false)} flex-shrink-0`}
                >
                  <IconPlus size={16} />
                  Add a new course
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── The scrolling middle ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto w-full px-4">
            {view.kind === 'browse' && (
              <ul role="listbox" aria-label="Courses">
                {shown.map(c => {
                  const on = c.id === value
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => { onChange(c.id); close() }}
                        className={`w-full flex items-center gap-3 px-1 py-3.5 text-left border-b border-bark/[0.08] transition-colors duration-150 ${
                          on ? 'bg-accent/[0.06]' : 'active:bg-bark/[0.04]'
                        }`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className={`block truncate t-card ${on ? 'text-accent-deep font-semibold' : 'text-ink'}`}>
                            {c.name}
                          </span>
                          {c.location && (
                            <span className="block truncate t-cap text-ink/65 mt-0.5">{c.location}</span>
                          )}
                        </span>
                        {c.card_verified === false && (
                          <Badge className="flex-shrink-0">Awaiting scorecard</Badge>
                        )}
                        {/* The green dot, marking the one that counts. */}
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${on ? 'bg-accent' : 'bg-transparent'}`}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  )
                })}
                {shown.length === 0 && (
                  <li className="py-10 text-center t-body text-ink/65">
                    No course matches{search.trim() ? ` “${search.trim()}”` : ''} —
                    add it above and it is there for everyone.
                  </li>
                )}
              </ul>
            )}

            {view.kind === 'add' && (
              <AddCourseForm
                existing={courses}
                prefillName={search.trim()}
                onCreated={course => {
                  onCourseAdded(course)
                  onChange(course.id)
                  setView({ kind: 'created', course })
                }}
              />
            )}

            {view.kind === 'created' && (
              <div className="py-5 space-y-4">
                <p className="t-body text-ink">
                  ✓ <span className="font-semibold">{view.course.name}</span> is
                  on the list and chosen for this round.
                </p>
                <p className="t-cap text-ink/65 leading-snug">
                  One thing left: the scorecard. A course is not verified until
                  a photo of its printed card has been read — that is where the
                  pars and stroke indices come from. Photograph one now, upload
                  a picture saved from the club&apos;s website, or wait until the
                  day of play: the scoring screen asks for the card before
                  anyone tees off.
                </p>
                <CardCheck
                  courseId={view.course.id}
                  onApplied={() => onCourseAdded({ ...view.course, card_verified: true })}
                />
                <button type="button" onClick={close} className={buttonClass('primary')}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  )
}

// ─── The add form ──────────────────────────────────────────────

type LookupState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'said'; message: string; found: boolean }

function AddCourseForm({
  existing, prefillName, onCreated,
}: {
  existing: DirectoryCourse[]
  /** The search that came back empty is probably the name. */
  prefillName: string
  onCreated: (course: DirectoryCourse) => void
}) {
  const [name, setName] = useState(prefillName)
  const [county, setCounty] = useState('')
  const [location, setLocation] = useState('')
  const [website, setWebsite] = useState('')
  const [tees, setTees] = useState<TeeDraft[]>([emptyTeeDraft()])
  const [lookup, setLookup] = useState<LookupState>({ kind: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateTee(i: number, patch: Partial<TeeDraft>) {
    setTees(prev => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }

  /**
   * The website read for its ratings box. Suggestions land in empty rows
   * and never overwrite a figure somebody typed — the person is the
   * authority here, the site is a convenience.
   */
  async function runLookup() {
    const websiteProblem = websiteError(website)
    if (!website.trim() || websiteProblem) {
      setLookup({ kind: 'said', message: websiteProblem ?? 'Enter the course website first.', found: false })
      return
    }
    setLookup({ kind: 'busy' })
    try {
      const res = await fetch('/api/course-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website }),
      })
      const body = await res.json().catch(() => null) as
        { ok: boolean; message?: string; location?: string | null; tees?: SuggestedTee[] } | null
      if (!body?.ok) {
        setLookup({
          kind: 'said',
          message: body?.message ?? 'Could not read the website — fill the ratings in by hand.',
          found: false,
        })
        return
      }
      if (body.location) {
        setLocation(prev => prev.trim() ? prev : body.location!)
        // The county the location implies, into an empty county field only —
        // a suggestion the person confirms, like everything the lookup says.
        const implied = countyOf({ county: null, location: body.location })
        if (implied) setCounty(prev => prev.trim() ? prev : implied)
      }
      const suggested = (body.tees ?? []).map(t => ({
        name: t.name,
        gender: t.gender,
        par: t.par == null ? '' : String(t.par),
        courseRating: t.courseRating == null ? '' : String(t.courseRating),
        slope: t.slope == null ? '' : String(t.slope),
      }))
      if (suggested.length > 0) {
        setTees(prev => {
          const kept = prev.filter(t => !teeDraftBlank(t))
          const fresh = suggested.filter(s =>
            !kept.some(k => k.name.trim().toLowerCase() === s.name.toLowerCase() && k.gender === s.gender))
          return [...kept, ...fresh]
        })
      }
      setLookup({
        kind: 'said',
        found: true,
        message: suggested.length > 0
          ? `Read ${suggested.length} tee${suggested.length === 1 ? '' : 's'} from the site — check every figure against the printed card or your golf association app before saving.`
          : 'Found the course, but no ratings on the site — they will be in your golf association app.',
      })
    } catch {
      setLookup({ kind: 'said', message: 'Could not read the website — fill the ratings in by hand.', found: false })
    }
  }

  async function submit() {
    setError(null)
    const nameProblem = courseNameError(name, existing.map(c => c.name))
    if (nameProblem) { setError(nameProblem); return }
    const countyProblem = countyError(county)
    if (countyProblem) { setError(countyProblem); return }
    const websiteProblem = websiteError(website)
    if (websiteProblem) { setError(websiteProblem); return }
    const filled = tees.filter(t => !teeDraftBlank(t))
    for (const t of filled) {
      const problem = teeDraftError(t)
      if (problem) { setError(problem); return }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          county: county.trim(),
          location: location.trim(),
          website: website.trim(),
          tees: filled.map(parseTeeDraft),
        }),
      })
      const body = await res.json().catch(() => null) as
        { ok: boolean; message?: string; course?: DirectoryCourse } | null
      if (!body?.ok || !body.course) {
        setError(body?.message ?? 'Could not add the course — try again.')
        setSubmitting(false)
        return
      }
      onCreated(body.course)
    } catch {
      setError('Could not add the course — try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="py-5 space-y-5 pb-10">
      <div>
        <label className={FIELD_LABEL} htmlFor="nc-name">Course name</label>
        {/* No autofocus. Focusing this on open raised the keyboard over the
            bottom half of the form, so "add a course" opened as a name field
            and a wall of glass. The keyboard should arrive when a finger
            asks for it, not with the form. */}
        <input
          id="nc-name" type="text" value={name}
          maxLength={MAX_COURSE_NAME}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Lahinch Golf Club — Old Course"
          className={FIELD}
        />
      </div>

      <div>
        <label className={FIELD_LABEL} htmlFor="nc-county">County</label>
        {/* The filter. The chips on the course list are counties and this
            is where a course gets its one — required, because a course with
            no county can only ever be found by search. Free text with the
            thirty-two as suggestions: the platform has no rule that a
            course is in Ireland. */}
        <input
          id="nc-county" type="text" value={county}
          maxLength={MAX_COUNTY}
          onChange={e => setCounty(e.target.value)}
          placeholder="e.g. Donegal"
          list="nc-county-list"
          className={FIELD}
        />
        <datalist id="nc-county-list">
          {IRISH_COUNTIES.map(c => <option key={c} value={c} />)}
        </datalist>
        <p className="t-cap text-ink/65 mt-2 leading-snug">
          The course files under its county on the list — it is how the next
          group finds it.
        </p>
      </div>

      <div>
        <label className={FIELD_LABEL} htmlFor="nc-location">Where it is</label>
        <input
          id="nc-location" type="text" value={location}
          maxLength={MAX_LOCATION}
          onChange={e => setLocation(e.target.value)}
          placeholder="Town, County, Country"
          className={FIELD}
        />
        <p className="t-cap text-ink/65 mt-2 leading-snug">
          Optional — shown under the course&apos;s name on the list.
        </p>
      </div>

      <div>
        <label className={FIELD_LABEL} htmlFor="nc-website">Website</label>
        <div className="flex gap-2">
          <input
            id="nc-website" type="url" inputMode="url" value={website}
            maxLength={MAX_WEBSITE}
            autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={e => setWebsite(e.target.value)}
            placeholder="carnegolflinks.com"
            className={`${FIELD} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={runLookup}
            disabled={lookup.kind === 'busy'}
            className={`${buttonClass('secondary', false)} flex-shrink-0 whitespace-nowrap`}
          >
            {lookup.kind === 'busy' ? 'Reading…' : 'Read the site'}
          </button>
        </div>
        {lookup.kind === 'busy' && (
          <p className="t-cap text-ink/65 mt-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
            Looking for the ratings box…
          </p>
        )}
        {lookup.kind === 'said' && (
          <p className={`t-cap mt-2 leading-snug ${lookup.found ? 'text-accent-deep' : 'text-ink/65'}`}>
            {lookup.message}
          </p>
        )}
        {lookup.kind === 'idle' && (
          <p className="t-cap text-ink/65 mt-2 leading-snug">
            Optional. Reading the site can fill the ratings in for you.
          </p>
        )}
      </div>

      {/* ── Tees ── */}
      <div>
        <p className={FIELD_LABEL}>Tees — course rating and slope</p>
        <p className="t-cap text-ink/65 mb-3 leading-snug">
          Both are printed on the scorecard, and your golf association&apos;s
          app (Golf Ireland, England Golf, the USGA GHIN app…) lists them
          under the course&apos;s tees. Optional now — a scorecard photo can
          supply them later — but handicaps need them before play.
        </p>

        <div className="space-y-3">
          {tees.map((tee, i) => (
            <div key={i} className="bg-surface border border-bark/12 rounded-2xl p-3 space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text" value={tee.name}
                  onChange={e => updateTee(i, { name: e.target.value })}
                  placeholder="Colour — White, Red…"
                  aria-label={`Tee ${i + 1} colour`}
                  className={`${FIELD} min-w-0 flex-1`}
                />
                <div className="flex gap-1.5 flex-shrink-0">
                  {(['M', 'F'] as const).map(g => (
                    <button
                      key={g} type="button"
                      onClick={() => updateTee(i, { gender: g })}
                      aria-label={g === 'M' ? `Tee ${i + 1}: men's` : `Tee ${i + 1}: ladies`}
                      className={`w-11 rounded-xl text-sm font-medium transition-colors ${
                        tee.gender === g
                          ? 'bg-accent-deep text-white'
                          : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {tees.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setTees(prev => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove tee ${i + 1}`}
                    className="flex-shrink-0 w-11 flex items-center justify-center text-ink/50 hover:text-rust transition-colors"
                  >
                    <IconX size={16} />
                  </button>
                )}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <input
                  type="number" inputMode="numeric" value={tee.par}
                  onChange={e => updateTee(i, { par: e.target.value })}
                  placeholder="Par" aria-label={`Tee ${i + 1} par`}
                  className={`${FIELD} min-w-0`}
                />
                <input
                  type="number" inputMode="decimal" step="0.1" value={tee.courseRating}
                  onChange={e => updateTee(i, { courseRating: e.target.value })}
                  placeholder="CR 71.4" aria-label={`Tee ${i + 1} course rating`}
                  className={`${FIELD} min-w-0`}
                />
                <input
                  type="number" inputMode="numeric" value={tee.slope}
                  onChange={e => updateTee(i, { slope: e.target.value })}
                  placeholder="Slope" aria-label={`Tee ${i + 1} slope`}
                  className={`${FIELD} min-w-0`}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setTees(prev => [...prev, emptyTeeDraft(prev.some(t => t.gender === 'F') ? 'M' : prev.length >= 1 ? 'F' : 'M')])}
          className="w-full mt-3 py-3.5 border border-dashed border-bark/25 rounded-xl text-ink/65 text-sm hover:border-bark/25 hover:text-ink/80 transition-colors"
        >
          + Add another tee
        </button>
      </div>

      <div className="px-4 py-3.5 bg-surface border border-bark/12 rounded-xl">
        <p className="t-cap text-ink/80 leading-snug">
          The last step is a scorecard: pars and stroke indices only ever come
          from the printed card, so the course stays{' '}
          <span className="font-semibold">unverified</span> until a photo of
          one has been read. You can do that right after saving — or wait
          until the day, when the scoring screen asks for it.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rust/10 border border-rust/30 rounded-xl">
          <p className="text-rust-deep text-sm">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className={buttonClass('primary')}
      >
        {submitting ? 'Adding…' : 'Add course'}
      </button>
    </div>
  )
}
