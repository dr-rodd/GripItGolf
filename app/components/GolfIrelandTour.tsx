'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { parseMemberQuery, maskMembershipNumber } from '@/lib/golfIreland'
import { LinkHeading, LinkedBadge } from './LinkMark'
import { FIELD, buttonClass, cardClass } from './ui'

/**
 * How linking to Golf Ireland would work — a hands-on preview, over the page.
 *
 * A mimic, not the thing: it plays out what happens once Golf Ireland lets
 * a club's members be found by their membership number, which it does not
 * yet. Rather than describing the screens it shows them, full size and in
 * the app's own parts, and the viewer does the linking themselves: tick the
 * consent, type a number (any number), search, pick themselves, then step
 * into the organiser's shoes to confirm, watch their rounds arrive, and see
 * the mark beside their name on the board. One plain line above each
 * screen says what is going on and what to do next.
 *
 * Nothing is read or written — no request leaves the phone. The "searching"
 * and "reading your rounds" pauses are timers, there so the flow has the
 * rhythm the real one will. Every name, number and score is invented apart
 * from the number the viewer types, which is only ever masked back to them.
 */

type Stage =
  | 'card' | 'searching' | 'found' | 'requested'
  | 'organiser' | 'syncing' | 'rounds' | 'board'

/** The step counter's stages — the waits are part of the step before them. */
const STEPS: Stage[] = ['card', 'found', 'requested', 'organiser', 'rounds', 'board']
const stepOf = (s: Stage) =>
  STEPS.indexOf(s === 'searching' ? 'card' : s === 'syncing' ? 'organiser' : s) + 1

const EXAMPLE_NUMBER = '0049812377'
const SEARCH_MS = 1100
const SYNC_MS = 1600

/** What the line above each screen says. */
const HINTS: Record<Stage, string> = {
  card: 'You’ve claimed your name in a league that reads Golf Ireland rounds. Tick the box, type your membership number, and search.',
  searching: 'Green Dot asks your club’s membership, through Golf Ireland, for that number.',
  found: 'Only enough to recognise yourself: your name, the end of your number, your club. If it’s you, say so.',
  requested: 'The request goes to the league’s organiser. Nothing of yours is read until they confirm it’s you.',
  organiser: 'Now you’re the organiser. You know your members, so you check the name and confirm.',
  syncing: 'Confirmed. Green Dot reads your Golf Ireland rounds from the league’s dates.',
  rounds: 'Rounds that meet the league’s rules count by themselves. One that doesn’t says why.',
  board: 'Linked. The mark sits beside your name wherever the league shows it.',
}

function Spinner() {
  return (
    <span
      className="inline-block w-5 h-5 rounded-full border-2 border-line-strong border-t-accent-deep animate-spin"
      aria-hidden="true"
    />
  )
}

/** The league's own header, as a player would see it above the card. */
function LeagueTitle({ sub }: { sub: string }) {
  return (
    <div className="mb-6">
      <h2 className="t-h1 text-ink">Winter League</h2>
      <p className="text-ink/65 text-sm mt-1">{sub}</p>
    </div>
  )
}

const ROUNDS = [
  { day: 'Sat 7 Nov', holes: 18, pts: 36, issue: null },
  { day: 'Wed 11 Nov', holes: 18, pts: 31, issue: 'Doesn’t count: Saturdays only.' },
  { day: 'Sat 14 Nov', holes: 18, pts: 33, issue: null },
  { day: 'Sun 15 Nov', holes: 9, pts: 17, issue: 'Doesn’t count: 18 holes only.' },
] as const

