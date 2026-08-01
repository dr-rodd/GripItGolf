'use client'

import { useState } from 'react'
import {
  type Leaderboard, type Audience,
  SCORINGS, TEAM_FORMATS, COMBINES, MAX_DISCARD,
  unanswered, isComplete, offersDiscard, slotKey, isSlotFree,
  freeScorings, freeTeamFormats,
  hasMatchplay, canAddMore, boardTitle, boardRules,
} from '@/lib/leaderboards'
import { defaultCustomPoints, resolveCustomPoints, clampPoints, MAX_CUSTOM_POINTS } from '@/lib/customPoints'
import { IconTrophy, IconPlus, IconX, IconCheck } from './icons'
import { Card, Badge, buttonClass, FIELD, FIELD_LABEL } from './ui'

/**
 * Choosing what a trip plays for.
 *
 * One question at a time, each answer opening the next — the form fills
 * itself in as the organiser goes. A board cannot be saved half-answered,
 * because the scoring module has to be handed complete rules or nothing.
 *
 * The first board made is the primary and is required. "Add another" appears
 * underneath from the start so it is clear more is possible, but stays
 * disabled until the primary is finished.
 *
 * Adding a second board offers the same cascade with whatever is already
 * running shown as taken.
 */

const CHOICE =
  'w-full text-left px-4 py-3.5 rounded-xl border transition-colors duration-150 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed'

