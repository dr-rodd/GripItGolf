'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getBracketStatus, createBracket, previewBracket, bracketBlockedReason,
  type BracketStatus,
} from '@/lib/matchplayStore'
import { isPairsMatchplay, type TripFormats } from '@/lib/formats'
import { pairsBlockedReason, teamNoun } from '@/lib/teamLimits'
import type { MemberLike, TeamLike } from '@/lib/teamLimits'

/**
 * Settings for the matchplay format. Appears when matchplay is switched on
 * for the trip; switching the format on does not generate anything by itself,
 * so creating the bracket is a deliberate click in here.
 *
 * Deliberately not gated on the trip being in draft: an organiser generally
 * wants to draw the bracket once the roster has settled, which is at or after
 * finalising the trip.
 */
export default function MatchplayPanel({
  tripId, tripCode, canEdit, formats, teams, players,
}: {
  tripId: string
  tripCode: string
  canEdit: boolean
  formats: TripFormats
  teams: TeamLike[]
  players: MemberLike[]
}) {
  // A pairs draw is between pairings, so it is drawn from the team sheet
  // rather than the roster — and cannot be drawn from a broken one.
  const pairs = isPairsMatchplay(formats)
  const kind  = pairs ? 'pair' as const : 'player' as const
  const noun  = teamNoun(formats)
  const [status, setStatus]   = useState<BracketStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [confirming, setConfirming] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus(await getBracketStatus(tripId, kind))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tripId, kind])

  useEffect(() => { refresh() }, [refresh])

  async function generate() {
    setBusy(true)
    setError('')
    try {
      setStatus(await createBracket(tripId, kind))
      setConfirming(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const SECTION = 'bg-white/5 border border-white/10 rounded-2xl p-5'

  if (loading) {
    return (
      <section className={SECTION}>
        <p className="text-[#C9A84C] text-xs tracking-widest uppercase mb-3">Matchplay</p>
        <p className="text-white/30 text-sm">Checking…</p>
      </section>
    )
  }

  const entrantCount = status?.entrantCount ?? 0
  // A broken pairing sheet is the more useful thing to say, so it wins over
  // the generic "not enough entrants" message.
  const blocked = pairs
    ? pairsBlockedReason(formats, teams, players) ?? bracketBlockedReason(entrantCount)
    : bracketBlockedReason(entrantCount)
  const preview = previewBracket(entrantCount)
  const exists  = status?.exists ?? false
  const played  = status?.playedCount ?? 0
  const entrantWord = (n: number) =>
    pairs ? (n === 1 ? noun.one : noun.many) : (n === 1 ? 'player' : 'players')

  return (
    <section className={SECTION}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[#C9A84C] text-xs tracking-widest uppercase">
          {pairs ? 'Pairs Matchplay' : 'Matchplay'}
        </p>
        {exists && (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
            <span className="text-emerald-400/80 text-[10px] tracking-wider uppercase">Bracket drawn</span>
          </span>
        )}
      </div>
      <p className="text-white/40 text-xs mb-4">
        A knockout draw between {pairs ? noun.many : 'players'}. Top seeds are kept
        apart, and byes are handed out when the count isn&apos;t a power of two.
      </p>

      {/* Current state */}
      <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl mb-4">
        {exists ? (
          <>
            <p className="text-white text-sm">
              {status!.matchCount} match{status!.matchCount === 1 ? '' : 'es'} across{' '}
              {status!.roundNames.length} round{status!.roundNames.length === 1 ? '' : 's'}
            </p>
            <p className="text-white/40 text-xs mt-1 leading-snug">
              {status!.roundNames.join(' → ')}
            </p>
            <p className="text-white/40 text-xs mt-2">
              {status!.byeCount > 0 && `${status!.byeCount} bye${status!.byeCount === 1 ? '' : 's'} · `}
              {played > 0
                ? `${played} result${played === 1 ? '' : 's'} recorded`
                : 'No results recorded yet'}
            </p>
          </>
        ) : blocked ? (
          <p className="text-amber-400/90 text-sm leading-snug">{blocked}</p>
        ) : (
          <p className="text-white/60 text-sm leading-snug">
            {entrantCount} {entrantWord(entrantCount)} — this would draw a
            bracket of {preview!.bracketSize}
            {preview!.byeCount > 0 && ` with ${preview!.byeCount} bye${preview!.byeCount === 1 ? '' : 's'}`}
            , {preview!.roundNames.join(' → ')}.
          </p>
        )}
      </div>

      {/* Reshuffle confirmation */}
      {confirming && (
        <div
          className={`px-4 py-4 rounded-xl mb-3 border ${
            played > 0
              ? 'border-amber-500/50 bg-amber-500/10'
              : 'border-white/15 bg-white/5'
          }`}
        >
          {played > 0 ? (
            <>
              <p className="text-amber-400 text-sm font-medium leading-snug mb-1">
                This will erase {played} result{played === 1 ? '' : 's'} already recorded
                for this bracket.
              </p>
              <p className="text-white/50 text-xs leading-snug mb-4">
                A new draw is generated from scratch. Those match outcomes cannot be
                recovered. Hole scores and the other leaderboards are untouched.
              </p>
            </>
          ) : (
            <p className="text-white/70 text-sm leading-snug mb-4">
              This will regenerate the bracket from the {entrantCount}{' '}
              {entrantWord(entrantCount)} registered now. Nothing has been played
              yet, so nothing is lost.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 py-3.5 border border-white/20 text-white/70 rounded-xl text-sm tracking-wider uppercase hover:border-white/40 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={generate}
              disabled={busy}
              className={`flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wider uppercase transition-colors disabled:opacity-40 ${
                played > 0
                  ? 'bg-amber-500 text-[#1a0f0a] hover:bg-amber-400'
                  : 'bg-[#C9A84C] text-[#0a1a0e] hover:bg-[#d4b35a]'
              }`}
            >
              {busy ? 'Working…' : played > 0 ? 'Erase & Reshuffle' : 'Reshuffle'}
            </button>
          </div>
        </div>
      )}

      {/* Primary action */}
      {canEdit && !confirming && (
        exists ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy || !!blocked}
            className="w-full py-3.5 border border-white/20 text-white/70 rounded-xl text-sm tracking-wider uppercase hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
          >
            Reshuffle
          </button>
        ) : (
          <button
            onClick={generate}
            disabled={busy || !!blocked}
            className="w-full py-3.5 bg-[#C9A84C] text-[#0a1a0e] rounded-xl text-sm font-bold tracking-wider uppercase hover:bg-[#d4b35a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Drawing…' : 'Create Matchplay'}
          </button>
        )
      )}

      {exists && (
        <Link
          href={`/trip/${tripCode}/matchplay`}
          className="block text-center text-[#C9A84C]/70 text-xs tracking-wider uppercase mt-3 hover:text-[#C9A84C] transition-colors"
        >
          View the draw →
        </Link>
      )}

      {exists && canEdit && (
        <p className="text-white/25 text-xs mt-3 leading-snug">
          {pairs ? 'Pairings changing' : 'Players joining or leaving'} after the draw
          doesn&apos;t change it. Reshuffle when you want the bracket to match the
          current {pairs ? 'team sheet' : 'roster'}.
        </p>
      )}

      {error && (
        <p className="text-amber-400 text-sm mt-3 leading-snug">{error}</p>
      )}
    </section>
  )
}
