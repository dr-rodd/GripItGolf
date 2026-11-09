'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import type { Leaderboard } from '@/lib/leaderboards'
import {
  type SessionFormat, type OverallRanks, OVERALL_RANKS,
  overallOf, sessionBoardFor, formatOfBoard, describeFormat, feedFor, sessionName,
  withSessionFormat, withSessionName, withSessionFeed, withOverallRules, withOverallOn, withOverallOff,
  MAX_SESSION_NAME, formatIssue,
} from '@/lib/sessions'
import { daySheetId } from '@/lib/teamSets'
import { courseLabel } from '@/lib/courseDirectory'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, optionClass } from '@/app/components/ui'
import { FormatPicker, FeedEditor } from '@/app/dashboard/create/SessionPicker'
import { useTripBase } from '@/app/golf/[root]/[tripCode]/TripBase'

type Round = { id: string; roundNumber: number; courseName: string | null }

const STROKE: SessionFormat = { kind: 'stroke', audience: 'individual', scoring: 'stableford' }

export default function SessionsClient({ tripId, tripCode, rounds, initialBoards, playerCount, tagCount }: {
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
  const [askOff, setAskOff] = useState(false)
  const overall = overallOf(boards)
  const rules = overall?.overall
  const entrants = rules?.ranks === 'tags' ? Math.max(2, tagCount) : Math.max(1, playerCount)

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

  return (
    <main className="min-h-dvh paper has-tabbar page-enter">
      <TripHeader backTo={`${tripHome}/organiser`} />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <h1 className="t-h1 text-ink mb-1">Session formats</h1>
        <p className="text-ink/65 text-sm mb-6 leading-snug">
          Each session plays its own format and feeds the Overall. Changing one never touches a score.
        </p>

        {error && <p className="text-rust-deep text-[13px] mb-4">{error}</p>}

        {!overall ? (
          <div className={`p-4 ${cardClass()}`}>
            <p className="t-card text-ink">The Dynamic Overall Leaderboard is off</p>
            <p className="t-cap text-ink/65 mt-1 leading-snug">
              Turn it on and each round becomes a session, playing the event&apos;s leaderboard format to start with.
              Your leaderboards stay, beside the Overall.
            </p>
            <button type="button" className={`${buttonClass('primary')} mt-4`}
              onClick={() => save(withOverallOn(boards, rounds.map(r => r.id), tagCount >= 2 ? 'tags' : 'individuals', daySheetId))}>
              Turn it on
            </button>
          </div>
        ) : (
          <>
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

            <div className="space-y-4">
              {rounds.map(r => {
                const board = sessionBoardFor(boards, r.id)
                const format = board ? formatOfBoard(board) : null
                const feed = feedFor(rules!, r.id, board, entrants)
                const open = editing?.roundId === r.id
                return (
                  <div key={r.id} className={`p-4 ${cardClass()}`}>
                    <p className="t-card text-ink">{sessionName(rules, r.id, r.roundNumber)}</p>
                    {r.courseName && <p className="t-cap text-ink/65 mt-0.5">{courseLabel(r.courseName)}</p>}

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
                    {!open ? (
                      <button type="button" className={`${buttonClass('secondary', false)} mt-3`}
                        onClick={() => setEditing({ roundId: r.id, format: format ?? STROKE })}>
                        Change format
                      </button>
                    ) : (
                      <div className={`mt-3 p-3 ${cardClass('flat')}`}>
                        <FormatPicker value={editing.format} onChange={f => setEditing({ roundId: r.id, format: f })} />
                        {formatIssue(editing.format) && (
                          <p className="t-cap text-ink/65 mt-3">{formatIssue(editing.format)}</p>
                        )}
                        <div className="flex gap-2 mt-4 flex-wrap">
                          <button type="button" className={buttonClass('primary', false, true)}
                            disabled={!!formatIssue(editing.format)}
                            onClick={() => { save(withSessionFormat(boards, r.id, editing.format, daySheetId(r.id))); setEditing(null) }}>
                            Save format
                          </button>
                          <button type="button" className={buttonClass('secondary', false, true)}
                            onClick={() => { save(withSessionFormat(boards, r.id, null, daySheetId(r.id))); setEditing(null) }}>
                            Make it TBC
                          </button>
                          <button type="button" className={buttonClass('quiet', false, true)} onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <p className={`${FIELD_LABEL} mt-4`}>Feeds the Overall</p>
                    <FeedEditor
                      format={format}
                      feed={feed}
                      entrants={entrants}
                      label={sessionName(rules, r.id, r.roundNumber)}
                      onChange={next => save(withSessionFeed(boards, r.id, next))}
                    />
                  </div>
                )
              })}
            </div>

            <div className={`mt-8 p-4 ${cardClass('flat')}`}>
              {!askOff ? (
                <button type="button" className={buttonClass('danger')} onClick={() => setAskOff(true)}>
                  Turn the Dynamic Overall Leaderboard off
                </button>
              ) : (
                <>
                  <p className="text-ink text-sm font-medium">Turn the Overall off?</p>
                  <p className="text-ink/65 text-[13px] mt-1 leading-snug">
                    The Overall goes. Every session&apos;s own leaderboard and every score stays, and turning it back on brings the Overall back.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" className={buttonClass('secondary', false, true)} onClick={() => setAskOff(false)}>Keep it on</button>
                    <button type="button" className={buttonClass('danger', false, true)}
                      onClick={() => { setAskOff(false); save(withOverallOff(boards)) }}>
                      Turn it off
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
