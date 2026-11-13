'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import type { Leaderboard } from '@/lib/leaderboards'
import {
  type SessionFormat, type OverallRanks, OVERALL_RANKS,
  overallOf, sessionBoardFor, describeFormat, feedFor,
  withSessionName, withSessionFeed, withOverallRules,
  MAX_SESSION_NAME, formatIssue, sameFormat, formatKey, withSessionSlots, defaultMatchSlots, MAX_MATCH_SLOTS,
} from '@/lib/sessions'
import { roundFormatsOf, roundLabelOf, storedShape } from '@/lib/eventShape'
import { type FormatChange, type StandingRow, changeRoundFormat } from '@/lib/shapeChange'
import { Stepper } from '@/app/components/ItineraryForms'
import { courseLabel } from '@/lib/courseDirectory'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, optionClass } from '@/app/components/ui'
import { FormatPicker, FeedEditor } from '@/app/dashboard/create/SessionPicker'
import { useTripBase } from '@/app/golf/[root]/[tripCode]/TripBase'

type Round = { id: string; roundNumber: number; courseName: string | null }

const STROKE: SessionFormat = { kind: 'stroke', audience: 'individual', scoring: 'stableford' }

type Standings = { title: string; rows: StandingRow[] }

/** A change that crosses between the Primary and the Overall, waiting for its yes (D89). */
type Pending = {
  roundId: string
  change: FormatChange
  preview: { before: Standings; after: Standings } | 'loading' | 'failed'
}

/**
 * Formats — an event's golf after it is made (Ross, 13 Nov 2026, D89):
 * every round's format, read from its boards, changed through the one rule
 * (lib/shapeChange.ts). A change that keeps the event's shape saves at once;
 * one that crosses between the Primary and the Overall asks first, with the
 * standings before and after, and deletes nothing. Changing the formats is
 * the switch — there is no Overall on/off any more. On an Overall, also each
 * session's name, count and feed, and what the Overall ranks.
 */