export default function GolfIrelandTour({ open, onClose, name = 'Pat Murphy', club = 'Example Golf Club' }: {
  open: boolean
  onClose: () => void
  /** Whose name the preview carries — the viewer's, when known. */
  name?: string
  club?: string
}) {
  const [stage, setStage] = useState<Stage>('card')
  const [consent, setConsent] = useState(false)
  const [number, setNumber] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)

  function to(next: Stage, after?: { ms: number; then: Stage }) {
    if (timer.current) clearTimeout(timer.current)
    setStage(next)
    scroller.current?.scrollTo({ top: 0 })
    if (after) timer.current = setTimeout(() => setStage(after.then), after.ms)
  }

  function close() {
    if (timer.current) clearTimeout(timer.current)
    setStage('card'); setConsent(false); setNumber(''); setNote(null)
    onClose()
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
    // close is stable enough for a keydown: it only resets and calls onClose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const query = parseMemberQuery(number)
  const numberIssue = !number.trim() ? null
    : 'issue' in query ? query.issue
    : query.kind !== 'number' ? 'In this preview, search by membership number.'
    : null
  const typed = !('issue' in query) && query.kind === 'number' ? query.number : EXAMPLE_NUMBER

  function search(e: React.FormEvent) {
    e.preventDefault()
    if (!consent) { setNote('Tick the box to agree before searching.'); return }
    if (!number.trim() || numberIssue) { setNote(numberIssue ?? 'Type your membership number.'); return }
    setNote(null)
    to('searching', { ms: SEARCH_MS, then: 'found' })
  }

  const step = stepOf(stage)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preview: linking to Golf Ireland"
      className="fixed inset-0 z-[90] paper flex flex-col"
    >
      {/* ── The preview's own bar ── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),8px)] h-14 border-b border-line flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full bg-accent-tint text-accent-deep t-label px-2.5 py-1">Preview</span>
          <span className="t-cap text-ink/65 tabular-nums truncate">Step {step} of {STEPS.length}</span>
        </div>
        <button type="button" onClick={close} className="t-label text-ink/65 hover:text-ink px-2 py-2">
          Close
        </button>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-6 pt-5 pb-10">
          {/* What is happening, in one plain line — the only thing here that
              is not the app's own screen. */}
          <p key={stage} className="rounded-tile bg-tint px-4 py-3 text-ink/80 text-[13px] leading-snug mb-6 step-in-forward" aria-live="polite">
            {HINTS[stage]}
          </p>

          {/* ── 1 · The link card, on the league's join screen ── */}
          {(stage === 'card' || stage === 'searching') && (
            <>
              <LeagueTitle sub="Join the event" />
              <section className={`p-4 ${cardClass()}`}>
                <LinkHeading>Link your Golf Ireland membership</LinkHeading>
                <p className="text-ink/65 text-[13px] mt-3 leading-snug">
                  This league reads the rounds you hand in to Golf Ireland, so you
                  don&apos;t score them twice. Find yourself in your club&apos;s
                  membership, and the organiser confirms it&apos;s you.
                </p>
                <p className="t-cap text-ink/65 mt-2">Rounds that count: 18 holes · Saturdays · any course</p>

                <label className="flex items-start gap-3 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={e => { setConsent(e.target.checked); setNote(null) }}
                    disabled={stage === 'searching'}
                    className="mt-1 w-4 h-4 accent-accent flex-shrink-0"
                  />
                  <span className="text-ink/80 text-[13px] leading-snug">
                    I agree that Green Dot reads my Golf Ireland rounds that meet
                    this league&apos;s rules, and shows their totals on its
                    leaderboard. Unlinking deletes them at once.
                  </span>
                </label>

                <form onSubmit={search} className="flex gap-2 mt-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={number}
                    onChange={e => { setNumber(e.target.value); setNote(null) }}
                    placeholder="Membership number"
                    aria-label="Membership number"
                    disabled={stage === 'searching'}
                    className={`${FIELD} flex-1 min-w-0 tabular-nums`}
                  />
                  <button type="submit" disabled={stage === 'searching'} className={buttonClass('secondary', false)}>
                    {stage === 'searching' ? <Spinner /> : 'Search'}
                  </button>
                </form>
                {stage === 'card' && !number && (
                  <button
                    type="button"
                    onClick={() => setNumber(EXAMPLE_NUMBER)}
                    className="block t-cap text-accent-deep hover:text-accent transition-colors mt-2"
                  >
                    Use an example number
                  </button>
                )}
                <p className="t-cap text-ink/65 mt-2">Searching {club}</p>
                {stage === 'searching' && (
                  <p className="flex items-center gap-2 text-ink/80 text-[13px] mt-3">
                    <Spinner /> Searching {club}&apos;s membership…
                  </p>
                )}
                {note && <p className="text-rust-deep text-[13px] mt-3 leading-snug">{note}</p>}
              </section>
            </>
          )}

          {/* ── 2 · The match ── */}
          {stage === 'found' && (
            <div className="step-in-forward">
              <LeagueTitle sub="Join the event" />
              <section className={`p-4 ${cardClass()}`}>
                <LinkHeading>Link your Golf Ireland membership</LinkHeading>
                <div className={`${FIELD} mt-4 tabular-nums text-ink/80`}>{typed}</div>
                <p className="t-cap text-ink/65 mt-3 mb-2">1 member found</p>
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-tile border border-line">
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-medium truncate">{name}</p>
                    <p className="t-cap text-ink/65 tabular-nums truncate">{maskMembershipNumber(typed)} · {club}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => to('requested')}
                    className="px-3 py-2 rounded-lg text-sm font-medium border border-line-strong text-ink/80 hover:border-accent-deep transition-colors flex-shrink-0 press"
                  >
                    This is me
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => to('card')}
                  className="block t-cap text-accent-deep hover:text-accent transition-colors mt-3"
                >
                  Not you? Search again
                </button>
              </section>
            </div>
          )}

          {/* ── 3 · Requested ── */}
          {stage === 'requested' && (
            <div className="step-in-forward">
              <LeagueTitle sub="Join the event" />
              <section className={`p-4 ${cardClass()}`}>
                <LinkHeading>Golf Ireland</LinkHeading>
                <p className="text-ink text-sm font-medium mt-3">
                  {name}<span className="text-ink/65 font-normal"> · {club}</span>
                </p>
                <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                  Waiting for the organiser to confirm it is you.
                </p>
                <p className="t-cap text-ink/65 mt-2">Rounds that count: 18 holes · Saturdays · any course</p>
                <span className="inline-block mt-3 px-3 py-2 rounded-lg text-sm font-medium border border-rust/40 text-rust-deep">
                  Unlink
                </span>
              </section>
              <button type="button" onClick={() => to('organiser')} className={`${buttonClass('primary')} mt-6`}>
                Switch to the organiser
              </button>
            </div>
          )}

          {/* ── 4 · The organiser's side ── */}
          {(stage === 'organiser' || stage === 'syncing') && (
            <div className="step-in-forward">
              <div className="mb-6">
                <h2 className="t-h1 text-ink">Organiser area</h2>
                <p className="text-ink/65 text-sm mt-1">Winter League</p>
              </div>
              <section className={`p-4 ${cardClass()}`}>
                <LinkHeading>Golf Ireland</LinkHeading>
                <p className="t-cap text-ink/65 mt-3">Rounds that count: 18 holes · Saturdays · any course</p>
                <div className="mt-4 px-4 py-3 rounded-tile border border-line">
                  <p className="text-ink text-sm font-medium">{name}</p>
                  <p className="t-cap text-ink/65">Asks to link {name}, {club}</p>
                  {stage === 'organiser' ? (
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => to('syncing', { ms: SYNC_MS, then: 'rounds' })}
                        className="px-3 py-2 rounded-lg text-sm font-medium border border-accent-deep text-accent-deep hover:bg-accent-tint transition-colors press"
                      >
                        It’s them
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNote('The organiser refused the link. Search again, or ask them.'); to('card') }}
                        className="px-3 py-2 rounded-lg text-sm font-medium border border-rust/40 text-rust-deep hover:bg-rust/[0.06] transition-colors press"
                      >
                        Refuse
                      </button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-accent-deep text-[13px] mt-2">
                      <LinkedBadge size={16} /> Confirmed
                    </p>
                  )}
                </div>
              </section>
              {stage === 'syncing' && (
                <p className="flex items-center gap-2 text-ink/80 text-[13px] mt-5">
                  <Spinner /> Reading {name.split(' ')[0]}&apos;s rounds from Golf Ireland…
                </p>
              )}
            </div>
          )}

          {/* ── 5 · The rounds arrive ── */}
          {stage === 'rounds' && (
            <div className="step-in-forward">
              <LeagueTitle sub="Your rounds" />
              <section className={`p-4 ${cardClass()}`}>
                <LinkHeading>Golf Ireland</LinkHeading>
                <p className="flex items-center gap-1.5 text-ink text-sm font-medium mt-3">
                  {name} <LinkedBadge size={16} />
                </p>
                <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                  Linked. Your Golf Ireland cards are read into the league.
                </p>
                <div className="flex flex-col gap-2 mt-4">
                  {ROUNDS.map(r => (
                    <div key={r.day} className="flex items-center justify-between gap-3 px-4 py-3 rounded-tile border border-line">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${r.issue ? 'text-ink/65' : 'text-ink'}`}>{r.day}</p>
                        <p className="t-cap text-ink/65 truncate">{r.issue ?? `${club} · ${r.holes} holes`}</p>
                      </div>
                      <span className={`font-serif font-bold text-lg tabular-nums ${r.issue ? 'text-ink/50' : 'text-accent-deep'}`}>
                        {r.pts}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <button type="button" onClick={() => to('board')} className={`${buttonClass('primary')} mt-6`}>
                See the leaderboard
              </button>
            </div>
          )}

          {/* ── 6 · The board ── */}
          {stage === 'board' && (
            <div className="step-in-forward">
              <LeagueTitle sub="Leaderboard · Stableford · Running total" />
              <div className={`${cardClass()} overflow-hidden`}>
                {[
                  { who: name, pts: 69, linked: true },
                  { who: 'Sam Kelly', pts: 66, linked: true },
                  { who: 'Jo Byrne', pts: 61, linked: false },
                  { who: 'Alex Doyle', pts: 58, linked: true },
                ].map((r, i) => (
                  <div key={r.who} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-line' : ''}`}>
                    <span className="text-[15px] text-ink/65 tabular-nums w-5">{i + 1}</span>
                    <span className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="font-semibold text-[15px] text-ink truncate">{r.who}</span>
                      {r.linked && <LinkedBadge size={15} />}
                    </span>
                    <span className="font-serif font-bold text-lg text-ink tabular-nums">{r.pts}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={close} className={`${buttonClass('primary')} mt-6`}>
                Done
              </button>
              <button type="button" onClick={() => to('card')} className={`${buttonClass('quiet')} w-full mt-2`}>
                Start again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