function Choice({
  on, label, hint, taken = false, disabled = false, onClick,
}: {
  on: boolean
  label: string
  hint?: string
  taken?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || taken}
      className={`${CHOICE} ${
        on ? 'border-accent bg-accent/[0.08]' : 'border-bark/25 bg-surface hover:border-bark/40'
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className={`block t-card ${on ? 'text-ink' : 'text-ink/80'}`}>{label}</span>
          {hint && <span className="block t-cap text-ink/65 mt-1 leading-snug">{hint}</span>}
        </span>
        {taken
          ? <Badge tone="win">In use</Badge>
          : on && <span className="flex-shrink-0 text-accent mt-0.5"><IconCheck size={16} /></span>}
      </span>
    </button>
  )
}

/** One question and its answers. Only rendered once it has been reached. */
function Question({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="t-label text-ink/80 mb-2">
        <span className="text-accent tabular-nums">{n}.</span> {title}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

/** 1st, 2nd, 3rd … */
function ordinal(n: number): string {
  const r = n % 100
  if (r >= 11 && r <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

function PointsTable({
  table, fieldSize, onChange,
}: {
  table: number[]
  fieldSize: number
  onChange: (t: number[]) => void
}) {
  const rows = resolveCustomPoints(table, Math.max(fieldSize, 1))
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className={FIELD_LABEL}>What each position is worth</span>
        <button
          type="button"
          onClick={() => onChange(defaultCustomPoints(Math.max(fieldSize, 1)))}
          className="t-cap uppercase tracking-[0.12em] text-accent-deep"
        >
          Reset
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((pts, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-12 flex-shrink-0 t-cap text-ink/65 tabular-nums">{ordinal(i + 1)}</span>
            <input
              type="number" inputMode="numeric" min={0} max={MAX_CUSTOM_POINTS} value={pts}
              onChange={e => {
                const next = [...rows]
                next[i] = clampPoints(e.target.value === '' ? 0 : e.target.value)
                onChange(next)
              }}
              className={`${FIELD} flex-1 min-w-0 tabular-nums`}
            />
            <span className="w-8 flex-shrink-0 t-cap text-ink/50">{pts === 1 ? 'pt' : 'pts'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── The cascade ───────────────────────────────────────────────

function Builder({
  existing, playerCount, teamCount, onSave, onCancel,
}: {
  existing: Leaderboard[]
  playerCount: number
  teamCount: number
  onSave: (lb: Leaderboard) => void
  onCancel: (() => void) | null
}) {
  const [draft, setDraft] = useState<Partial<Leaderboard>>({})
  const set = (patch: Partial<Leaderboard>) => setDraft(d => ({ ...d, ...patch }))

  // A prize table is one row per finisher, and on a team board the finishers
  // are the teams. Sized off the players it would pay places nobody can come
  // in. Two is the floor: teams are usually picked after this is answered,
  // and a table with no rows cannot be answered at all.
  const fieldSize = Math.max(2, draft.audience === 'team' ? teamCount : playerCount)

  const drawTaken = hasMatchplay(existing)
  const missing = unanswered(draft)
  const ready = isComplete(draft)
  const league = draft.competition === 'league'

  // Teams answer one question more than individuals, so the numbers are
  // counted rather than written down — a form that skips from 3 to 5 reads
  // as though something went missing.
  let q = 0
  const next = () => ++q

  return (
    <Card className="p-5 flex flex-col gap-5">
      <Question n={next()} title="Who is being ranked?">
        {([
          { key: 'individual' as Audience, label: 'Individuals', hint: 'Every player ranked on their own card.' },
          { key: 'team' as Audience, label: 'Teams', hint: 'Players grouped, and the teams ranked against each other.' },
        ]).map(a => (
          <Choice
            key={a.key}
            on={draft.audience === a.key}
            label={a.label}
            hint={a.hint}
            onClick={() => setDraft({ audience: a.key })}
          />
        ))}
      </Question>

      {draft.audience && (
        <Question n={next()} title="What are they playing?">
          <Choice
            on={league}
            label="League"
            hint="Every round counts towards a running table."
            onClick={() => set({ competition: 'league', scoring: undefined, teamFormat: undefined, combine: undefined })}
          />
          <Choice
            on={draft.competition === 'matchplay'}
            label="Matchplay"
            hint={drawTaken
              ? 'This trip already has a draw — only one is possible.'
              : 'A knockout draw, generated at random.'}
            taken={drawTaken}
            onClick={() => set({ competition: 'matchplay' })}
          />
        </Question>
      )}

      {/* The three league questions, asked in the same order every time.
          They are genuinely independent — how a round is scored says nothing
          about how the rounds add up — so none of them hides another. */}
      {draft.audience && league && (
        <Question n={next()} title="How is a round scored?">
          {SCORINGS.map(s => (
            <Choice
              key={s.key}
              on={draft.scoring === s.key}
              label={s.label}
              hint={s.hint}
              taken={!freeScorings(existing, draft.audience!).includes(s.key)}
              onClick={() => set({ scoring: s.key })}
            />
          ))}
        </Question>
      )}

      {draft.audience === 'team' && league && draft.scoring && (
        <Question n={next()} title="How do a team's players combine?">
          {TEAM_FORMATS.map(f => (
            <Choice
              key={f.key}
              on={draft.teamFormat === f.key}
              label={f.label}
              hint={f.hint}
              taken={!freeTeamFormats(existing, draft.scoring).includes(f.key)}
              onClick={() => set({ teamFormat: f.key })}
            />
          ))}
        </Question>
      )}

      {league && draft.scoring && (draft.audience === 'individual' || draft.teamFormat) && (
        <Question n={next()} title="How do the rounds add up?">
          {COMBINES.map(c => (
            <Choice
              key={c.key}
              on={draft.combine === c.key}
              label={c.label}
              hint={c.hint}
              taken={!isSlotFree(existing, { ...draft, combine: c.key } as Leaderboard)}
              onClick={() => set({
                combine: c.key,
                customPoints: c.key === 'position' ? defaultCustomPoints(fieldSize) : undefined,
              })}
            />
          ))}
        </Question>
      )}

      {/* The prize table, once the board says it pays by position */}
      {draft.combine === 'position' && (
        <PointsTable
          table={draft.customPoints ?? []}
          fieldSize={fieldSize}
          onChange={t => set({ customPoints: t })}
        />
      )}

      {/* Asked of every league board. Dropping your worst round means the
          same thing whether that round was worth points or worth a place. */}
      {offersDiscard(draft) && (
        <Question n={next()} title="Drop anyone's worst round?">
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: MAX_DISCARD + 1 }, (_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => set({ discardWorst: n })}
                className={`min-h-[48px] rounded-xl border t-label transition-colors duration-150 ${
                  (draft.discardWorst ?? 0) === n
                    ? 'border-accent bg-accent/[0.08] text-ink'
                    : 'border-bark/25 bg-surface text-ink/80'
                }`}
              >
                {n === 0 ? 'Keep all' : `Drop ${n}`}
              </button>
            ))}
          </div>
          <p className="t-cap text-ink/65">A bad day stops defining the week.</p>
        </Question>
      )}

      {draft.competition === 'matchplay' && (
        <p className="t-body text-ink/80">
          The draw is generated at random once the players are in. A manual
          draw can come later.
          {draft.audience === 'team' && ' Pairings are teams of two, named by their players.'}
        </p>
      )}

      {/* What is still outstanding, so the form has an end */}
      {missing.length > 0 && draft.audience && (
        <p className="t-cap text-ink/65">Still to answer: {missing.join(' · ')}</p>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass('secondary')}>
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!ready}
          onClick={() => ready && onSave({ ...(draft as Leaderboard), id: `lb-${Date.now()}` })}
          className={buttonClass('primary')}
        >
          {existing.length === 0 ? 'Create leaderboard' : 'Add leaderboard'}
        </button>
      </div>
    </Card>
  )
}

// ─── Main ──────────────────────────────────────────────────────

export default function LeaderboardSetup({
  boards, playerCount, teamCount, onChange,
}: {
  boards: Leaderboard[]
  /** The field an individual prize table pays out to. */
  playerCount: number
  /** The field a team prize table pays out to. */
  teamCount: number
  onChange: (boards: Leaderboard[]) => void
}) {
  const [adding, setAdding] = useState(false)

  const done = boards.length > 0
  const more = canAddMore(boards)

  return (
    <div className="flex flex-col gap-4">

      {boards.map((lb, i) => (
        <Card key={lb.id ?? slotKey(lb)} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="t-h2 text-ink">{boardTitle(lb)}</span>
                {i === 0 && <Badge tone="win">Primary</Badge>}
              </div>
              <p className="t-cap text-ink/65 mt-1 leading-snug">{boardRules(lb)}</p>
            </div>
            <button
              type="button"
              onClick={() => onChange(boards.filter(b => b.id !== lb.id))}
              aria-label={`Remove ${boardTitle(lb)}`}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-ink/50 hover:text-rust transition-colors duration-150"
            >
              <IconX size={16} />
            </button>
          </div>
        </Card>
      ))}

      {(!done || adding) && (
        <Builder
          existing={boards}
          playerCount={playerCount}
          teamCount={teamCount}
          onSave={lb => { onChange([...boards, lb]); setAdding(false) }}
          onCancel={done ? () => setAdding(false) : null}
        />
      )}

      {/* Offered from the start so it is clear more is possible, but not
          usable until the trip has something to play for. */}
      {!adding && (
        <div>
          <button
            type="button"
            disabled={!done || !more}
            onClick={() => setAdding(true)}
            className={buttonClass('secondary')}
          >
            <IconTrophy size={16} />
            Add another leaderboard
            {!done && <IconPlus size={14} />}
          </button>
          <p className="t-cap text-ink/65 mt-2 text-center">
            {!done
              ? 'Finish your main leaderboard first — you can add more after.'
              : !more
                ? 'Every leaderboard this trip can run is already running.'
                : 'A trip can run several boards off the same cards.'}
          </p>
        </div>
      )}
    </div>
  )
}
