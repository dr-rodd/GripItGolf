'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { rememberPlayer } from '@/lib/playerCookie'
import {
  parseHandicap, formatHandicap, isPlusHandicap, PLUS_HANDICAP_WARNING,
} from '@/lib/handicap'
import HandicapField from '@/app/components/HandicapField'
import { syncRoundHandicaps } from '@/lib/roundHandicaps'
import { ROUND_TILE } from '@/lib/roundState'
import {
  isConfirmed, duplicateName, duplicateNameError, isDuplicateNameError,
} from '@/lib/roster'

type Player = {
  id: string
  name: string
  handicap: number | null
  gender?: string
  claimed?: boolean | null
}

/**
 * Who you are on this trip.
 *
 * Every player is listed, confirmed or not, and every name is tappable —
 * that is what makes a second device possible. What a tap means depends on
 * the state:
 *
 *   unconfirmed  claim the slot and link this device
 *   confirmed    link this device, and change nothing else
 *
 * Neither asks anything first, and the second is not an error state. Somebody
 * opening the trip on a tablet after joining on their phone is doing the
 * expected thing, and a mis-tap onto the wrong name costs one tap of
 * "Not you?" on the hub it lands on.
 *
 * The tile borders are the round tiles' borders, from `lib/roundState.ts` —
 * confirmed reads as finalised the way a played round does, unconfirmed as
 * the quietest thing on the page. Only the two states used are imported:
 * the live one carries the app's single pinned glow and has no business here.
 */
