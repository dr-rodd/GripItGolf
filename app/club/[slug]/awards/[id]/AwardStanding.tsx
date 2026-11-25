'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { IconChevronLeft } from '@/app/components/icons'
import { PageTitle, cardClass } from '@/app/components/ui'
import { askAwards, type AwardAnswer } from '@/lib/accountClient'
import { clubEventDates } from '@/lib/clubs'
import { myStandingLine } from '@/lib/clubAward'

/**
 * An award's table for the club's members (stage 6, P14): this member's line
 * at the top ("You’re 4th, 12 behind"), then everybody with points — a row
 * opening on each result that earned them, what it was worth, struck through
 * where it falls outside the best N. Gold only for the leader (D171's rule).
 */
export default function AwardStanding({ clubId, id, slug, year }: { clubId: string; id: string; slug: string; year: number | null }) {
  const [a, setA] = useState<AwardAnswer | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void askAwards('standing', { clubId, id, ...(year ? { year } : {}) }).then(r => {
      if (!live) return
      if (r.ok) setA(r)
      else setError(r.error)
    })
    return () => { live = false }
  }, [clubId, id, year])

  const rows = a?.standing ?? []
  const mine = a?.myRowId ? myStandingLine(rows, a.myRowId) : null
  return (
    <>
      <Link href={`/club/${slug}`} className="t-cap text-ink/65 inline-flex items-center gap-1 mt-5 press">
        <IconChevronLeft size={16} /> The club
      </Link>
      {error && <p className="text-ink/80 text-[15px] mt-6">{error}</p>}
      {!a && !error && <div aria-hidden="true" className="skeleton h-48 rounded-card mt-6" />}
      {a?.award && (
        <>
          <PageTitle className="mt-2" sub={<>{a.award.year}{a.award.rules.bestOf ? ` · best ${a.award.rules.bestOf} results` : ''}</>}>{a.award.name}</PageTitle>
          {mine && <p className="text-[15px] font-semibold text-club-deep mt-4">{mine}</p>}
          {rows.length === 0 && <p className="text-ink/80 text-[15px] mt-6">Nobody has points yet — they arrive as each competition is certified and each match play round is decided.</p>}
          {rows.length > 0 && (
            <ol className={`${cardClass()} mt-4 divide-y divide-line`}>
              {rows.map(r => (
                <li key={r.rowId}>
                  <button type="button" onClick={() => setOpen(o => (o === r.rowId ? null : r.rowId))} aria-expanded={open === r.rowId}
                    className={`w-full flex items-baseline gap-3 px-4 py-3 text-left press ${r.rowId === a.myRowId ? 'bg-club-tint' : ''}`}>
                    <span className={`w-7 t-data ${r.place === 1 ? 'text-gold-deep font-semibold' : 'text-ink/65'}`}>{r.place}</span>
                    <span className="flex-1 min-w-0 t-data text-[15px] text-ink truncate">{r.name}</span>
                    <span className="t-data text-[15px] text-ink">{r.total}</span>
                  </button>
                  {open === r.rowId && (
                    <ul className="px-4 pb-3 space-y-1.5">
                      {r.lines.map(l => (
                        <li key={l.code} className={`flex items-baseline gap-2 t-cap ${l.counts ? 'text-ink/80' : 'text-ink/50 line-through'}`}>
                          <span className="flex-1 min-w-0">{l.name}{l.date ? ` · ${clubEventDates(l.date, l.date)}` : ''}</span>
                          <span className="whitespace-nowrap">{l.detail}{l.weight !== 1 ? ` ×${l.weight}` : ''}</span>
                          <span className="t-data w-10 text-right">{l.points}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  )
}
