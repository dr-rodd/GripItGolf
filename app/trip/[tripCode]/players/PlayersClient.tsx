'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
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
 *   unconfirmed  check the handicap, claim the slot, link this device
 *   confirmed    link this device, and change nothing else
 *
 * **Only the first of those asks anything.** Claiming a slot is the one
 * moment the person themselves is at the other end of a handicap somebody
 * else typed in — the lead player filled the roster in from memory, and a
 * handicap that is a year out of date is not noticed until it has scored a
 * round. So the claim opens the sheet below with their handicap in it, to
 * confirm or correct in one tap. See `HandicapCheck`.
 *
 * Linking a second device asks nothing and is not an error state. Somebody
 * opening the trip on a tablet after joining on their phone is doing the
 * expected thing, they have already answered the handicap question, and a
 * mis-tap onto the wrong name costs one tap of "Not you?" on the hub it
 * lands on.
 *
 * The tile borders are the round tiles' borders, from `lib/roundState.ts` —
 * confirmed reads as finalised the way a played round does, unconfirmed as
 * the quietest thing on the page. Only the two states used are imported:
 * the live one carries the app's single pinned glow and has no business here.
 */
/**
 * "Is this your handicap?" — asked once, as a name is claimed.
 *
 * The roster is filled in by the lead player from memory, so a handicap on
 * this screen is somebody else's recollection of yours. This is the one
 * moment the right person is holding the phone, and it costs them a tap:
 * the stored figure is already in the box, and Confirm takes it as it
 * stands. It is not a form to fill in, it is a figure to agree with.
 *
 * A bottom sheet over a scrim, portalled to `<body>` — the same shape as the
 * hub's preferences sheet, and portalled for the same reason: `position:
 * fixed` means the viewport only from somewhere no ancestor has a filter or
 * a transform on it, and `<body>` is the one place that is always true.
 *
 * A handicap is required to go on. That is the same bar the add-yourself
 * form below already sets — a player with no handicap is scored off nothing
 * — and on the ordinary path the box is not empty, so it is not a bar
 * anybody meets.
 */
