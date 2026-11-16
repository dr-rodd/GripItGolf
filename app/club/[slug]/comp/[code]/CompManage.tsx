'use client'

import { useEffect, useState } from 'react'
import { ButtonLink } from '@/app/components/ui'
import { askBooking, peekKept, type BookingAnswer } from '@/lib/accountClient'
import { tripBase } from '@/lib/tripPaths'

/**
 * "Manage competition" (D183), for the club's owners and admins: the
 * existing organiser area, with the event's own bar. Asked after the page
 * paints — the server cannot see who is signed in.
 */
export default function CompManage({ code }: { code: string }) {
  const [admin, setAdmin] = useState(() => !!peekKept<{ ok: true } & BookingAnswer>('booking', code)?.admin)
  useEffect(() => {
    let live = true
    askBooking('state', { code }).then(r => { if (live && r.ok) setAdmin(!!r.admin) })
    return () => { live = false }
  }, [code])
  if (!admin) return null
  return (
    <ButtonLink href={`${tripBase(code, 'tournament')}/organiser`} variant="secondary" className="mt-4">
      Manage competition
    </ButtonLink>
  )
}
