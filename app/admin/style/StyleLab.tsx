'use client'

import { useState } from 'react'
import {
  AXES, applySetup, fontStack, labCount, previewLink, rememberSetup, resetSetup,
  serialiseSetup, type AxisKey, type FontOption, type Setup,
} from '@/lib/styleLab'
import { useLabSetup } from '@/app/components/useLabSetup'
import TitleMark from '@/app/components/TitleMark'
import { Button, Card, FIELD, Field, Pill, chipClass } from '@/app/components/ui'

/**
 * The lab's controls and its specimen.
 *
 * Every tap applies at once — attributes on <html> and the cookie, no reload
 * — so the specimen above the chips, and every other screen this phone opens
 * afterwards, is already wearing the choice. The specimen is made of the
 * real parts, never look-alikes: a look that only works on a mock-up is not
 * a look that works.
 */
export default function StyleLab() {
  const setup = useLabSetup()
  const [note, setNote] = useState('')

  const choose = (axis: AxisKey, id: string) => {
    const next: Setup = { ...setup, [axis]: id }
    applySetup(next)
    rememberSetup(next)
    setNote('')
  }

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNote(done)
    } catch {
      setNote('Could not copy — try again')
    }
  }

  const count = labCount(setup)

  return (
    <div className="flex flex-col gap-8">
      {/* ── Specimen ── */}
      <section aria-label="Specimen" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h2 className="t-h1 text-bark text-balance">
            North West 26<span className="t-title-dot" aria-hidden="true" />
          </h2>
          <TitleMark name="leaderboard" height={28} />
        </div>
        <div>
          <p className="text-[17px] font-semibold leading-snug text-ink/80">14 – 17 August 2026</p>
          <p className="t-body text-ink/80 mt-1">
            Four rounds in Donegal, one running total, and a team prize on the last day.
          </p>
        </div>

        <Card className="px-4 py-2">
          <p className="t-card py-2">Fourball</p>
          {[
            { place: 1, names: ['Ciarán Ó Dónaill', 'Dave McGinley'], score: 74 },
            { place: 2, names: ['Seán Bonner', 'Áine Gallagher'], score: 71 },
          ].map(row => (
            <div key={row.place} className="flex items-center gap-3 py-2.5 border-t border-line">
              <span className="t-data tabular-nums text-ink/65 w-5">{row.place}</span>
              <span className="flex-1 min-w-0 flex flex-col t-data text-ink">
                {row.names.map(n => <span key={n} className="truncate">{n}</span>)}
              </span>
              <span className="t-data tabular-nums text-ink text-[20px] font-bold">{row.score}</span>
            </div>
          ))}
        </Card>

        <Field label="Event name" htmlFor="lab-field" hint="Holes 1–18 · 0123456789">
          <input id="lab-field" className={FIELD} defaultValue="Rosapenna – Sandy Hills" />
        </Field>
        <div className="flex items-center gap-3">
          <Button full={false}>Start round</Button>
          <Pill tone="win" live>In play</Pill>
        </div>
      </section>

      {/* ── Controls ── */}
      <section aria-label="Choices" className="flex flex-col gap-6">
        <p className="t-label text-ink/80">
          {count === 0 ? 'House style' : `Lab · ${count}`}
        </p>
        {AXES.map(axis => (
          <div key={axis.key} role="group" aria-label={axis.label}>
            <p className="t-label text-ink mb-2.5">{axis.label}</p>
            <div className="flex flex-wrap gap-2">
              {axis.options.map(o => {
                const selected = setup[axis.key] === o.id
                const isFont = 'role' in o
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => choose(axis.key, o.id)}
                    className={chipClass(selected)}
                    style={isFont ? { fontFamily: fontStack(o as FontOption) } : undefined}
                  >
                    {o.name}
                    {o.id === axis.house && (
                      <span className="text-[13px] font-medium opacity-80">house</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ── Taking it elsewhere ── */}
      <section aria-label="Share" className="flex flex-col gap-3">
        <p className="t-cap text-ink/65 break-words">{serialiseSetup(setup)}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" full={false} onClick={() => copy(serialiseSetup(setup), 'Setup copied')}>
            Copy setup
          </Button>
          <Button variant="secondary" full={false} onClick={() => copy(previewLink(setup), 'Preview link copied')}>
            Share preview link
          </Button>
          <Button variant="quiet" full={false} onClick={() => { resetSetup(); setNote('') }} disabled={count === 0}>
            Reset to the house style
          </Button>
        </div>
        {note && <p className="t-cap text-ink/80" role="status">{note}</p>}
      </section>
    </div>
  )
}