function HandicapCheck({
  player, busy, error, onConfirm, onCancel,
}: {
  player: Player
  busy: boolean
  /**
   * Whatever the claim came back with, said in here.
   *
   * The screen's own error line lives down in the add-yourself form, which
   * is behind the scrim while this is open — an error reported there would
   * be a Confirm that visibly did nothing.
   */
  error: string
  /** The agreed handicap, or null when the stored one was left alone. */
  onConfirm: (handicap: number | null) => void
  onCancel: () => void
}) {
  const stored = player.handicap ?? null
  const [text, setText] = useState(stored === null ? '' : formatHandicap(stored))

  const typed = parseHandicap(text)

  function submit() {
    if (busy || typed === null) return
    // The one value on this form that means the opposite of what it looks
    // like, asked before it is written — see PLUS_HANDICAP_WARNING. Only on
    // a change: somebody confirming the plus handicap they already have has
    // been told once already.
    if (isPlusHandicap(typed) && typed !== stored
        && !window.confirm(PLUS_HANDICAP_WARNING)) return
    // Null when it is the figure that was already there, so the claim writes
    // one column instead of two and the snapshots are left alone.
    onConfirm(typed === stored ? null : typed)
  }

  return createPortal(
    <>
      {/* A warm near-black constant rather than a token: a scrim darkens in
          both themes, and ink flips light in the dark one. */}
      <div
        className="fixed inset-0 z-50 page-enter"
        style={{ backgroundColor: 'rgba(20, 15, 11, 0.55)' }}
        onClick={busy ? undefined : onCancel}
      />

      <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Confirm ${player.name}'s handicap`}
          className="bg-surface border border-bark/12 rounded-2xl w-full max-w-md mx-auto sheet-up"
        >
          <div className="px-5 py-4 border-b border-bark/12">
            <h2 className="t-card text-ink">Your handicap</h2>
            <p className="t-cap text-ink/65 mt-0.5">{player.name}</p>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            <p className="t-cap text-ink/65 leading-snug">
              {stored === null
                ? 'We don’t have a handicap for you yet. Enter it before you go on — every score you make is counted off it.'
                : 'Every score you make is counted off this. Change it here if it’s out of date.'}
            </p>

            <HandicapField
              value={text}
              onChange={setText}
              placeholder="e.g. 14.2"
              disabled={busy}
              className="w-full min-w-0 py-4 px-5 bg-cream border border-bark/12 rounded-xl text-ink text-base tabular-nums placeholder:text-ink/50 focus:outline-none focus:border-accent/60 transition-colors"
            />

            {error && (
              <p className="text-rust-deep text-sm text-center leading-snug">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 py-4 rounded-xl bg-surface border border-bark/12 text-ink/65 text-sm font-bold tracking-[0.15em] uppercase hover:border-bark/25 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || typed === null}
                className="flex-[2] py-4 rounded-xl bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? 'Joining…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

export default function PlayersClient({
  tripCode,
  tripId,
  players,
  confirmed,
  roundIds,
  canAddPlayers = true,
  askHandicap = true,
}: {
  tripCode: string
  tripId: string
  /** Everyone on the trip, already in the order they should be offered in. */
  players: Player[]
  confirmed: number
  /** Every round on the trip, for a late joiner's handicap snapshots. */
  roundIds: string[]
  /**
   * Whether a new name may be added from this screen. Always true on a
   * trip; an event answers from its organiser's permissions
   * (lib/eventPermissions.ts, `add_players`). Off, the add form is not
   * rendered at all — claiming a name the organiser entered stays open.
   */
  canAddPlayers?: boolean
  /**
   * Whether claiming a name stops to check the handicap.
   *
   * True on a trip, where the lead player filled the roster in from memory
   * and the person tapping is the one who knows. False on an event: the
   * organiser entered that field deliberately, often off a club list, and
   * the field editing it on the way in is the organiser's decision to make
   * rather than this screen's. Off, a claim is exactly what it always was —
   * one tap, no sheet.
   */
  askHandicap?: boolean
}) {
  const router = useRouter()
  const [claimingId, setClaimingId] = useState<string | null>(null)
  /** The player whose handicap is being checked, if the sheet is open. */
  const [checking, setChecking] = useState<Player | null>(null)
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

  /**
   * A name nobody has taken yet: take it, at the handicap they just agreed.
   *
   * `handicap` is null when nothing changed — either the sheet was answered
   * with the stored figure untouched, or this trip does not ask (see
   * `askHandicap`). One `update` either way: the claim and the correction
   * are the same moment and there is no state where a phone is claimed at a
   * handicap it disagreed with.
   *
   * The snapshots follow, through the same `syncRoundHandicaps` settings and
   * the add form both use. A trip's rounds usually exist before the field
   * has finished joining, so a corrected handicap that never reached
   * `round_handicaps` would be corrected on the roster and wrong on every
   * card — which is the failure this whole sheet exists to prevent. It is
   * therefore worth stopping for rather than sending them on.
   */
  async function handleClaim(player: Player, handicap: number | null) {
    setError('')
    setClaimingId(player.id)
    const { error: err } = await supabase
      .from('players')
      .update({ claimed: true, ...(handicap !== null ? { handicap } : {}) })
      .eq('id', player.id)
    if (err) {
      setClaimingId(null)
      setError('Could not claim player — try again')
      return
    }

    if (handicap !== null) {
      const hcpErr = await syncRoundHandicaps(roundIds, player.id, handicap)
      if (hcpErr) {
        setClaimingId(null)
        setError(
          'Claimed your name, but your new handicap did not reach the rounds. ' +
          'Open Trip Setup and re-enter it before you play.',
        )
        return
      }
    }

    setChecking(null)
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
    // The one question this screen asks, and only of the person taking the
    // name for the first time. Nothing is written until they answer — a
    // sheet closed without confirming leaves the slot exactly as it was.
    else if (askHandicap) setChecking(player)
    else handleClaim(player, null)
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

      {/* Only ever over a first claim. Rendered last in the tree but drawn
          over everything, because it is portalled to <body>. */}
      {checking && (
        <HandicapCheck
          player={checking}
          busy={claimingId === checking.id}
          error={error}
          onConfirm={handicap => handleClaim(checking, handicap)}
          onCancel={() => { setChecking(null); setError('') }}
        />
      )}

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
                  className={`flex items-center justify-between w-full px-5 py-4 rounded-2xl text-left press disabled:opacity-50 ${
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

      {/* The add form exists only where adding is allowed — on an event
          whose organiser keeps the roster to themselves, there is nothing
          to see or reach here, only the quiet line below saying why. */}
      {!canAddPlayers ? (
        <section>
          <p className="text-ink/65 text-[13px] text-center leading-snug">
            Can&apos;t find your name? The organiser adds the field on this
            event — ask them to put you on the list.
          </p>
        </section>
      ) : (
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
      )}

    </div>
  )
}
