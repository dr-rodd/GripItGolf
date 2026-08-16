'use client'

/**
 * The gear on the trip hub: a claimed player's own preferences.
 *
 * Not Trip Setup and not the Trip Settings drawer — those are the trip's.
 * This sheet is the person's: what THEY want screens to look like, saved
 * against their player row so it follows them to their other devices. The
 * hub only renders the gear for a device that has claimed a player, which is
 * the rule the feature was asked for with: no claim, no personalisation.
 *
 * One preference so far — dark mode. The theme itself is lib/theme.ts's job
 * (the class, the cookie, the browser chrome); this component's job is the
 * control and the column.
 *
 * The column write is best-effort on purpose. The theme has already changed
 * and the cookie already holds it before the request leaves, so a dead radio
 * costs only the cross-device echo — and the sheet says so, calmly, rather
 * than failing a toggle that visibly worked.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { applyTheme, isDark, rememberTheme } from '@/lib/theme'
import { IconSettings } from './icons'
import Toggle from './Toggle'

export default function PlayerSettings({
  tripId, playerId,
}: {
  tripId: string
  playerId: string
}) {
  const [open, setOpen] = useState(false)
  // Lazily, so the class on <html> is read on the client's first render and
  // never re-read on re-renders. The server initialises this to false (it has
  // no document), which cannot mismatch: the toggle only renders inside the
  // sheet, and the sheet is closed until a finger opens it.
  const [dark, setDark] = useState(() => isDark())
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    // What this player chose, possibly on another phone. The device cookie
    // painted the page already; the column outranks it, because the column is
    // the preference and the cookie only its local echo. Errors are ignored
    // whole — a trip whose database does not carry the column yet just stays
    // a device-local preference.
    let cancelled = false
    supabase
      .from('players')
      .select('dark_mode')
      .eq('id', playerId)
      .eq('trip_id', tripId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return
        const saved = (data as { dark_mode?: boolean | null } | null)?.dark_mode
        if (typeof saved === 'boolean' && saved !== isDark()) {
          applyTheme(saved)
          rememberTheme(saved)
          setDark(saved)
        }
      })
    return () => { cancelled = true }
  }, [tripId, playerId])

  async function handleToggle(next: boolean) {
    // The page first, the network second: the switch must answer the finger.
    applyTheme(next)
    rememberTheme(next)
    setDark(next)
    setSaveFailed(false)

    const { error } = await supabase
      .from('players')
      .update({ dark_mode: next })
      .eq('id', playerId)
      .eq('trip_id', tripId)
    if (error) setSaveFailed(true)
  }

  return (
    <>
      <button
        type="button"
        aria-label="Your preferences"
        onClick={() => setOpen(true)}
        className="press flex items-center justify-center w-10 h-10 rounded-full text-bark/60 hover:text-ink"
      >
        <IconSettings size={20} />
      </button>

      {open && (
        <>
          {/* z-50, not z-40 — the tab bar's rung, and a scrim tied with it
              leaves the bar bright and tappable. The colour is a warm
              near-black constant rather than a token: a scrim darkens in
              both themes, and ink flips light in the dark one. */}
          <div
            className="fixed inset-0 z-50 page-enter"
            style={{ backgroundColor: 'rgba(20, 15, 11, 0.55)' }}
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <div className="bg-surface border border-bark/12 rounded-2xl w-full max-w-md mx-auto sheet-up">

              <div className="flex items-center justify-between px-5 py-4 border-b border-bark/12">
                <h2 className="t-card text-ink">Your preferences</h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="text-ink/65 hover:text-ink/80 transition-colors text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="t-label text-ink">Dark mode</p>
                    <p className="t-cap text-ink/65 mt-0.5">
                      Easier on the eyes after dark. Saved to your name, so it
                      follows you to your other devices.
                    </p>
                  </div>
                  <Toggle checked={dark} onChange={handleToggle} label="Dark mode" />
                </div>
                {saveFailed && (
                  <p className="t-cap text-rust-deep mt-3">
                    Could not save that to the trip — this phone will remember
                    it anyway.
                  </p>
                )}
              </div>

            </div>
          </div>
        </>
      )}
    </>
  )
}