export default function PlayersClient({
  tripCode,
  tripId,
  players,
  confirmed,
  roundIds,
}: {
  tripCode: string
  tripId: string
  /** Everyone on the trip, already in the order they should be offered in. */
  players: Player[]
  confirmed: number
  /** Every round on the trip, for a late joiner's handicap snapshots. */
  roundIds: string[]
}) {
  const router = useRouter()
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addHandicap, setAddHandicap] = useState('')
  const [addGender, setAddGender] = useState<'M' | 'F'>('M')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const busy = claimingId !== null || adding

  /** Remember them here, then go and be greeted by name. */
  function linkDevice(playerId: string) {
    // Only ever after the write it follows has succeeded — a failed claim
    // should leave no trace. If cookies are blocked this does nothing and
    // the trip is unaffected; they simply arrive as a stranger each visit.
    rememberPlayer(tripCode, playerId)

    // ── And throw away every page the old cookie rendered ──
    //
    // The hub, the stats page and a round summary are all personalised on
    // the server, from this cookie. The router keeps the payloads it has
    // already fetched, and those were rendered as whoever this device was a
    // moment ago — or as nobody. Pushing to the hub without this serves one
    // of them back: claim a name and the hub still says "Claim your spot",
    // or say "Not you?", claim somebody else, and the old name is still
    // there. The cookie was never the thing that was wrong.
    //
    // Before the push, not after. `refresh` clears the cache, so a push that
    // follows it has nothing to reuse and must ask the server, which is the
    // first request that carries the new cookie. The other way round the
    // stale page is rendered first and corrected a moment later, which is
    // the same bug with a flicker in front of it.
    router.refresh()
    router.push(`/trip/${tripCode}`)
  }

  /** A name nobody has taken yet: take it. */
  async function handleClaim(player: Player) {
    setError('')
    setClaimingId(player.id)
    const { error: err } = await supabase
      .from('players')
      .update({ claimed: true })
      .eq('id', player.id)
    if (err) {
      setClaimingId(null)
      setError('Could not claim player — try again')
      return
    }
    linkDevice(player.id)
  }

  /**
   * A name already confirmed: link this device to it, straight away.
   *
   * **No database write.** `claimed` is already true and stays true —
   * confirmation belongs to the player, not to the handset. A second device
   * is a second cookie and nothing more.
   *
   * Nothing is asked first. Somebody opening the trip on a tablet after
   * joining on their phone is doing the expected thing, and a mis-tap costs
   * one tap of "Not you?" on the screen it lands on.
   */
  function handleLink(player: Player) {
    setClaimingId(player.id)
    linkDevice(player.id)
  }

  function handleTap(player: Player) {
    if (busy) return
    setError('')
    if (isConfirmed(player)) handleLink(player)
    else handleClaim(player)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const name = addName.trim()
    const handicap = parseHandicap(addHandicap)
    if (!name || handicap === null) {
      setError('Enter a name and a handicap')
      return
    }
    // Said before anything is written, and said plainly. Somebody whose name
    // is already on the list is almost always looking at their own slot a
    // few inches above this form.
    const clash = duplicateName(name, players)
    if (clash) {
      setError(`${duplicateNameError(name)} If that is you, tap your name above.`)
      return
    }
    // The one value on this form that means the opposite of what it looks
    // like, asked before it is written — see PLUS_HANDICAP_WARNING.
    if (isPlusHandicap(handicap) && !window.confirm(PLUS_HANDICAP_WARNING)) return

    setAdding(true)
    // The id comes back from the insert — that is the id the cookie stores,
    // so there is no second identifier to keep in step with anything.
    const { data, error: err } = await supabase
      .from('players')
      .insert({
        trip_id: tripId,
        name,
        handicap,
        gender: addGender,
        claimed: true,
      })
      .select('id')
      .single()
    if (err || !data) {
      // The check above ran before this insert. Somebody else on another
      // phone could have taken the name in between, and only the database
      // sees that — so the same sentence, from the other side.
      setError(isDuplicateNameError(err)
        ? `${duplicateNameError(name)} If that is you, tap your name above.`
        : 'Could not add player — try again')
      setAdding(false)
      return
    }

    // A trip's rounds usually exist before its stragglers do, and a player
    // with no row in `round_handicaps` is scored off nothing. Written before
    // they are sent anywhere, so a failure is seen rather than discovered
    // halfway round the course.
    const hcpErr = await syncRoundHandicaps(roundIds, data.id, handicap)
    // Linked either way: the player exists and is theirs, whatever happened
    // to the snapshots.
    rememberPlayer(tripCode, data.id)
    if (hcpErr) {
      setAdding(false)
      setError(
        'Added you to the trip, but your round handicaps did not save. ' +
        'Open Trip Setup and re-enter your handicap before you play.',
      )
      return
    }
    router.push(`/trip/${tripCode}`)
  }

  return (
    <div className="flex flex-col gap-10">

      {players.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-ink/65 text-[13px] tracking-[0.2em] uppercase">
              Tap your name
            </p>
            <p className="text-ink/50 text-[13px] tabular-nums">
              {confirmed} of {players.length} confirmed
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {players.map(p => {
              const isIn = isConfirmed(p)
              return (
                <button
                  key={p.id}
                  onClick={() => handleTap(p)}
                  disabled={busy}
                  className={`flex items-center justify-between w-full px-5 py-4 rounded-2xl text-left transition-colors duration-150 active:opacity-75 disabled:opacity-50 ${
                    isIn ? ROUND_TILE.played : ROUND_TILE.empty
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-medium truncate">{p.name}</p>
                    <p className={`t-cap mt-0.5 ${isIn ? 'text-ink/80' : 'text-ink/65'}`}>
                      {isIn ? 'Confirmed' : 'Not yet confirmed'}
                      {p.handicap != null && ` · HCP ${formatHandicap(p.handicap)}`}
                    </p>
                  </div>
                  <span className="text-accent text-lg flex-shrink-0 ml-4">
                    {claimingId === p.id ? '…' : '→'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <p className="text-ink/65 text-[13px] tracking-[0.2em] uppercase mb-4">
          Can&apos;t find your name? Add yourself below
        </p>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Your name"
            required
            className="w-full py-4 px-5 bg-surface border border-bark/12 rounded-xl text-ink text-sm placeholder:text-ink/50 focus:outline-none focus:border-accent/60 transition-colors"
          />
          <HandicapField
            value={addHandicap}
            onChange={setAddHandicap}
            placeholder="Handicap (e.g. 14.2)"
            className="w-full min-w-0 py-4 px-5 bg-surface border border-bark/12 rounded-xl text-ink text-sm placeholder:text-ink/50 focus:outline-none focus:border-accent/60 transition-colors"
          />
          <div className="flex gap-3">
            {(['M', 'F'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setAddGender(g)}
                className={`flex-1 py-4 rounded-xl text-sm font-bold tracking-[0.15em] uppercase transition-colors ${
                  addGender === g
                    ? 'bg-accent-deep text-white'
                    : 'bg-surface border border-bark/12 text-ink/65 hover:border-accent/40'
                }`}
              >
                {g === 'M' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-rust-deep text-sm text-center leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || !addName.trim() || !addHandicap}
            className="w-full py-5 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding ? 'Adding…' : 'Join Trip'}
          </button>
        </form>
      </section>

    </div>
  )
}
