'use client'

import { useEffect, useState } from 'react'
import { askClub } from '@/lib/accountClient'
import type { SeasonEvent } from '@/lib/clubhouse'

/** The club's events (stage (k2)), asked once a section opens — the Competitions table and the Calendar read the same list. */
export function useSeason(clubId: string): { events: SeasonEvent[] | null; lost: boolean; again: () => void } {
  const [events, setEvents] = useState<SeasonEvent[] | null>(null)
  const [lost, setLost] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    void askClub('season', { clubId }).then(r => {
      if (!live) return
      if (r.ok && r.calendar) { setEvents(r.calendar); setLost(false) } else setLost(true)
    })
    return () => { live = false }
  }, [clubId, attempt])
  return { events, lost, again: () => setAttempt(a => a + 1) }
}
