'use client'

/**
 * The gear on the trip hub: this phone's own preferences.
 *
 * Not Trip Setup and not the Trip Settings drawer — those are the trip's.
 * This sheet is the person's: how THEY want screens to look. Every trip's
 * hub carries it, claimed or not — appearance is the device's choice
 * (lib/theme.ts: light, dark, or the phone's own setting), and a phone that
 * went dark must always have the way back in reach. The leaderboard
 * nickname is a player's, so it shows only once this phone has claimed one.
 *
 * An event shows the same controls inline on its Settings tab
 * (`/trip/[code]/settings`) instead of behind a gear — `PreferencesPanel`
 * below is the one copy both draw. There it may also offer the player's
 * own colour (lib/playerColours.ts), which a trip never does.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { THEME_CHOICES, chooseTheme, currentThemeChoice, type ThemeChoice } from '@/lib/theme'
import { MAX_NICKNAME, normalizeNickname } from '@/lib/displayNames'
import { PLAYER_COLOURS, normalisePlayerColour } from '@/lib/playerColours'
import { PRESET_COLOR_NAMES } from '@/lib/teamColors'
import { IconSettings } from './icons'
import { FIELD, Segmented, buttonClass, cardClass } from './ui'

export default function PlayerSettings({
  tripId, playerId,
}: {
  tripId: string
  /** The claimed player on this phone, or null — the nickname needs one. */
  playerId: string | null
}) {
  const [open, setOpen] = useState(false)
  // Read when the sheet opens, from the cookie the boot script painted by,
  // and handed to the panel so it opens on the right answer.
  const [theme, setTheme] = useState<ThemeChoice>('light')

  return (
    <>
      <button
        type="button"
        aria-label="Your preferences"
        onClick={() => { setTheme(currentThemeChoice()); setOpen(true) }}
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
            <div className={`w-full max-w-md mx-auto sheet-up ${cardClass()}`}>

              <div className="flex items-center justify-between px-5 py-4 border-b border-line">
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
                <PreferencesPanel tripId={tripId} playerId={playerId} initialTheme={theme} />
              </div>

            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

/**
 * The preferences themselves — appearance, and the nickname once this
 * phone is a player, and on an event without sides their colour. Drawn
 * inside the hub's sheet on a trip and straight onto an event's Settings
 * tab.
 */
export function PreferencesPanel({
  tripId, playerId, initialTheme, colourPicker = false,
}: {
  tripId: string
  /** The claimed player on this phone, or null — the nickname needs one. */
  playerId: string | null
  /**
   * The choice to open on, when the caller has already read it. A page
   * rendered on the server cannot (the cookie is the browser's to read), so
   * it is read again after mount either way.
   */
  initialTheme?: ThemeChoice
  /**
   * Offer the player's own colour — an event with no sides, decided by the
   * page through `ownColoursOffered`. Only ever drawn for a claimed player.
   */
  colourPicker?: boolean
}) {
  const [theme, setTheme] = useState<ThemeChoice>(initialTheme ?? 'light')
  useEffect(() => { setTheme(currentThemeChoice()) }, [])

  // The leaderboard nickname — the player's own short name for the board's
  // tight columns. Their stored name never changes; lib/displayNames.ts is
  // where this wins over the default.
  const [nickname, setNickname] = useState('')
  const [savedNickname, setSavedNickname] = useState('')
  const [nickSaving, setNickSaving] = useState(false)
  const [nickFailed, setNickFailed] = useState(false)

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    // Its own query, never named inside a wider select: a database that has
    // not run migration 047 fails the read, and errors are ignored whole.
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

  // The player's own colour. Saved on the tap — a swatch is one answer, not
  // a draft — and put back if the save does not land.
  const showColour = colourPicker && !!playerId
  const [colour, setColour] = useState<string | null>(null)
  const [colourFailed, setColourFailed] = useState(false)

  useEffect(() => {
    if (!showColour) return
    let cancelled = false
    // Its own query, fail-soft, for the nickname's reason: migration 063.
    supabase
      .from('players')
      .select('colour')
      .eq('id', playerId)
      .eq('trip_id', tripId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return
        setColour(normalisePlayerColour((data as { colour?: string | null } | null)?.colour))
      })
    return () => { cancelled = true }
  }, [tripId, playerId, showColour])

  async function pickColour(next: string | null) {
    if (!playerId || next === colour) return
    const before = colour
    setColour(next)
    setColourFailed(false)
    const { error } = await supabase
      .from('players')
      .update({ colour: next })
      .eq('id', playerId)
      .eq('trip_id', tripId)
    if (error) {
      setColour(before)
      setColourFailed(true)
    }
  }

  async function saveNickname() {
    if (!playerId) return
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
    if (error || !playerId) {
      setNickFailed(true)
      return
    }
    setNickname(next ?? '')
    setSavedNickname(next ?? '')
  }

  function pickTheme(next: ThemeChoice) {
    chooseTheme(next)
    setTheme(next)
  }

  return (
    <>
      <p className="t-label text-ink">Appearance</p>
      <p className="t-cap text-ink/65 mt-0.5">
        For this phone. System follows the phone&apos;s own light or dark setting.
      </p>
      <Segmented
        options={THEME_CHOICES}
        value={theme}
        onChange={pickTheme}
        label="Appearance"
        className="mt-3"
      />

      {/* ── Leaderboard nickname ── */}
      {playerId && <div className="mt-5 pt-5 border-t border-line">
        <p className="t-label text-ink">Leaderboard nickname</p>
        <p className="t-cap text-ink/65 mt-0.5">
          Saves space on the board. Your player name doesn&apos;t
          change.
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
            className={`${FIELD} field-dense flex-1 min-w-0`}
          />
          <button
            type="button"
            onClick={saveNickname}
            disabled={nickSaving || !nickDirty}
            className={`${buttonClass('secondary', false, true)} flex-shrink-0`}
          >
            {nickSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {nickFailed && (
          <p className="t-cap text-rust-deep mt-2">
            Could not save the nickname — try again
          </p>
        )}
      </div>}

      {/* ── Your colour ── */}
      {showColour && <div className="mt-5 pt-5 border-t border-line">
        <p className="t-label text-ink">Your colour</p>
        <p className="t-cap text-ink/65 mt-0.5">
          Beside your name on the leaderboard and scorecard, and your side of a match.
        </p>
        <div role="radiogroup" aria-label="Your colour" className="grid grid-cols-7 mt-2 -mx-1">
          <ColourSwatch label="No colour" chosen={colour === null} onPick={() => pickColour(null)} />
          {PLAYER_COLOURS.map(c => (
            <ColourSwatch
              key={c}
              fill={c}
              label={PRESET_COLOR_NAMES[c] ?? c}
              chosen={colour?.toLowerCase() === c.toLowerCase()}
              onPick={() => pickColour(c)}
            />
          ))}
        </div>
        {colourFailed && (
          <p className="t-cap text-rust-deep mt-2">
            Could not save your colour — try again
          </p>
        )}
      </div>}
    </>
  )
}

/**
 * One colour to pick: a 44px target round a smaller dot, the chosen one
 * ringed. No fill is "No colour" — an empty circle.
 */
function ColourSwatch({ fill, label, chosen, onPick }: {
  fill?: string
  label: string
  chosen: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-label={label}
      onClick={onPick}
      className="press flex items-center justify-center h-11"
    >
      <span
        className={`block w-7 h-7 rounded-full ${fill ? '' : 'border-2 border-dashed border-line-strong'} ${
          chosen ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
        }`}
        style={fill ? { backgroundColor: fill } : undefined}
        aria-hidden="true"
      />
    </button>
  )
}
