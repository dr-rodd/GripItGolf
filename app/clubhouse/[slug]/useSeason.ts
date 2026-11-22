'use client'

import { useEffect, useState } from 'react'
import { askClub } from '@/lib/accountClient'
import type { SeasonEvent } from '@/lib/clubhouse'
import type { ClubEventType } from '@/lib/clubEvents'
import { NO_PLACES, type ClubPlaces } from '@/lib/clubLocations'

/**
 * The club's events (stage (k2)), asked once a section opens — the Events
 * table and the Calendar read the same list, the club's own events in it
 * (stage c1). `notesReady` is false before migration 095; `hiddenTypes` the
 * types the club does not show its members.
 */
export function useSeason(clubId: string): { events: SeasonEvent[] | null; lost: boolean; again: () => void; notesReady: boolean; hiddenTypes: ClubEventType[]; places: ClubPlaces; setUnlinked: (code: string, unlinked: boolean) => void } {
  const [events, setEvents] = useState<SeasonEvent[] | null>(null)
  const [lost, setLost] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [notesReady, setNotesReady] = useState(false)
  const [hiddenTypes, setHidden] = useState<ClubEventType[]>([])
  const [places, setPlaces] = useState<ClubPlaces>(NO_PLACES)
  useEffect(() => {
    let live = true
    void askClub('season', { clubId }).then(r => {
      if (!live) return
      if (r.ok && r.calendar) { setEvents(r.calendar); setLost(false); setNotesReady(!!r.notesReady); setHidden(r.hiddenTypes ?? []); setPlaces(r.places ?? NO_PLACES) } else setLost(true)
    })
    return () => { live = false }
  }, [clubId, attempt])
  // D285: a chain-link tapped — the one event's state, without asking again.
  const setUnlinked = (code: string, unlinked: boolean) => setEvents(es => es && es.map(e => {
    if (e.code !== code) return e
    const { unlinked: _was, ...rest } = e
    return unlinked ? { ...rest, unlinked: true as const } : rest
  }))
  return { events, lost, again: () => setAttempt(a => a + 1), notesReady, hiddenTypes, places, setUnlinked }
}
