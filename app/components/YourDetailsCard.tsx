'use client'

import { useEffect, useState } from 'react'
import { cardClass } from './ui'
import { accountDetails } from '@/lib/accountClient'
import { GENDER_WORDS, NOT_GIVEN, birthDateLabel, daysLine, type MyDetails } from '@/lib/clubMembership'

/**
 * Your details (stage (m); Ross, 17 Nov 2026): the gender and date of birth
 * your club has recorded — one value everywhere — and your membership at
 * each club. Shown, never changed here: a club sets them, so a tap on
 * Change says to ask the club. Drawn only for somebody on a club's list.
 *
 * `initial` when the page already has it (Me reads it with the rest of the
 * page); left out, the card asks after it paints. `club` narrows the
 * memberships to one club (the club area's Club tab).
 */
export default function YourDetailsCard({ initial, club, className = '' }: { initial?: MyDetails | null; club?: string; className?: string }) {
  const [details, setDetails] = useState<MyDetails | null | undefined>(initial)
  const [asked, setAsked] = useState(false)

  useEffect(() => {
    if (initial !== undefined) return
    let live = true
    accountDetails().then(r => { if (live) setDetails(r.ok ? r.details : null) })
    return () => { live = false }
  }, [initial])

  if (!details) return null
  const memberships = club ? details.memberships.filter(m => m.club === club) : details.memberships
  return (
    <div className={`${cardClass()} px-4 py-4 ${className}`}>
      <p className="t-label text-ink">Your details</p>
      <p className="t-cap text-ink/65">Recorded by your club. They decide which competitions you can enter.</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        <dt className="text-ink/65">Gender</dt>
        <dd className="text-ink">{details.gender ? GENDER_WORDS[details.gender] : NOT_GIVEN}</dd>
        <dt className="text-ink/65">Date of birth</dt>
        <dd className="text-ink tabular-nums">{details.birthDate ? birthDateLabel(details.birthDate) : NOT_GIVEN}</dd>
        {memberships.map(m => (
          <div key={`${m.club}:${m.name}`} className="contents">
            <dt className="text-ink/65">{club ? 'Membership' : m.club}</dt>
            <dd className="text-ink">{m.name} <span className="text-ink/65">· {daysLine(m.days)}</span></dd>
          </div>
        ))}
      </dl>
      {asked ? (
        <p className="t-cap text-ink/80 mt-3" role="status">Your club keeps these. To change them, contact your club.</p>
      ) : (
        <button type="button" onClick={() => setAsked(true)} className="t-label text-ink underline underline-offset-2 mt-3 press">Change</button>
      )}
    </div>
  )
}
