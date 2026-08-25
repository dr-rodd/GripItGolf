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
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { applyTheme, isDark, rememberTheme } from '@/lib/theme'
import { MAX_NICKNAME, normalizeNickname } from '@/lib/displayNames'
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

  // The leaderboard nickname — the player's own short name for the board's
  // tight columns. Their stored name never changes; lib/displayNames.ts is
  // where this wins over the default.
  const [nickname, setNickname] = useState('')
  const [savedNickname, setSavedNickname] = useState('')
  const [nickSaving, setNickSaving] = useState(false)
  const [nickFailed, setNickFailed] = useState(false)

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
    // Its own query, not a second column on the one above: naming `nickname`
    // there would fail the whole read — dark mode included — on a database
    // that has not run migration 047. Errors are ignored the same way.
    supabase
      .from('players')
      .select('nickname')
      .eq('id', playerId)
      .eq('trip_id', tripId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return
        const saved = normalizeNickname((data as { nickname?: string | null } | null)?.nickname)
        if (saved) {
          setNickname(saved)
          setSavedNickname(saved)
        }
      })
    return () => { cancelled = true }
  }, [tripId, playerId])

  const nickDirty = (normalizeNickname(nickname) ?? '') !== savedNickname

  async function saveNickname() {
    const next = normalizeNickname(nickname)
    setNickSaving(true)
    setNickFailed(false)
    // null clears — leaving the box empty is how the default comes back.
    const { error } = await supabase
      .from('players')
      .update({ nickname: next })
      .eq('id', playerId)
      .eq('trip_id', tripId)
    setNickSaving(false)
    if (error) {
      setNickFailed(true)
      return
    }
    setNickname(next ?? '')
    setSavedNickname(next ?? '')
  }

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

      {open && createPortal(
        <>
          {/* Portalled to <body>, and that is not optional. The gear lives
              inside the sticky header, whose backdrop-filter makes it the
              containing block for fixed descendants — rendered in place,
              this sheet pinned itself to the 52px bar instead of the
              viewport: the scrim became a brown band across the top of the
              screen and the sheet dangled under it. position: fixed means
              the viewport only from somewhere no ancestor has a filter,
              which <body> is. */}
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

                {/* ── Leaderboard nickname ── */}
                <div className="mt-5 pt-5 border-t border-bark/12">
                  <p className="t-label text-ink">Leaderboard nickname</p>
                  <p className="t-cap text-ink/65 mt-0.5">
                    Save space on the leaderboard — your player name doesn&apos;t
                    change, the board just prints this shorter one. Leave it
                    blank and it shows your first name and initial.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      value={nickname}
                      onChange={e => setNickname(e.target.value)}
                      maxLength={MAX_NICKNAME}
                      placeholder="e.g. Rossy"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="flex-1 min-w-0 bg-surface border border-bark/25 rounded-xl px-4 py-2.5 text-ink text-sm placeholder:text-ink/50 focus:outline-none focus:border-accent/60 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={saveNickname}
                      disabled={nickSaving || !nickDirty}
                      className="flex-shrink-0 px-4 rounded-xl border border-bark/25 text-ink text-sm tracking-[0.1em] uppercase hover:border-bark/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {nickSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {nickFailed && (
                    <p className="t-cap text-rust-deep mt-2">
                      Could not save the nickname — try again
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
