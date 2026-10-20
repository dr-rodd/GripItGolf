'use client'

import { useEffect, useState } from 'react'
import {
  type GolfIrelandRules, type HoleRule, CARD_ENTRIES, COURSE_RULES, HOLE_RULES,
  describeWeekdays,
} from '@/lib/golfIreland'
import { WEEKDAY_NAMES } from '@/lib/weekdays'
import { LinkHeading } from './LinkMark'
import { ChoiceChips, FIELD_LABEL, cardClass, chipClass, optionClass } from './ui'

/**
 * Which Golf Ireland cards count — asked on a league's creation form when
 * its scores come from Golf Ireland (or from both).
 *
 * The clubs first: only clubs that have given Green Dot access to their
 * members are offered (`/api/golf-ireland/clubs`), because a player can
 * only find themselves in a club Green Dot can search. Then the four rules
 * lib/golfIreland.ts holds: how a card gets in, holes, days, where.
 *
 * A draft, edited whole — `weekdays` empty means any day, and the form's
 * own write tidies it (`parseGolfIrelandRules`) so every day ticked is
 * stored as absent, the same as none.
 */

type Club = { clubId: string; name: string }

/** Monday first on screen — how a club's fixtures read — stored Sunday-first. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function GolfIrelandRulesForm({ value, onChange }: {
  value: GolfIrelandRules
  onChange: (next: GolfIrelandRules) => void
}) {
  const [clubs, setClubs] = useState<Club[] | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/golf-ireland/clubs')
      .then(r => r.json())
      .then((b: { clubs?: Club[] }) => { if (live) setClubs(b.clubs ?? []) })
      .catch(() => { if (live) setClubs([]) })
    return () => { live = false }
  }, [])

  const set = (patch: Partial<GolfIrelandRules>) => onChange({ ...value, ...patch })
  const days = value.weekdays ?? []
  const anyDay = value.weekdays === undefined

  function toggleClub(id: string) {
    set({ clubs: value.clubs.includes(id) ? value.clubs.filter(c => c !== id) : [...value.clubs, id] })
  }
  function toggleDay(d: number) {
    set({ weekdays: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort((a, b) => a - b) })
  }

  return (
    <div className={`p-4 space-y-5 ${cardClass()}`}>
      <LinkHeading>Golf Ireland</LinkHeading>

      <div>
        <label className={FIELD_LABEL}>Which clubs?</label>
        {clubs === null ? (
          <p className="text-ink/65 text-[13px] leading-snug">Looking for clubs…</p>
        ) : clubs.length === 0 ? (
          <p className="text-ink/65 text-[13px] leading-snug">
            No club has given Green Dot access to its members yet. Access has
            been asked for; a club appears here once it says yes.
          </p>
        ) : (
          <div className="space-y-2">
            {clubs.map(c => (
              <button
                key={c.clubId}
                type="button"
                onClick={() => toggleClub(c.clubId)}
                aria-pressed={value.clubs.includes(c.clubId)}
                className={optionClass(value.clubs.includes(c.clubId), 'row')}
              >
                <span className="text-[17px] font-medium text-ink">{c.name}</span>
              </button>
            ))}
            <p className="text-ink/65 text-[13px] leading-snug">
              Players search their own club&apos;s membership to link themselves.
            </p>
          </div>
        )}
      </div>

      <div>
        <label className={FIELD_LABEL}>How does a round get in?</label>
        <div className="space-y-2">
          {CARD_ENTRIES.map(e => (
            <button
              key={e.key}
              type="button"
              onClick={() => set({ entry: e.key })}
              aria-pressed={value.entry === e.key}
              className={optionClass(value.entry === e.key)}
            >
              <p className="text-[17px] font-medium leading-snug text-ink">{e.label}</p>
              <p className="t-cap text-ink/65 mt-0.5">{e.hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={FIELD_LABEL}>Holes</label>
        <ChoiceChips
          label="Holes"
          options={HOLE_RULES.map(h => ({ value: String(h.key), label: h.label }))}
          value={String(value.holes)}
          onChange={v => set({ holes: (v === 'either' ? 'either' : Number(v)) as HoleRule })}
        />
      </div>

      <div>
        <label className={FIELD_LABEL}>Which days?</label>
        <ChoiceChips
          label="Which days"
          options={[{ value: 'any', label: 'Any day' }, { value: 'chosen', label: 'Chosen days' }]}
          value={anyDay ? 'any' : 'chosen'}
          onChange={v => {
            const rest = { ...value }
            delete rest.weekdays
            onChange(v === 'any' ? rest : { ...rest, weekdays: [] })
          }}
        />
        {!anyDay && (
          <>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {WEEK_ORDER.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={days.includes(d)}
                  aria-label={WEEKDAY_NAMES[d]}
                  className={`${chipClass(days.includes(d), true)} w-12`}
                >
                  {WEEKDAY_NAMES[d].slice(0, 3)}
                </button>
              ))}
            </div>
            <p className="text-ink/65 text-[13px] mt-2 leading-snug">
              {days.length === 0 || days.length === 7
                ? 'Tick the days a round may be played on.'
                : `Only rounds played on ${describeWeekdays(days)} count.`}
            </p>
          </>
        )}
      </div>

      <div>
        <label className={FIELD_LABEL}>Where?</label>
        <div className="space-y-2">
          {COURSE_RULES.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => set({ courses: c.key })}
              aria-pressed={value.courses === c.key}
              className={optionClass(value.courses === c.key)}
            >
              <p className="text-[17px] font-medium leading-snug text-ink">{c.label}</p>
              <p className="t-cap text-ink/65 mt-0.5">{c.hint}</p>
            </button>
          ))}
        </div>
        {value.courses === 'venues' && (
          <p className="text-ink/65 text-[13px] mt-2 leading-snug">
            A venue takes cards once it is matched to Golf Ireland&apos;s own
            record of the course. None is matched until access is granted.
          </p>
        )}
      </div>

      <p className="text-ink/65 text-[13px] leading-snug">
        Every round must also fall inside the league&apos;s dates. Golf
        Ireland&apos;s own Stableford figure is the one counted.
      </p>
    </div>
  )
}
