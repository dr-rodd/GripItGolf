'use client'

/**
 * The creation wizard's Format step (Ross, 13 Nov 2026, D77–D90): the
 * rounds with a format each — Round 1's own, the rest "Same as Round 1"
 * until changed — and the read-back card naming the leaderboard the
 * platform chose and why (lib/eventShape.ts). Also the Overall's ranking and
 * feeds, which the organiser area's Session formats page shares. Components
 * only — every rule is lib/sessions.ts's and lib/eventShape.ts's.
 */

import { useState } from 'react'
import {
  type SessionDraft, type SessionFormat, type MatchFormat, type OverallRanks, type SessionFeed,
  MATCH_FORMATS, MATCHES_READY, OVERALL_RANKS, MAX_SESSION_NAME, MAX_SESSIONS, STROKE_FORMAT,
  describeFormat, describeFeed, resolvedFormats, usedFormats, sameFormat, sessionLabel, formatSentence,
  defaultMatchAllowance, defaultPositionPoints, DEFAULT_MATCH_FEED, formatPoints,
  defaultMatchSlots, MAX_MATCH_SLOTS, MATCH_TIES,
} from '@/lib/sessions'
import { type RoundUnit, unitLabel } from '@/lib/eventShape'
import { inkOn, setApart } from '@/lib/matchSides'
import Toggle from '@/app/components/Toggle'
import { Stepper } from '@/app/components/ItineraryForms'
import { SCORINGS, TEAM_FORMATS, type Audience, type Scoring, type TeamFormat } from '@/lib/leaderboards'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass, optionClass, Pill } from '@/app/components/ui'

// ─── A session's format ────────────────────────────────────────

const STROKE_DEFAULT: SessionFormat = STROKE_FORMAT

