'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getBracketStatus, createBracket, previewBracket, bracketBlockedReason,
  type BracketStatus,
} from '@/lib/matchplayStore'
import { needsPairings, type Leaderboard } from '@/lib/leaderboards'
import { MAIN_SET, setOf } from '@/lib/teamSets'
import { pairsBlockedReason, teamNoun } from '@/lib/teamLimits'
import type { MemberLike, TeamLike } from '@/lib/teamLimits'

/**
 * Settings for the matchplay format. Appears when the trip runs a knockout;
 * choosing one does not generate anything by itself, so drawing the bracket is
 * a deliberate click in here.
 *
 * Deliberately not gated on the trip being in draft: an organiser generally
 * wants to draw the bracket once the roster has settled, which is at or after
 * finalising the trip.
 */
export default function MatchplayPanel({
  tripId, tripCode, canEdit, boards, teams, players,
}: {
  tripId: string
  tripCode: string
  canEdit: boolean
  boards: readonly Leaderboard[]
  teams: TeamLike[]
  players: MemberLike[]
}) {
  // A pairs draw is between pairings, so it is drawn from the team sheet
  // rather than the roster — and cannot be drawn from a broken one.
  const pairs = needsPairings(boards)
  const kind  = pairs ? 'pair' as const : 'player' as const
  const noun  = teamNoun(boards)
  // The draw's own sheet. A trip running a league between fours and this
  // knockout between pairings has two, and seating the bracket from the
  // wrong one would put four players on a side.
  const draw  = boards.find(lb => lb.competition === 'matchplay')
  const sheet = draw ? setOf(draw) : MAIN_SET
  const [status, setStatus]   = useState<BracketStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [confirming, setConfirming] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus(await getBracketStatus(tripId, kind, sheet))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tripId, kind, sheet])

  useEffect(() => { refresh() }, [refresh])

  async function generate() {
    setBusy(true)
    setError('')
    try {
      setStatus(await createBracket(tripId, kind, sheet))
      setConfirming(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const SECTION = 'bg-surface border border-bark/12 rounded-2xl p-5'

  if (loading) {
    return (
      <section className={SECTION}>
        <p className="text-ink/65 text-[13px] tracking-widest uppercase mb-3">Matchplay</p>
        <p className="text-ink/65 text-sm">Checking…</p>
      </section>
    )
  }

  const entrantCount = status?.entrantCount ?? 0
  // A broken pairing sheet is the more useful thing to say, so it wins over
  // the generic "not enough entrants" message.
  const blocked = pairs
    ? pairsBlockedReason(boards, teams, players) ?? bracketBlockedReason(entrantCount)
    : bracketBlockedReason(entrantCount)
  const preview = previewBracket(entrantCount)
  const exists  = status?.exists ?? false
  const played  = status?.playedCount ?? 0
  const entrantWord = (n: number) =>
    pairs ? (n === 1 ? noun.one : noun.many) : (n === 1 ? 'player' : 'players')

  return (
    <section className={SECTION}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-ink/65 text-[13px] tracking-widest uppercase">
          {pairs ? 'Pairs Matchplay' : 'Matchplay'}
        </p>
        {exists && (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent " />
            <span className="text-accent/80 text-[13px] tracking-wider uppercase">Bracket drawn</span>
          </span>
        )}
      </div>
      <p className="text-ink/65 text-[13px] mb-4">
        A knockout draw between {pairs ? noun.many : 'players'}. Top seeds are kept
        apart, byes may be needed if players don&apos;t match up equally.
      </p>

      {/* Current state */}
      <div className="px-4 py-3 bg-surface border border-bark/12 rounded-xl mb-4">
        {exists ? (
          <>
            <p className="text-ink text-sm">
              {status!.matchCount} match{status!.matchCount === 1 ? '' : 'es'} across{' '}
              {status!.roundNames.length} round{status!.roundNames.length === 1 ? '' : 's'}
            </p>
            <p className="text-ink/65 text-[13px] mt-1 leading-snug">
              {status!.roundNames.join(' → ')}
            </p>
            <p className="text-ink/65 text-[13px] mt-2">
              {status!.byeCount > 0 && `${status!.byeCount} bye${status!.byeCount === 1 ? '' : 's'} · `}
              {played > 0
                ? `${played} result${played === 1 ? '' : 's'} recorded`
                : 'No results recorded yet'}
            </p>
          </>
        ) : blocked ? (
          <p className="text-rust/90 text-sm leading-snug">{blocked}</p>
        ) : (
          <p className="text-ink/80 text-sm leading-snug">
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
              ? 'border-rust/50 bg-rust/10'
              : 'border-bark/12 bg-surface'
          }`}
        >
          {played > 0 ? (
            <>
              <p className="text-rust-deep text-sm font-medium leading-snug mb-1">
                This will erase {played} result{played === 1 ? '' : 's'} already recorded
                for this bracket.
              </p>
              <p className="text-ink/65 text-[13px] leading-snug mb-4">
                A new draw will be generated from scratch. Match outcomes cannot be
                recovered.
              </p>
            </>
          ) : (
            <p className="text-ink/80 text-sm leading-snug mb-4">
              This will regenerate the bracket from the {entrantCount}{' '}
              {entrantWord(entrantCount)} registered now. Nothing has been played
              yet, so nothing is lost.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 py-3.5 border border-bark/25 text-ink/80 rounded-xl text-sm tracking-wider uppercase hover:border-bark/25 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={generate}
              disabled={busy}
              className={`flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wider uppercase transition-colors disabled:opacity-40 ${
                played > 0
                  ? 'bg-rust-deep text-[#1a0f0a] hover:bg-rust-deep'
                  : 'bg-accent-deep text-white hover:bg-accent'
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
            className="w-full py-3.5 border border-bark/25 text-ink/80 rounded-xl text-sm tracking-wider uppercase hover:border-bark/25 hover:text-ink transition-colors disabled:opacity-40"
          >
            Reshuffle
          </button>
        ) : (
          <button
            onClick={generate}
            disabled={busy || !!blocked}
            className="w-full py-3.5 bg-accent-deep text-white rounded-xl text-sm font-bold tracking-wider uppercase hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Drawing…' : 'Create Matchplay'}
          </button>
        )
      )}

      {exists && (
        <Link
          href={`/trip/${tripCode}/matchplay`}
          className="block text-center text-accent/70 text-[13px] tracking-wider uppercase mt-3 hover:text-accent transition-colors"
        >
          View the draw →
        </Link>
      )}

      {exists && canEdit && (
        <p className="text-ink/50 text-[13px] mt-3 leading-snug">
          {pairs ? 'Pairings changing' : 'Players joining or leaving'} after the draw
          doesn&apos;t change it. Reshuffle when you want the bracket to match the
          current {pairs ? 'team sheet' : 'roster'}.
        </p>
      )}

      {error && (
        <p className="text-rust-deep text-sm mt-3 leading-snug">{error}</p>
      )}
    </section>
  )
}
