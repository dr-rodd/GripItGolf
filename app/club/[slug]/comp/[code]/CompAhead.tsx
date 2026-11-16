'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { askBooking, askCertify, askSign } from '@/lib/accountClient'
import { compHome, compSectionHref, SECTION_ORDER } from '@/lib/clubBar'
import { prefetchWhole } from '../../prefetchWhole'

/** A page drawn from a copy older than this asks the server again behind it. */
const STALE_MS = 8_000

/**
 * Preload, then be snappy (D198, Ross, 16 Nov 2026). On any of a
 * competition's four pages, the other three are fetched whole and this
 * phone's own reads of the competition (booked, admin, cards to sign, the
 * results card) asked once, so a tap on Tee times, Scoring or Leaderboard
 * shows its page at once. A page that came from such a copy — older than a
 * few seconds — then asks the server again behind what is on screen, once,
 * and the fresh page replaces it in place.
 */
export default function CompAhead({ slug, code, renderedAt }: { slug: string; code: string; renderedAt: number }) {
  const router = useRouter()
  const refreshed = useRef(false)

  useEffect(() => {
    if (refreshed.current) return
    refreshed.current = true
    if (Date.now() - renderedAt > STALE_MS) router.refresh()
  }, [renderedAt, router])

  useEffect(() => {
    prefetchWhole(router, compHome(slug, code))
    for (const s of SECTION_ORDER) prefetchWhole(router, compSectionHref(slug, code, s))
    void askSign('list', { code })
    void askBooking('state', { code }).then(r => { if (r.ok && r.admin) void askCertify('state', { code }) })
  }, [router, slug, code])

  return null
}