/** The leaderboard form's format questions only — no total-or-position, no discard, no overall tie. */
export function FormatPicker({ value, onChange, idle = false, allowMatches = true }: {
  value: SessionFormat
  onChange: (f: SessionFormat) => void
  /** Nothing shown as chosen — a tile above is the answer until one here is given. */
  idle?: boolean
  /** A league of periods hands in cards, never matches. */
  allowMatches?: boolean
}) {
  const kind = idle ? null : value.kind
  return (
    <div className="space-y-4">
      {allowMatches && <div>
        <p className={FIELD_LABEL}>How is it played?</p>
        <div className="flex gap-2">
          <button type="button" className={`${chipClass(kind === 'stroke')} flex-1`}
            onClick={() => kind !== 'stroke' && onChange(value.kind === 'stroke' ? value : STROKE_DEFAULT)}>
            Stroke play
          </button>
          <button type="button" className={`${chipClass(kind === 'matches')} flex-1`}
            disabled={!MATCHES_READY}
            onClick={() => kind !== 'matches' && onChange(value.kind === 'matches' ? value : { kind: 'matches', match: 'singles' })}>
            Matches
          </button>
        </div>
        {!MATCHES_READY && (
          <p className="t-cap text-ink/65 mt-2"><Pill>Coming soon</Pill> Matches — singles and fourball, worth points each.</p>
        )}
      </div>}

      {value.kind === 'stroke' && (
        <>
          <div>
            <p className={FIELD_LABEL}>Who is ranked?</p>
            <div className="flex gap-2">
              {(['individual', 'team'] as Audience[]).map(a => (
                <button key={a} type="button" className={`${chipClass(!idle && value.audience === a)} flex-1`}
                  onClick={() => onChange({
                    ...value, audience: a,
                    scoring: a === 'team' && value.scoring === 'quota' ? 'stableford' : value.scoring,
                    teamFormat: a === 'team' ? value.teamFormat ?? 'better_ball' : undefined,
                  })}>
                  {a === 'individual' ? 'Solo' : 'Teams'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={FIELD_LABEL}>Scoring</p>
            <div className="flex gap-2 flex-wrap">
              {SCORINGS.filter(s => s.key !== 'quota' || value.audience === 'individual').map(s => (
                <button key={s.key} type="button" className={chipClass(!idle && value.scoring === s.key)}
                  onClick={() => onChange({ ...value, scoring: s.key as Scoring })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {value.audience === 'team' && (
            <div>
              <p className={FIELD_LABEL}>How a team&apos;s scores count</p>
              <div className="space-y-2">
                {TEAM_FORMATS.map(t => (
                  <button key={t.key} type="button" className={optionClass(!idle && value.teamFormat === t.key)}
                    // Foursomes plays off half the pair's combined handicaps (D88).
                    onClick={() => onChange({
                      ...value, teamFormat: t.key as TeamFormat,
                      handicapAllowance: t.key === 'foursomes' ? 50
                        : value.teamFormat === 'foursomes' ? undefined : value.handicapAllowance,
                    })}>
                    <p className="text-ink text-[15px] font-medium">{t.label}</p>
                    <p className="t-cap text-ink/65 mt-0.5">{t.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {value.audience === 'team' && (value.teamFormat ?? 'better_ball') === 'better_ball' && (
            <div>
              <p className={FIELD_LABEL}>Scores that count on each hole</p>
              <div className="flex gap-2">
                {[1, 2, 3].map(n => (
                  <button key={n} type="button"
                    className={`${chipClass(!idle && (value.countingScores ?? 2) === n)} flex-1`}
                    onClick={() => onChange({ ...value, countingScores: n })}>
                    {n === 1 ? 'Best ball' : `Best ${n}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {value.kind === 'matches' && (
        <div>
          <p className={FIELD_LABEL}>Which matches?</p>
          <div className="space-y-2">
            {MATCH_FORMATS.map(m => (
              <button key={m.key} type="button" disabled={!m.available}
                className={`${optionClass(!idle && value.match === m.key)} disabled:opacity-60 disabled:cursor-not-allowed`}
                onClick={() => onChange({ kind: 'matches', match: m.key as MatchFormat })}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-ink text-[15px] font-medium">{m.label}</span>
                  {!m.available && <Pill>Coming soon</Pill>}
                </span>
                <span className="block t-cap text-ink/65 mt-0.5">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* What the answer means, in a sentence, the moment it is tapped (Ross, 13 Nov 2026). */}
      {!idle && <p className={`t-cap text-ink/80 leading-snug px-3 py-2.5 ${cardClass('flat')}`}>{formatSentence(value)}</p>}

      {/* How a tied match is finished — the one thing a Matches format asks
          beyond its kind; what a match is worth stays a point (Ross, 13 Nov 2026). */}
      {value.kind === 'matches' && (
        <div>
          <p className={FIELD_LABEL}>How is a tied match finished?</p>
          <div className="space-y-2">
            {MATCH_TIES.map(t => (
              <button key={t.key} type="button" aria-pressed={!idle && (value.tie ?? 'half') === t.key}
                className={optionClass(!idle && (value.tie ?? 'half') === t.key)}
                onClick={() => onChange({ ...value, tie: t.key })}>
                <p className="text-ink text-[15px] font-medium">{t.label}</p>
                <p className="t-cap text-ink/65 mt-0.5">{t.hint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={FIELD_LABEL}>Handicap allowance</label>
        <div className="flex items-center gap-2">
          <PercentField
            value={value.handicapAllowance ?? (value.kind === 'matches' ? defaultMatchAllowance(value.match) : 100)}
            onChange={n => onChange({ ...value, handicapAllowance: n })}
            label="Handicap allowance, percent"
          />
          <span className="text-ink/65 text-sm">{value.kind === 'stroke' && value.audience === 'team' && value.teamFormat === 'foursomes'
            ? '% of the pair’s combined course handicaps' : '% of each player’s course handicap'}</span>
        </div>
      </div>
    </div>
  )
}

// ─── A percentage box ──────────────────────────────────────────

/**
 * A handicap allowance typed in (Ross, 13 Nov 2026): the box may be
 * emptied while typing — clearing 100 and typing 90 reads 90, never "090" —
 * and only a whole number from 1 to 100 is handed on. Left empty, it goes
 * back to the last figure given.
 */
function PercentField({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  // Shown as typed while the box has the finger; the figure itself otherwise.
  const shown = focused ? text : String(value)
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={3}
      className={`${FIELD} w-24`}
      value={shown}
      onFocus={() => { setText(String(value)); setFocused(true) }}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 3)
        setText(digits)
        const n = Number(digits)
        if (digits && n >= 1 && n <= 100) onChange(n)
      }}
      onBlur={() => setFocused(false)}
      aria-label={label}
    />
  )
}

// ─── The rounds ────────────────────────────────────────────────

/**
 * The Format step's rounds (D77): Round 1 asks its format; every round after
 * starts as "Same as Round 1" and shows a Change format button, which opens
 * the formats already used, a new one, or Format TBC. A one-round event is
 * one card. The words are the rule's — rounds on a league, sessions on an
 * Overall (lib/eventShape.ts).
 */
export function RoundList({
  rounds, onChange, unit, days, dateOf, canAdd, sameVenue, onSameVenue, renderVenue, allowTbc,
  allowMatches = true, fieldSize = 0, venueOf, single = false, singleTitle, nameable = true,
}: {
  /** Whether a round's name can be kept — a trip keeps only a session's. */
  nameable?: boolean
  /**
   * A single event: one card, titled with the event's own name rather than
   * "Round 1" (Ross, 13 Nov 2026 — a one-round event has no rounds to
   * number), no name to give it and nothing to add.
   */
  single?: boolean
  /** The single event's title — the name the organiser gave the event. */
  singleTitle?: string
  /**
   * The rounds' venues are already set — a trip's, by its itinerary — and
   * shown as a line rather than asked. Absent, each round asks its venue.
   */
  venueOf?: (r: SessionDraft) => string | null
  rounds: SessionDraft[]
  onChange: (next: SessionDraft[]) => void
  unit: RoundUnit
  /** The event's playing days, as index and label — a round's day is asked only where rounds may be added. */
  days: { index: number; label: string }[]
  /** A round's date line — "Sat 5 Jun" — or null. */
  dateOf: (r: SessionDraft) => string | null
  /** More than one round on a day (a standalone event's two sessions). */
  canAdd: boolean
  sameVenue: boolean
  onSameVenue: (on: boolean) => void
  renderVenue: (value: string, onChange: (id: string) => void, allowTbc: boolean) => React.ReactNode
  /** A venue may be left to be confirmed (a league's series). */
  allowTbc: boolean
  allowMatches?: boolean
  fieldSize?: number
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const formats = resolvedFormats(rounds)
  const used = usedFormats(rounds)
  const first = formats[0]
  const firstLabel = unitLabel(unit, 1, rounds[0]?.name)
  const set = (i: number, patch: Partial<SessionDraft>) =>
    onChange(rounds.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  // Several rounds are named the way a session is: the name given, else the number.
  const labelOf = (r: SessionDraft, i: number) => (single ? singleTitle?.trim() || 'Your event' : unitLabel(unit, i + 1, r.name))
  const perDay = (day: number) => rounds.filter(r => r.dayIndex === day).length
  const add = () => {
    const last = rounds.at(-1)
    onChange([...rounds, {
      key: `r-${Date.now().toString(36)}-${rounds.length}`,
      dayIndex: last?.dayIndex ?? days[0]?.index ?? 0,
      courseId: last?.courseId ?? '',
      format: 'same',
    }])
  }

  return (
    <div className="space-y-4">
      {rounds.length > 1 && !venueOf && (
        <div className={`flex items-start justify-between gap-4 p-4 ${cardClass()}`}>
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium">Same venue every {unit.toLowerCase()}</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
              {sameVenue ? `Pick it once, on ${firstLabel}.` : `Each ${unit.toLowerCase()} picks its own.`}
            </p>
          </div>
          <Toggle checked={sameVenue} onChange={onSameVenue} label="Same venue throughout" />
        </div>
      )}

      {rounds.map((r, i) => {
        const format = formats[i]
        const isFirst = i === 0
        const label = labelOf(r, i)
        const date = dateOf(r)
        const changing = r.format !== 'same' || open.has(r.key)
        return (
          <div key={r.key} className={`p-4 ${cardClass()}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="t-card text-ink min-w-0 truncate">
                {label}{date ? <span className="t-cap text-ink/65"> · {date}</span> : null}
              </p>
              {canAdd && !isFirst && perDay(r.dayIndex) > 1 && (
                <button type="button" className={buttonClass('quiet', false, true)}
                  onClick={() => onChange(rounds.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${label}`}>
                  Remove
                </button>
              )}
            </div>

            <div className="mt-3 space-y-4">
              {!single && nameable && (
                <div>
                  <label className={FIELD_LABEL}>Name (optional)</label>
                  <input
                    type="text"
                    className={FIELD}
                    value={r.name ?? ''}
                    maxLength={MAX_SESSION_NAME}
                    placeholder={unit === 'Session' ? `Session ${i + 1}, or e.g. Friday foursomes` : `Round ${i + 1}, or e.g. Saturday medal`}
                    onChange={e => set(i, { name: e.target.value })}
                  />
                </div>
              )}

              {canAdd && days.length > 1 && (
                <div>
                  <label className={FIELD_LABEL}>Day</label>
                  <select
                    className={FIELD}
                    value={r.dayIndex}
                    onChange={e => set(i, { dayIndex: Number(e.target.value) })}
                  >
                    {days.map(d => <option key={d.index} value={d.index}>{d.label}</option>)}
                  </select>
                </div>
              )}

              {venueOf && venueOf(r) && <p className="t-cap text-ink/65 -mt-2">{venueOf(r)}</p>}
              {!venueOf && (isFirst || !sameVenue) && (
                <div>
                  <label className={FIELD_LABEL}>{isFirst && sameVenue && rounds.length > 1 ? `Venue, every ${unit.toLowerCase()}` : 'Venue'}</label>
                  {renderVenue(r.courseId, id => set(i, { courseId: id }), allowTbc)}
                </div>
              )}

              <div>
                <label className={FIELD_LABEL}>Format</label>
                {isFirst ? (
                  <FormatPicker
                    value={r.format === 'same' || r.format === 'tbc' ? STROKE_FORMAT : r.format}
                    onChange={f => set(i, { format: f })}
                    allowMatches={allowMatches}
                  />
                ) : !changing ? (
                  <div className={`p-3 ${cardClass('flat')}`}>
                    <p className="text-ink text-[15px] font-medium">Same as {firstLabel}</p>
                    <p className="t-cap text-ink/65 mt-0.5">{describeFormat(format)}</p>
                    <button type="button" className={`${buttonClass('secondary', false, true)} mt-3`}
                      onClick={() => setOpen(prev => new Set(prev).add(r.key))}>
                      Change format
                    </button>
                  </div>
                ) : (
                  <>
                    {/* The formats already used, as tiles to tap — Round 1's
                        first — and TBC; a new format is the questions
                        underneath, which this round takes the moment one is
                        answered (Ross, 9 Nov 2026). */}
                    <div className="space-y-2">
                      <button type="button" className={optionClass(r.format === 'same')}
                        aria-pressed={r.format === 'same'}
                        onClick={() => set(i, { format: 'same', allowance: undefined })}>
                        <p className="text-ink text-[15px] font-medium">Same as {firstLabel}</p>
                        <p className="t-cap text-ink/65 mt-0.5">{describeFormat(first)}</p>
                      </button>
                      {r.format === 'same' && first && (
                        // D86: the same format off another allowance is still the same format.
                        <div className="flex items-center gap-2 pl-1">
                          <PercentField
                            value={r.allowance ?? first.handicapAllowance ?? (first.kind === 'matches' ? defaultMatchAllowance(first.match) : 100)}
                            onChange={n => set(i, { allowance: n })}
                            label={`Handicap allowance for ${label}, percent`}
                          />
                          <span className="text-ink/65 text-sm">% handicap for this {unit.toLowerCase()}</span>
                        </div>
                      )}
                      {used.filter(f => !sameFormat(f, first)).map(f => {
                        const on = r.format !== 'same' && r.format !== 'tbc' && sameFormat(f, format)
                        return (
                          <button key={describeFormat(f)} type="button" className={optionClass(on)}
                            aria-pressed={on} onClick={() => set(i, { format: f, allowance: undefined })}>
                            <p className="text-ink text-[15px] font-medium">{describeFormat(f)}</p>
                          </button>
                        )
                      })}
                      <button type="button" className={optionClass(r.format === 'tbc')}
                        aria-pressed={r.format === 'tbc'}
                        onClick={() => set(i, { format: 'tbc', allowance: undefined })}>
                        <p className="text-ink text-[15px] font-medium">Format TBC</p>
                        <p className="t-cap text-ink/65 mt-0.5">Counts nothing until it is set in the organiser area.</p>
                      </button>
                    </div>
                    <div className={`mt-3 p-3 ${cardClass('flat')}`}>
                      <p className="t-label text-ink mb-3">Or a new format</p>
                      <FormatPicker
                        // Unanswered while a tile is chosen: any answer here
                        // is this round's new format, started from the one
                        // it was playing.
                        idle={r.format === 'same' || r.format === 'tbc' || formats.slice(0, i).some(f => sameFormat(f, format))}
                        value={r.format !== 'same' && r.format !== 'tbc' ? r.format : (format ?? first ?? STROKE_FORMAT)}
                        // An answer that lands on Round 1's format is that tile.
                        onChange={f => set(i, { format: sameFormat(f, first) ? 'same' : f, allowance: undefined })}
                        allowMatches={allowMatches}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* A Matches session's slots: the order of play's rows and
                  the points the Overall's ticker counts (Ross, 9 Nov 2026). */}
              {format?.kind === 'matches' && (
                <Stepper
                  label="How many matches?"
                  value={r.matches ?? defaultMatchSlots(fieldSize, format.match)}
                  min={1}
                  max={MAX_MATCH_SLOTS}
                  unit={n => (n === 1 ? 'match' : 'matches')}
                  onChange={n => set(i, { matches: n })}
                />
              )}
            </div>
          </div>
        )
      })}

      {canAdd && !single && rounds.length < MAX_SESSIONS && (
        <button type="button" className={buttonClass('secondary')} onClick={add}>
          + Add another {unit.toLowerCase()}
        </button>
      )}
    </div>
  )
}

// ─── The read-back ─────────────────────────────────────────────

/**
 * The card at the foot of the Format step (D77): the leaderboard the
 * platform chose, why, and its facts — then whatever the shape asks next
 * (the Overall's ranking, a secondary leaderboard).
 */
export function ReadBack({ title, sentence, facts, children }: {
  title: string
  sentence: string
  facts: string[]
  children?: React.ReactNode
}) {
  return (
    <div className={`p-4 ${cardClass('raised')}`}>
      <p className="t-card text-ink">{title}</p>
      <p className="t-body text-ink/65 mt-1">{sentence}</p>
      {facts.length > 0 && <p className="t-label text-ink/65 mt-2">{facts.join(' · ')}</p>}
      {children}
    </div>
  )
}

/** Two tags facing off, in their own colours — the ticker's two ends (D50). */
export function FaceOffTags({ tags }: { tags: { name: string; colour: string }[] }) {
  const [a, b] = tags
  if (!a || !b) return null
  const [ca, cb] = setApart(a.colour, b.colour)
  return (
    <div className="flex items-center gap-2 mt-3">
      <span className="t-label px-3 py-1.5 rounded-tile min-w-0 truncate" style={{ background: ca, color: inkOn(ca) }}>{a.name}</span>
      <span className="t-cap text-ink/65">vs</span>
      <span className="t-label px-3 py-1.5 rounded-tile min-w-0 truncate" style={{ background: cb, color: inkOn(cb) }}>{b.name}</span>
    </div>
  )
}

// ─── Finalising the Overall ────────────────────────────────────

export function OverallSetup({ sessions, ranks, onRanks, feeds, onFeeds, tagsOn, entrants }: {
  sessions: SessionDraft[]
  ranks: OverallRanks
  onRanks: (r: OverallRanks) => void
  /** Session key → feed. Absent is the format's default. */
  feeds: Record<string, SessionFeed>
  onFeeds: (next: Record<string, SessionFeed>) => void
  tagsOn: boolean
  /** How many entrants the Overall ranks — the default points table's length. */
  entrants: number
}) {
  const formats = resolvedFormats(sessions)
  const feedOf = (key: string, i: number): SessionFeed => {
    const f = formats[i]
    if (!f) return { kind: 'none' }
    const stored = feeds[key]
    const matches = f.kind === 'matches'
    if (stored && (stored.kind === 'none' || (matches ? stored.kind === 'match' : stored.kind === 'position'))) return stored
    return matches ? DEFAULT_MATCH_FEED : { kind: 'position', points: defaultPositionPoints(entrants) }
  }
  const setFeed = (key: string, feed: SessionFeed) => onFeeds({ ...feeds, [key]: feed })

  return (
    <div className="space-y-6">
      <div>
        <p className={FIELD_LABEL}>Who does the Overall rank?</p>
        <div className="space-y-2">
          {OVERALL_RANKS.filter(o => o.key !== 'tags' || tagsOn).map(o => (
            <button key={o.key} type="button" className={optionClass(ranks === o.key)} onClick={() => onRanks(o.key)}>
              <p className="text-ink text-[15px] font-medium">{o.label}</p>
              <p className="t-cap text-ink/65 mt-0.5">{o.hint}</p>
            </button>
          ))}
        </div>
        {!tagsOn && (
          <p className="t-cap text-ink/65 mt-2 leading-snug">
            To rank tags, like Europe and USA, turn on Enable tags in the field step.
          </p>
        )}
      </div>

      <div>
        <p className={FIELD_LABEL}>How each session feeds it</p>
        <div className="space-y-3">
          {sessions.map((s, i) => {
            const f = formats[i]
            const feed = feedOf(s.key, i)
            return (
              <div key={s.key} className={`p-4 ${cardClass()}`}>
                <p className="t-card text-ink">{sessionLabel(s, i)}</p>
                <p className="t-cap text-ink/65 mt-0.5">{describeFormat(f)}</p>
                <FeedEditor
                  format={f}
                  feed={feed}
                  entrants={entrants}
                  label={sessionLabel(s, i)}
                  onChange={next => setFeed(s.key, next)}
                  askMatchPoints={false}
                />
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

/** How one session feeds the Overall — counts or not, and what it pays. */
export function FeedEditor({ format, feed, entrants, label, onChange, askMatchPoints = true }: {
  /**
   * Whether a Matches session's points are asked. Creation does not (Ross,
   * 13 Nov 2026: a match is a point, a half half — how a tie is finished is
   * the question); the organiser's Formats page still can.
   */
  askMatchPoints?: boolean
  format: SessionFormat | null
  feed: SessionFeed
  entrants: number
  label: string
  onChange: (next: SessionFeed) => void
}) {
  if (!format) {
    return <p className="text-ink/65 text-[13px] mt-2 leading-snug">Format TBC — counts nothing until its format is set.</p>
  }
  return (
    <>
      <div className="flex gap-2 mt-3">
        <button type="button" className={`${chipClass(feed.kind !== 'none')} flex-1`}
          onClick={() => feed.kind === 'none' && onChange(format.kind === 'matches'
            ? DEFAULT_MATCH_FEED : { kind: 'position', points: defaultPositionPoints(entrants) })}>
          Counts
        </button>
        <button type="button" className={`${chipClass(feed.kind === 'none')} flex-1`}
          onClick={() => onChange({ kind: 'none' })}>
          Doesn&apos;t count
        </button>
      </div>
      {feed.kind === 'match' && askMatchPoints && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {(['win', 'half', 'loss'] as const).map(k => (
            <label key={k} className="block">
              <span className="t-cap text-ink/65">{k === 'win' ? 'Win' : k === 'half' ? 'Half' : 'Loss'}</span>
              <input
                type="number" inputMode="decimal" step={0.5} min={0} max={100}
                className={`${FIELD} mt-1`}
                value={feed[k]}
                onChange={e => onChange({ ...feed, [k]: Math.max(0, Math.round((Number(e.target.value) || 0) * 2) / 2) })}
              />
            </label>
          ))}
        </div>
      )}
      {feed.kind === 'position' && (
        <div className="mt-3">
          <span className="t-cap text-ink/65">Points for 1st, 2nd, 3rd…</span>
          <input
            type="text"
            inputMode="numeric"
            className={`${FIELD} mt-1`}
            defaultValue={feed.points.map(formatPoints).join(', ')}
            onBlur={e => {
              const points = e.target.value.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n >= 0).slice(0, 64)
              if (points.length > 0) onChange({ kind: 'position', points })
            }}
            aria-label={`Points by position for ${label}`}
          />
        </div>
      )}
      <p className="t-cap text-ink/65 mt-2">{describeFeed(feed)}</p>
    </>
  )
}
