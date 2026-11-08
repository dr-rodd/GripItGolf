'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { type Freeze, LOCK_MS, beaten, liftedRounds, readFreezes } from '@/lib/teeFreeze'

/**
 * The tee sheet's freezes, live (lib/teeFreeze.ts has the rules): this
 * phone's own, held while it books a time, and every other phone's, as
 * Supabase Realtime presence on one channel per event. Nothing is stored.
 *
 * `onLift` hears of another phone's freeze going — a time on that round
 * may have changed, so the sheet reads itself again. `onBeaten` hears that
 * another phone froze the time this one opened a moment earlier.
 *
 * A phone that leaves the page — another app, the screen locked — lets go
 * of its time at once rather than holding it from a pocket, and takes it
 * back on return as if just tapped, so a phone that opened it meanwhile
 * keeps it (Ross, 2 Nov 2026: a time stayed locked after its booker left).
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
  // This phone's own, for the booker's countdown.
  const [held, setHeld] = useState<Freeze | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const ready = useRef(false)
  const wanted = useRef<Freeze | null>(null)
  // The page is out of sight: its freeze is let go until it comes back.
  const away = useRef(false)
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
      if (mine && !away.current && beaten(next, mine, Date.now())) {
        wanted.current = null
        setHeld(null)
        void channel.untrack()
        handlers.current.onBeaten(mine.slot)
      }
    })
    channel.subscribe(status => {
      ready.current = status === 'SUBSCRIBED'
      // Connection lost: what it last heard can no longer be vouched for,
      // so no time shows locked until it hears again. `last` is kept, so a
      // freeze gone in the meantime still has the sheet read again.
      if (!ready.current) setFreezes([])
      else if (wanted.current && !away.current) void channel.track(wanted.current)
    })
    channelRef.current = channel
    return () => {
      ready.current = false
      channelRef.current = null
      last.current = []
      setFreezes([])
      void supabase.removeChannel(channel)
    }
  }, [tripId, enabled, key])

  const send = useCallback((f: Freeze | null) => {
    wanted.current = f
    setHeld(f)
    const channel = channelRef.current
    if (!channel || !ready.current || away.current) return
    void (f ? channel.track(f) : channel.untrack())
  }, [])

  // Out of sight, the time is let go; back, it is taken again as if just
  // tapped — a later `since`, so a phone that opened it meanwhile came first
  // and keeps it (`beaten` closes this one). A booking keeps its own two
  // minutes; one that ran out while away closes itself.
  useEffect(() => {
    if (!enabled) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (away.current) return
        away.current = true
        const channel = channelRef.current
        if (wanted.current && channel && ready.current) void channel.untrack()
        return
      }
      if (!away.current) return
      away.current = false
      const f = wanted.current
      if (!f) return
      const now = Date.now()
      if (f.timed && now >= f.until) return
      send({ ...f, since: now, until: f.timed ? f.until : now + LOCK_MS })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled, send])

  /**
   * Freeze a time while this phone changes it: a booking for two minutes
   * from now (`timed`), an edit for two minutes from its last change.
   */
  const hold = useCallback((round: string, slot: number, timed = false) => {
    const now = Date.now()
    send({ key, round, slot, since: now, until: now + LOCK_MS, ...(timed ? { timed } : {}) })
  }, [key, send])

  /** An edit moved on — keep its lock from going idle. A booking's runs its two minutes. */
  const touch = useCallback(() => {
    const f = wanted.current
    if (f && !f.timed) send({ ...f, until: Date.now() + LOCK_MS })
  }, [send])

  /** Done with the time: it thaws on every phone, which read it again. */
  const release = useCallback(() => {
    if (wanted.current) send(null)
  }, [send])

  return { key, freezes, held, hold, touch, release }
}
