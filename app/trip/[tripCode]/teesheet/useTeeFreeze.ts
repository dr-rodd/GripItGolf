'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { type Freeze, beaten, liftedRounds, readFreezes } from '@/lib/teeFreeze'

/**
 * The tee sheet's freezes, live (lib/teeFreeze.ts has the rules): this
 * phone's own, held while it books a time, and every other phone's, as
 * Supabase Realtime presence on one channel per event. Nothing is stored.
 *
 * `onLift` hears of another phone's freeze going — a time on that round
 * may have changed, so the sheet reads itself again. `onBeaten` hears that
 * another phone froze the time this one opened a moment earlier.
 *
 * Without a connection it fails soft: no freezes shown, and Save's own
 * check against the database still stops two versions of a time.
 */
export function useTeeFreeze(
  tripId: string,
  enabled: boolean,
  onLift: (round: string) => void,
  onBeaten: (slot: number) => void,
) {
  const [key] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
  const [freezes, setFreezes] = useState<Freeze[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const ready = useRef(false)
  const wanted = useRef<Freeze | null>(null)
  const last = useRef<Freeze[]>([])
  const handlers = useRef({ onLift, onBeaten })
  useEffect(() => { handlers.current = { onLift, onBeaten } })

  useEffect(() => {
    if (!enabled) return
    const channel = supabase.channel(`tee-sheet:${tripId}`, { config: { presence: { key } } })
    channel.on('presence', { event: 'sync' }, () => {
      const next = readFreezes(channel.presenceState())
      const lifted = liftedRounds(last.current, next, key)
      last.current = next
      setFreezes(next)
      for (const round of lifted) handlers.current.onLift(round)
      const mine = wanted.current
      if (mine && beaten(next, mine, Date.now())) {
        wanted.current = null
        void channel.untrack()
        handlers.current.onBeaten(mine.slot)
      }
    })
    channel.subscribe(status => {
      ready.current = status === 'SUBSCRIBED'
      if (ready.current && wanted.current) void channel.track(wanted.current)
    })
    channelRef.current = channel
    return () => {
      ready.current = false
      channelRef.current = null
      last.current = []
      void supabase.removeChannel(channel)
    }
  }, [tripId, enabled, key])

  const send = useCallback((f: Freeze | null) => {
    wanted.current = f
    const channel = channelRef.current
    if (!channel || !ready.current) return
    void (f ? channel.track(f) : channel.untrack())
  }, [])

  /** Freeze a time while this phone changes it. */
  const hold = useCallback((round: string, slot: number) => {
    const now = Date.now()
    send({ key, round, slot, since: now, seen: now })
  }, [key, send])

  /** The booking moved on — keep the freeze from going idle. */
  const touch = useCallback(() => {
    if (wanted.current) send({ ...wanted.current, seen: Date.now() })
  }, [send])

  /** Done with the time: it thaws on every phone, which read it again. */
  const release = useCallback(() => {
    if (wanted.current) send(null)
  }, [send])

  return { key, freezes, hold, touch, release }
}