export default function SessionsClient({ tripId, tripCode, rounds, initialBoards, playerCount, tagCount, isTrip = false }: {
  /** A trip: back to Trip Setup, and said as a trip (the lead player's). */
  isTrip?: boolean
  tripId: string
  tripCode: string
  rounds: Round[]
  initialBoards: Leaderboard[]
  playerCount: number
  tagCount: number
}) {
  const tripHome = useTripBase(tripCode)
  const [boards, setBoards] = useState<Leaderboard[]>(initialBoards)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ roundId: string; format: SessionFormat } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const overall = overallOf(boards)
  const rules = overall?.overall
  const shape = storedShape(boards)
  const roundIds = rounds.map(r => r.id)
  const formats = roundFormatsOf(boards, roundIds)
  // Every format a round of this event plays, once each — the tiles.
  const usedFormats = formats
    .filter((f, i, all): f is SessionFormat => !!f && all.findIndex(g => sameFormat(g, f)) === i)
  const entrants = rules?.ranks === 'tags' ? Math.max(2, tagCount) : Math.max(1, playerCount)
  const word = shape.unit === 'Session' ? 'session' : 'round'

  async function save(next: Leaderboard[]) {
    const prev = boards
    setBoards(next)
    setError(null)
    const { error: err } = await supabase.from('trips').update({ leaderboards: next }).eq('id', tripId)
    if (err) {
      setBoards(prev)
      setError('Could not save — try again')
    }
  }

  /** A round's format chosen: saved, or — crossing — asked first with the standings either side. */
  async function choose(roundId: string, format: SessionFormat | null) {
    setEditing(null)
    const change = changeRoundFormat(boards, roundIds, roundId, format, tagCount)
    if (!change.crossing) { await save(change.boards); return }
    setPending({ roundId, change, preview: 'loading' })
    try {
      const res = await fetch('/api/event/shape-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: tripCode, boards: change.boards }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const preview = await res.json() as { before: Standings; after: Standings }
      setPending(p => (p && p.change === change ? { ...p, preview } : p))
    } catch {
      setPending(p => (p && p.change === change ? { ...p, preview: 'failed' } : p))
    }
  }

  const table = (s: Standings, heading: string) => (
    <div className="min-w-0">
      <p className="t-label text-ink">{heading}</p>
      <p className="t-cap text-ink/65">{s.title}</p>
      {s.rows.length === 0 ? (
        <p className="t-cap text-ink/65 mt-1">No scores yet.</p>
      ) : (
        <ol className="mt-1 space-y-0.5">
          {s.rows.map((r, i) => (
            <li key={i} className="flex gap-2 t-cap text-ink">
              <span className="font-serif w-5 text-ink/65">{r.place}</span>
              <span className="truncate flex-1 min-w-0">{r.name}</span>
              <span className="font-serif">{r.total}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={isTrip ? `${tripHome}/setup` : `${tripHome}/organiser`} />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <h1 className="t-h1 text-ink mb-1">Formats</h1>
        <p className="text-ink/65 text-sm mb-2 leading-snug">
          Each {word}&apos;s golf. The leaderboard follows from it, and changing a format never touches a score.
        </p>
        <p className="t-label text-ink/65 mb-6">
          {shape.main === 'overall' ? 'Overall' : 'Leaderboard'} · {rounds.length} {word}{rounds.length === 1 ? '' : 's'}
        </p>

        {error && <p className="text-rust-deep text-[13px] mb-4">{error}</p>}

        {overall && (
          <div className="mb-6">
            <p className={FIELD_LABEL}>Who does the Overall rank?</p>
            <div className="space-y-2">
              {OVERALL_RANKS.filter(o => o.key !== 'tags' || tagCount > 0 || rules?.ranks === 'tags').map(o => (
                <button key={o.key} type="button" className={optionClass(rules?.ranks === o.key)}
                  onClick={() => save(withOverallRules(boards, r => ({ ...r, ranks: o.key as OverallRanks })))}>
                  <p className="text-ink text-[15px] font-medium">{o.label}</p>
                  <p className="t-cap text-ink/65 mt-0.5">{o.hint}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {rounds.length === 0 && (
          <p className="t-cap text-ink/65">No rounds yet — a round&apos;s format is set here once it has a venue.</p>
        )}

        <div className="space-y-4">
          {rounds.map((r, i) => {
            const board = overall ? sessionBoardFor(boards, r.id) : null
            const format = formats[i]
            const feed = overall ? feedFor(rules!, r.id, board, entrants) : null
            const open = editing?.roundId === r.id
            const label = roundLabelOf(boards, r.id, r.roundNumber)
            const asking = pending?.roundId === r.id ? pending : null
            return (
              <div key={r.id} className={`p-4 ${cardClass()}`}>
                <p className="t-card text-ink">{label}</p>
                {r.courseName && <p className="t-cap text-ink/65 mt-0.5">{courseLabel(r.courseName)}</p>}

                {asking && (
                  // D89: a change that crosses asks first, with the standings either side.
                  <div className={`mt-4 p-4 ${cardClass('floating')}`}>
                    <p className="text-ink text-sm font-medium">
                      {asking.change.crossing === 'to_overall' ? 'This makes the event an Overall' : 'Every session now plays one format'}
                    </p>
                    <p className="text-ink/65 text-[13px] mt-1 leading-snug">
                      {asking.change.crossing === 'to_overall'
                        ? `A leaderboard can’t add this up with the other rounds, so each round becomes a session paying points to the Overall — Round ${r.roundNumber} becomes Session ${r.roundNumber}. Every leaderboard and score stays, beside the Overall.`
                        : `The sessions could add up to one total again — Session ${r.roundNumber} becomes Round ${r.roundNumber}. The Overall goes; every session’s own leaderboard and every score stays. Or keep the Overall and its points per session.`}
                    </p>
                    {asking.preview === 'loading' ? (
                      <p className="t-cap text-ink/65 mt-3">Working out the standings…</p>
                    ) : asking.preview === 'failed' ? (
                      <p className="t-cap text-ink/65 mt-3">Could not work out the standings — the change is still yours to make.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        {table(asking.preview.before, 'Now')}
                        {table(asking.preview.after, 'After')}
                      </div>
                    )}
                    <div className="flex gap-2 mt-4 flex-wrap">
                      <button type="button" className={buttonClass('primary', false, true)}
                        onClick={() => { const next = asking.change.boards; setPending(null); save(next) }}>
                        {asking.change.crossing === 'to_overall' ? 'Change to the Overall' : 'Make it one total'}
                      </button>
                      {asking.change.staying && (
                        <button type="button" className={buttonClass('secondary', false, true)}
                          onClick={() => { const next = asking.change.staying!; setPending(null); save(next) }}>
                          Keep the Overall
                        </button>
                      )}
                      <button type="button" className={buttonClass('quiet', false, true)} onClick={() => setPending(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {overall && (
                  <>
                    <label className={`${FIELD_LABEL} mt-4`}>Name</label>
                    <input
                      type="text"
                      className={FIELD}
                      maxLength={MAX_SESSION_NAME}
                      defaultValue={rules?.names?.[r.id] ?? ''}
                      placeholder={`Session ${r.roundNumber}`}
                      onBlur={e => {
                        if ((rules?.names?.[r.id] ?? '') !== e.target.value.trim()) save(withSessionName(boards, r.id, e.target.value))
                      }}
                    />
                  </>
                )}

                <p className={`${FIELD_LABEL} mt-4`}>Format</p>
                <p className="text-ink text-[15px]">{describeFormat(format)}</p>
                {!format && (
                  <p className="t-cap text-ink/65 mt-0.5">This session counts nothing until its format is set.</p>
                )}
                {format?.kind === 'matches' && (
                  <Link href={`${tripHome}/order?round=${r.id}`} className="t-label text-accent-deep mt-1 inline-block">
                    Set the matches →
                  </Link>
                )}
                {/* How many matches: the order of play's rows and the
                    points the Overall's ticker counts. */}
                {overall && format?.kind === 'matches' && (
                  <div className="mt-4">
                    <Stepper
                      label="How many matches?"
                      value={rules?.slots?.[r.id] ?? defaultMatchSlots(playerCount, format.match)}
                      min={1}
                      max={MAX_MATCH_SLOTS}
                      unit={n => (n === 1 ? 'match' : 'matches')}
                      onChange={n => save(withSessionSlots(boards, r.id, n))}
                    />
                  </div>
                )}
                {/* The event's formats as tiles — a tap is the answer —
                    then TBC on an Overall, and a new format under them. */}
                <div className="mt-3 space-y-2">
                  {usedFormats.map(f => {
                    const on = sameFormat(f, format)
                    return (
                      <button key={formatKey(f)} type="button" className={optionClass(on)} aria-pressed={on}
                        onClick={() => { if (!on) choose(r.id, f) }}>
                        <p className="text-ink text-[15px] font-medium">{describeFormat(f)}</p>
                      </button>
                    )
                  })}
                  {overall && (
                    <button type="button" className={optionClass(!format)} aria-pressed={!format}
                      onClick={() => { if (format) choose(r.id, null) }}>
                      <p className="text-ink text-[15px] font-medium">Format TBC</p>
                      <p className="t-cap text-ink/65 mt-0.5">Counts nothing until it is set.</p>
                    </button>
                  )}
                </div>
                <div className={`mt-3 p-3 ${cardClass('flat')}`}>
                  <p className="t-label text-ink mb-3">Or a new format</p>
                  <FormatPicker
                    idle={!open}
                    value={open ? editing.format : format ?? STROKE}
                    onChange={f => setEditing({ roundId: r.id, format: f })}
                  />
                  {open && (
                    <>
                      {formatIssue(editing.format) && (
                        <p className="t-cap text-ink/65 mt-3">{formatIssue(editing.format)}</p>
                      )}
                      <div className="flex gap-2 mt-4 flex-wrap">
                        <button type="button" className={buttonClass('primary', false, true)}
                          disabled={!!formatIssue(editing.format)}
                          onClick={() => choose(r.id, editing.format)}>
                          Save this format
                        </button>
                        <button type="button" className={buttonClass('quiet', false, true)} onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {overall && feed && (
                  <>
                    <p className={`${FIELD_LABEL} mt-4`}>Feeds the Overall</p>
                    <FeedEditor
                      format={format}
                      feed={feed}
                      entrants={entrants}
                      label={label}
                      onChange={next => save(withSessionFeed(boards, r.id, next))}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
