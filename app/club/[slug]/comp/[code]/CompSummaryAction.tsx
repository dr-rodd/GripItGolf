'use client'

import { useEffect, useState } from 'react'
import { ButtonLink } from '@/app/components/ui'
import { askBooking, peekKept, type BookingAnswer } from '@/lib/accountClient'
import { compSectionHref } from '@/lib/clubBar'
import type { CompPhase } from '@/lib/compPhase'
import { joinNames } from '@/lib/matchplayEntrants'
import { tripBase } from '@/lib/tripPaths'

export interface SummarySlot { clock: string; players: { id: string; name: string }[] }

type Me = { booked: boolean; playerId: string | null; admin: boolean } | 'outside'

/**
 * The Summary card's supporting line and its one action (D186), which
 * depend on who is holding the phone — the server cannot see that, so it is
 * asked after the page paints, the button's room kept so nothing jumps.
 * Booking open: Book a tee time, or once booked "You're out at 10:24 with …"
 * and Change. In play: Start your card for a player on the sheet. Awaiting
 * sign-off: Certify result for an owner or admin. Certified: See the
 * results, for anybody. Somebody not on the club's list watching gets the
 * line and no button.
 */
export default function CompSummaryAction({ slug, code, phase, line, slots }: {
  slug: string; code: string; phase: CompPhase; line: string; slots: SummarySlot[]
}) {
  const asks = phase === 'booking' || phase === 'in_play' || phase === 'awaiting'
  const [me, setMe] = useState<Me | null>(() => {
    const r = peekKept<{ ok: true } & BookingAnswer>('booking', code)
    return r ? { booked: !!r.booked, playerId: r.myPlayerId ?? null, admin: !!r.admin } : null
  })
  useEffect(() => {
    if (!asks) return
    let live = true
    askBooking('state', { code }).then(r => {
      if (!live) return
      setMe(r.ok ? { booked: !!r.booked, playerId: r.myPlayerId ?? null, admin: !!r.admin } : 'outside')
    })
    return () => { live = false }
  }, [asks, code])

  const member = me && me !== 'outside' ? me : null
  const mine = member?.booked ? slots.find(s => s.players.some(p => p.id === member.playerId)) ?? null : null
  const others = mine ? mine.players.filter(p => p.id !== member?.playerId).map(p => p.name) : []
  const shownLine = phase === 'booking' && mine
    ? `You’re out at ${mine.clock}${others.length ? ` with ${joinNames(others)}` : ''}`
    : line

  let action: React.ReactNode = null
  if (phase === 'certified') {
    action = <ButtonLink href={compSectionHref(slug, code, 'board')} variant="secondary" className="mt-4">See the results</ButtonLink>
  } else if (phase === 'booking' && member) {
    action = mine
      ? <ButtonLink href={compSectionHref(slug, code, 'tee')} variant="secondary" className="mt-4">Change</ButtonLink>
      : <ButtonLink href={compSectionHref(slug, code, 'tee')} className="mt-4">Book a tee time</ButtonLink>
  } else if (phase === 'in_play' && member?.booked) {
    action = <ButtonLink href={`${tripBase(code, 'tournament')}/scoring/1`} className="mt-4">Start your card</ButtonLink>
  } else if (phase === 'awaiting' && member?.admin) {
    action = <ButtonLink href={compSectionHref(slug, code, 'scoring')} className="mt-4">Certify result</ButtonLink>
  }

  return (
    <>
      <p className="text-ink/80 text-[15px] leading-relaxed mt-1">{shownLine}</p>
      {action ?? (asks && me === null ? <div aria-hidden="true" className="min-h-14 mt-4" /> : null)}
    </>
  )
}
