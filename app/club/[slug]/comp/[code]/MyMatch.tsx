'use client'

import { useEffect, useState } from 'react'
import { ButtonLink, cardClass } from '@/app/components/ui'
import { askMatchPlay } from '@/lib/accountClient'
import { clubEventDates } from '@/lib/clubs'

/** A drawn match as the club area hands it to the phone — names already worked out on the server. */
export interface ClubMatchRow {
  id: string
  roundNumber: number
  roundName: string
  deadline: string | null
  sideA: string | null
  sideB: string | null
  aName: string
  bName: string
  winner: string | null
  result: string | null
}

/**
 * Your match in a club match play (stage 3; Ross, 17 Nov 2026) — asked
 * after the page paints, since the server cannot see who is holding the
 * phone: the next match you play (the earliest with no result), its round,
 * your opponent and its play-by date, and **Open your match**, which goes to
 * the match's own page (arrange the course and day, contacts, the card,
 * a walkover) as a stroke competition's card does. Out, it says who beat you.
 * Not in the draw, nothing.
 */
export default function MyMatch({ code, matches, matchHref }: { code: string; matches: ClubMatchRow[]; matchHref: string }) {
  const [me, setMe] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    askMatchPlay('state', { code }).then(r => { if (live && r.ok) setMe(r.mySide ?? r.myPlayerId ?? null) })
    return () => { live = false }
  }, [code])
  if (!me) return null
  const mine = matches.filter(m => m.sideA === me || m.sideB === me).sort((a, b) => a.roundNumber - b.roundNumber)
  if (!mine.length) return null
  const next = mine.find(m => !m.winner)
  const last = mine[mine.length - 1]
  const them = (m: ClubMatchRow) => (m.sideA === me ? m.bName : m.aName)

  if (!next) {
    const won = last.winner === me
    return (
      <section className={`${cardClass('floating')} p-4 mt-6`}>
        <p className="text-[13px] font-semibold text-club-deep">Your match play</p>
        <p className="text-ink text-[17px] leading-snug mt-1">
          {won ? (last.roundName === 'Final' ? 'You won the Final.' : `You beat ${them(last)} in the ${last.roundName}.`)
            : `${them(last)} beat you in the ${last.roundName}${last.result ? `, ${last.result}` : ''}.`}
        </p>
      </section>
    )
  }
  const waiting = !next.sideA || !next.sideB
  return (
    <section className={`${cardClass('floating')} p-4 mt-6`}>
      <p className="text-[13px] font-semibold text-club-deep">Your match · {next.roundName}</p>
      <p className="t-data text-ink text-[19px] leading-snug mt-1">{waiting ? 'Opponent to be decided' : `v ${them(next)}`}</p>
      {next.deadline && <p className="t-cap text-ink/65 mt-1">Play by {clubEventDates(next.deadline, next.deadline)}</p>}
      {!waiting && <ButtonLink href={`${matchHref}/${next.id}`} className="mt-4">Open your match</ButtonLink>}
    </section>
  )
}
