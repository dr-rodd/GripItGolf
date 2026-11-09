'use client'

/**
 * The Dynamic Overall Leaderboard's creation steps (Ross, 9 Nov 2026;
 * docs/sessions-plan.md, D35–D43): the question, the running order of
 * sessions with a format each, and finalising the Overall. Components only —
 * every rule is lib/sessions.ts's.
 */

import { useState } from 'react'
import {
  type SessionDraft, type SessionFormat, type MatchFormat, type OverallRanks, type SessionFeed,
  MATCH_FORMATS, MATCHES_READY, OVERALL_RANKS, MAX_SESSION_NAME, MAX_SESSIONS,
  describeFormat, describeFeed, resolvedFormats, usedFormats, sameFormat, sessionLabel,
  defaultMatchAllowance, defaultPositionPoints, DEFAULT_MATCH_FEED, allOneFormat, formatPoints,
} from '@/lib/sessions'
import { SCORINGS, TEAM_FORMATS, type Audience, type Scoring, type TeamFormat } from '@/lib/leaderboards'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass, optionClass, Pill } from '@/app/components/ui'

// ─── The question ──────────────────────────────────────────────

/** "Enable Dynamic Overall Leaderboard?" — No (the default) or Yes, as option cards. */
export function DynamicQuestion({ value, onChange, sessionCount, onConfirmOff }: {
  value: boolean | null
  onChange: (on: boolean) => void
  /** Sessions already set — turning it off then asks first. */
  sessionCount: number
  onConfirmOff: () => void
}) {
  const [asking, setAsking] = useState(false)
  const choose = (on: boolean) => {
    if (!on && value === true && sessionCount > 0) { setAsking(true); return }
    setAsking(false)
    onChange(on)
  }
  return (
    <div className="space-y-3">
      {[
        { on: false, label: 'No', hint: 'Every round counts by the same rules. Pick the leaderboards as usual.' },
        { on: true, label: 'Yes', hint: 'Each round is a session with its own format, feeding one overall leaderboard. Like the Ryder Cup.' },
      ].map(o => (
        <button
          key={o.label}
          type="button"
          onClick={() => choose(o.on)}
          aria-pressed={value === o.on}
          className={optionClass(value === o.on)}
        >
          <p className="t-card text-ink">{o.label}</p>
          <p className="t-cap text-ink/65 mt-0.5">{o.hint}</p>
        </button>
      ))}
      {asking && (
        <div className={`p-4 ${cardClass('flat')}`}>
          <p className="text-ink text-sm font-medium">Turn the Dynamic Overall Leaderboard off?</p>
          <p className="text-ink/65 text-[13px] mt-1 leading-snug">
            Each day keeps its first session&apos;s venue as a plain round. The {sessionCount} session
            {sessionCount === 1 ? '' : 's'} and their formats are kept here, so turning it back on brings them back.
          </p>
          <div className="flex gap-2 mt-3">
            <button type="button" className={buttonClass('secondary', false, true)} onClick={() => setAsking(false)}>
              Keep it on
            </button>
            <button type="button" className={buttonClass('primary', false, true)}
              onClick={() => { setAsking(false); onConfirmOff(); onChange(false) }}>
              Turn it off
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── A session's format ────────────────────────────────────────

const STROKE_DEFAULT: SessionFormat = { kind: 'stroke', audience: 'individual', scoring: 'stableford' }

/** The leaderboard form's format questions only — no total-or-position, no discard, no overall tie. */
export function FormatPicker({ value, onChange }: {
  value: SessionFormat
  onChange: (f: SessionFormat) => void
}) {
  const kind = value.kind
  return (
    <div className="space-y-4">
      <div>
        <p className={FIELD_LABEL}>How is it played?</p>
        <div className="flex gap-2">
          <button type="button" className={`${chipClass(kind === 'stroke')} flex-1`}
            onClick={() => kind !== 'stroke' && onChange(STROKE_DEFAULT)}>
            Stroke play
          </button>
          <button type="button" className={`${chipClass(kind === 'matches')} flex-1`}
            disabled={!MATCHES_READY}
            onClick={() => kind !== 'matches' && onChange({ kind: 'matches', match: 'singles' })}>
            Matches
          </button>
        </div>
        {!MATCHES_READY && (
          <p className="t-cap text-ink/65 mt-2"><Pill>Coming soon</Pill> Matches — singles and fourball, worth points each.</p>
        )}
      </div>

      {value.kind === 'stroke' && (
        <>
          <div>
            <p className={FIELD_LABEL}>Who is ranked?</p>
            <div className="flex gap-2">
              {(['individual', 'team'] as Audience[]).map(a => (
                <button key={a} type="button" className={`${chipClass(value.audience === a)} flex-1`}
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
                <button key={s.key} type="button" className={chipClass(value.scoring === s.key)}
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
                  <button key={t.key} type="button" className={optionClass(value.teamFormat === t.key)}
                    onClick={() => onChange({ ...value, teamFormat: t.key as TeamFormat })}>
                    <p className="text-ink text-[15px] font-medium">{t.label}</p>
                    <p className="t-cap text-ink/65 mt-0.5">{t.hint}</p>
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
                className={`${optionClass(value.match === m.key)} disabled:opacity-60 disabled:cursor-not-allowed`}
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

      <div>
        <label className={FIELD_LABEL}>Handicap allowance</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className={`${FIELD} w-24`}
            value={value.handicapAllowance ?? (value.kind === 'matches' ? defaultMatchAllowance(value.match) : 100)}
            onChange={e => {
              const n = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)))
              onChange({ ...value, handicapAllowance: n })
            }}
            aria-label="Handicap allowance, percent"
          />
          <span className="text-ink/65 text-sm">% of each player&apos;s course handicap</span>
        </div>
      </div>
    </div>
  )
}

// ─── The running order ─────────────────────────────────────────

export function SessionList({ sessions, onChange, days, renderVenue }: {
  sessions: SessionDraft[]
  onChange: (next: SessionDraft[]) => void
  /** The event's playing days, as index and label — one means no day picker. */
  days: { index: number; label: string }[]
  renderVenue: (value: string, onChange: (id: string) => void) => React.ReactNode
}) {
  const [changing, setChanging] = useState<string | null>(null)
  const formats = resolvedFormats(sessions)
  const used = usedFormats(sessions)
  const set = (i: number, patch: Partial<SessionDraft>) =>
    onChange(sessions.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const add = () => {
    const last = sessions.at(-1)
    onChange([...sessions, {
      key: `s-${Date.now().toString(36)}-${sessions.length}`,
      dayIndex: last?.dayIndex ?? days[0]?.index ?? 0,
      courseId: last?.courseId ?? '',
      format: sessions.length === 0 ? STROKE_DEFAULT : 'same',
    }])
  }
  const allSame = allOneFormat(sessions)

  return (
    <div className="space-y-4">
      {sessions.map((s, i) => {
        const format = formats[i]
        const isFirst = i === 0
        const open = changing === s.key
        return (
          <div key={s.key} className={`p-4 ${cardClass()}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="t-card text-ink min-w-0 truncate">{sessionLabel(s, i)}</p>
              {!isFirst && (
                <button type="button" className={buttonClass('quiet', false, true)}
                  onClick={() => onChange(sessions.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${sessionLabel(s, i)}`}>
                  Remove
                </button>
              )}
            </div>

            <div className="mt-3 space-y-4">
              <div>
                <label className={FIELD_LABEL}>Name (optional)</label>
                <input
                  type="text"
                  className={FIELD}
                  value={s.name ?? ''}
                  maxLength={MAX_SESSION_NAME}
                  placeholder={`Session ${i + 1}, or e.g. Friday foursomes`}
                  onChange={e => set(i, { name: e.target.value })}
                />
              </div>

              {days.length > 1 && (
                <div>
                  <label className={FIELD_LABEL}>Day</label>
                  <select
                    className={FIELD}
                    value={s.dayIndex}
                    onChange={e => set(i, { dayIndex: Number(e.target.value) })}
                  >
                    {days.map(d => <option key={d.index} value={d.index}>{d.label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className={FIELD_LABEL}>Venue</label>
                {renderVenue(s.courseId, id => set(i, { courseId: id }))}
              </div>

              <div>
                <label className={FIELD_LABEL}>Format</label>
                {isFirst ? (
                  <FormatPicker
                    value={s.format === 'same' || s.format === 'tbc' ? STROKE_DEFAULT : s.format}
                    onChange={f => set(i, { format: f })}
                  />
                ) : (
                  <>
                    <p className="text-ink text-[15px]">
                      {s.format === 'same' ? 'Same as Session 1' : s.format === 'tbc' ? 'Format TBC' : 'Its own format'}
                    </p>
                    <p className="t-cap text-ink/65 mt-0.5">
                      {s.format === 'tbc' ? 'Counts nothing until its format is set.' : describeFormat(format)}
                    </p>
                    {!open ? (
                      <button type="button" className={`${buttonClass('secondary', false)} mt-3`} onClick={() => setChanging(s.key)}>
                        Change format
                      </button>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <button type="button" className={optionClass(s.format === 'same')}
                          onClick={() => { set(i, { format: 'same' }); setChanging(null) }}>
                          <p className="text-ink text-[15px] font-medium">Same as Session 1</p>
                          <p className="t-cap text-ink/65 mt-0.5">{describeFormat(formats[0])}</p>
                        </button>
                        {used.filter(f => !sameFormat(f, formats[0])).map(f => (
                          <button key={describeFormat(f)} type="button"
                            className={optionClass(s.format !== 'same' && s.format !== 'tbc' && sameFormat(f, format))}
                            onClick={() => { set(i, { format: f }); setChanging(null) }}>
                            <p className="text-ink text-[15px] font-medium">{describeFormat(f)}</p>
                          </button>
                        ))}
                        <button type="button" className={optionClass(s.format === 'tbc')}
                          onClick={() => { set(i, { format: 'tbc' }); setChanging(null) }}>
                          <p className="text-ink text-[15px] font-medium">Format TBC</p>
                          <p className="t-cap text-ink/65 mt-0.5">Set it later in the organiser area.</p>
                        </button>
                        <div className={`p-3 ${cardClass('flat')}`}>
                          <p className="t-label text-ink mb-3">A new format</p>
                          <FormatPicker
                            value={s.format !== 'same' && s.format !== 'tbc' ? s.format : (format ?? STROKE_DEFAULT)}
                            onChange={f => set(i, { format: f })}
                          />
                          <button type="button" className={`${buttonClass('secondary', false, true)} mt-3`} onClick={() => setChanging(null)}>
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {sessions.length < MAX_SESSIONS && (
        <button type="button" className={buttonClass('secondary')} onClick={add}>
          + Add a session
        </button>
      )}

      {allSame && (
        <p className="t-cap text-ink/65 leading-snug">
          Every session plays {describeFormat(allSame)}, so a normal leaderboard would do this. Go back and answer No if you&apos;d rather.
        </p>
      )}
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
  const allSame = allOneFormat(sessions)
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
                {!f ? (
                  <p className="text-ink/65 text-[13px] mt-2 leading-snug">Counts nothing until its format is set.</p>
                ) : (
                  <>
                    <div className="flex gap-2 mt-3">
                      <button type="button" className={`${chipClass(feed.kind !== 'none')} flex-1`}
                        onClick={() => feed.kind === 'none' && setFeed(s.key, f.kind === 'matches'
                          ? DEFAULT_MATCH_FEED : { kind: 'position', points: defaultPositionPoints(entrants) })}>
                        Counts
                      </button>
                      <button type="button" className={`${chipClass(feed.kind === 'none')} flex-1`}
                        onClick={() => setFeed(s.key, { kind: 'none' })}>
                        Doesn&apos;t count
                      </button>
                    </div>
                    {feed.kind === 'match' && (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {(['win', 'half', 'loss'] as const).map(k => (
                          <label key={k} className="block">
                            <span className="t-cap text-ink/65">{k === 'win' ? 'Win' : k === 'half' ? 'Half' : 'Loss'}</span>
                            <input
                              type="number" inputMode="decimal" step={0.5} min={0} max={100}
                              className={`${FIELD} mt-1`}
                              value={feed[k]}
                              onChange={e => setFeed(s.key, { ...feed, [k]: Math.max(0, Math.round((Number(e.target.value) || 0) * 2) / 2) })}
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
                            if (points.length > 0) setFeed(s.key, { kind: 'position', points })
                          }}
                          aria-label={`Points by position for ${sessionLabel(s, i)}`}
                        />
                      </div>
                    )}
                    <p className="t-cap text-ink/65 mt-2">{describeFeed(feed)}</p>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {allSame && (
        <p className="t-cap text-ink/65 leading-snug">
          Every session plays {describeFormat(allSame)}, so a normal leaderboard would do this. It&apos;s only a hint.
        </p>
      )}
    </div>
  )
}
