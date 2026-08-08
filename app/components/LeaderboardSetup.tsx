'use client'

import { useState } from 'react'
import {
  type Leaderboard, type Audience,
  SCORINGS, TEAM_FORMATS, COMBINES, MAX_DISCARD,
  unanswered, isComplete, offersDiscard, offersAllowance, slotKey, isFormatFree,
  freeScorings, freeTeamFormats,
  hasMatchplay, boardTitle, boardRules,
} from '@/lib/leaderboards'
import {
  FULL_ALLOWANCE, MIN_ALLOWANCE, ALLOWANCE_PRESETS,
  clampAllowance, allowanceOf, suggestedAllowance,
} from '@/lib/handicapAllowance'
import { nextSheetId } from '@/lib/teamSets'
import { defaultCustomPoints, editableRows, clampPoints, MAX_CUSTOM_POINTS } from '@/lib/customPoints'
import { IconTrophy, IconPlus, IconMinus, IconX, IconCheck, IconSettings } from './icons'
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
 *
 * A board can be reopened and changed afterwards, on the same cascade that
 * made it. That is safe because a leaderboard owns no data: scores are the
 * player's, and a board is only a way of reading them. Changing one re-reads
 * the cards that are already in — it never rewrites them. The board being
 * edited is left out of the "in use" checks, or it would report itself as a
 * clash with itself.
 *
 * Which teams a board is played by is NOT asked here. Every team board is
 * made on a sheet of its own and apportioned on the team screen, where the
 * teams themselves are picked — see lib/teamSets.ts.
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

/** The two steppers under the prize table. Square, and a full tap target. */
const STEP =
  'w-11 h-11 flex-shrink-0 grid place-items-center rounded-xl border border-bark/25 '
  + 'bg-surface transition-colors duration-150'

/**
 * The prize table.
 *
 * `fieldSize` is who could finish — the players, or on a team board the
 * teams. It is often not known yet: teams are picked after the board exists,
 * and players go on joining afterwards. So the table is not frozen at
 * whatever the field happened to be. An untouched default follows the field
 * wherever it ends up (`editableRows`); an edited one is kept exactly as it
 * is, length and all, because a decision should survive somebody signing up
 * — and because on this screen the number of places is itself a decision.
 *
 * That last part is the difference between here and scoring. A board reads
 * its table through `resolveCustomPoints`, which pads a short one with
 * noughts so the competition is always scorable however many turn up. The
 * editor must not, or the two buttons below would be writing into something
 * that resizes itself back a moment later.
 */
function PointsTable({
  table, fieldSize, known, unit, onChange,
}: {
  table: number[]
  fieldSize: number
  /** False when nobody has joined or no teams are picked — the field is a guess. */
  known: boolean
  /** What is being ranked: "players", or "teams". */
  unit: string
  onChange: (t: number[]) => void
}) {
  const rows = editableRows(table, fieldSize)

  /**
   * The row whose box has been emptied, if any.
   *
   * A prize table is a list of numbers, so every row always holds one — and
   * that meant backspacing a figure out put a 0 straight back in, which then
   * would not delete either. Every edit became select-all-then-type, and the
   * nought looked broken rather than deliberate.
   *
   * So an emptied box is allowed to *look* empty while it is being typed in,
   * without the table ever holding a gap: the stored figure goes to nought,
   * which is what an unanswered place is worth, and only the box on screen is
   * blank. One index rather than a set, because only one box can have the
   * cursor in it, and it is given up on blur — a box left empty and walked
   * away from shows the nought it is really worth.
   */
  const [blank, setBlank] = useState<number | null>(null)

  /**
   * Adding and removing a place by hand.
   *
   * An untouched table sizes itself to the field, which is right nearly all
   * of the time — but "nearly" is doing work there. A place can be added
   * before the team or the player who will fill it exists, and the sheet is
   * often filled in that order: work out the prize table, then pick the
   * teams. Without this the only way to get a fifth row was to go and make a
   * fifth team first.
   *
   * Both write the whole table, and `editableRows` hands it straight back —
   * so a row added stays added and a row removed stays removed. Neither is
   * ever a no-op, which is what they both were when the rows were resolved
   * against the field on the way in.
   *
   * A new place is worth nothing until somebody says otherwise. Guessing a
   * figure for it — one less than the row above, say — would be inventing a
   * decision, and a nought is visibly a thing to fill in.
   *
   * Removing takes the bottom row, because that is the place being taken
   * away. Never below one: a table with no rows cannot be answered at all.
   */
  const addRow    = () => { setBlank(null); onChange([...rows, 0]) }
  const removeRow = () => {
    if (rows.length <= 1) return
    setBlank(null)
    onChange(rows.slice(0, -1))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className={FIELD_LABEL}>What each position is worth</span>
        <button
          type="button"
          onClick={() => {
            setBlank(null)
            onChange(defaultCustomPoints(Math.max(fieldSize, 1)))
          }}
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
              type="number" inputMode="numeric" min={0} max={MAX_CUSTOM_POINTS}
              value={blank === i ? '' : pts}
              onChange={e => {
                const raw = e.target.value
                setBlank(raw === '' ? i : null)
                const next = [...rows]
                next[i] = clampPoints(raw === '' ? 0 : raw)
                onChange(next)
              }}
              onBlur={() => setBlank(null)}
              className={`${FIELD} flex-1 min-w-0 tabular-nums`}
            />
            <span className="w-8 flex-shrink-0 t-cap text-ink/50">{pts === 1 ? 'pt' : 'pts'}</span>
          </div>
        ))}
      </div>

      {/* Under the rows and at their right-hand end: they act on the bottom
          of the list, and they line up with the column the figures sit in.

          A glyph each, with the wording moved into `label` — which is the
          icon's accessible name, not decoration. Losing the words on screen
          must not lose them from a screen reader, where "button, button" is
          the whole of what is left. */}
      <div className="flex items-center justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={removeRow}
          disabled={rows.length <= 1}
          className={`${STEP} text-ink/70 hover:border-bark/40 disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          <IconMinus size={18} label="Remove the last place" />
        </button>
        <button
          type="button"
          onClick={addRow}
          className={`${STEP} text-ink hover:border-accent`}
        >
          <IconPlus size={18} label="Add a place" />
        </button>
      </div>

      {/* Only when the field is still a guess. Once the players or the teams
          are known the table explains itself — a row per finisher, in order,
          with the figure sitting in it. */}
      {!known && (
        <p className="t-cap text-ink/65 mt-2 leading-snug">
          {`The ${unit} are not picked yet, so this is a placeholder — leave it and the table sizes itself to them. Change a figure and it stays changed.`}
        </p>
      )}
    </div>
  )
}

// ─── Handicap allowance ────────────────────────────────────────

/** The chips, and the box the keypad answer sits in. Same box as everything. */
const CHIP =
  'min-h-[48px] rounded-xl border t-label transition-colors duration-150 tabular-nums'
const chipClass = (on: boolean) =>
  `${CHIP} ${on ? 'border-accent bg-accent/[0.08] text-ink' : 'border-bark/25 bg-surface text-ink/80'}`

/**
 * What percentage of their course handicap this board is played off.
 *
 * The recommended figure is named rather than pre-selected. A reduction
 * changes what every card on the trip is worth, and one applied because
 * nobody scrolled far enough to see it is the sort of thing that is noticed
 * when the prizes are being handed out. So the answer starts at "off", and
 * the recommendation is a sentence the organiser can act on.
 *
 * Four taps cover almost every trip; the keypad is there for the society with
 * its own rule, because "whatever you like" was the ask.
 */
function AllowancePicker({
  value, suggested, onChange,
}: {
  value: number
  suggested: number
  onChange: (pct: number) => void
}) {
  const presets = ALLOWANCE_PRESETS as readonly number[]
  const [custom, setCustom] = useState(!presets.includes(value))
  const [text, setText] = useState(String(value))

  const pick = (pct: number) => { setCustom(false); setText(String(pct)); onChange(pct) }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {presets.map(pct => (
          <button
            key={pct}
            type="button"
            onClick={() => pick(pct)}
            className={chipClass(!custom && value === pct)}
          >
            {pct === FULL_ALLOWANCE ? 'Off' : `${pct}%`}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={`${chipClass(custom)} px-4 flex-shrink-0`}
        >
          Something else
        </button>
        {custom && (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_ALLOWANCE}
              max={FULL_ALLOWANCE}
              value={text}
              aria-label="Handicap allowance, per cent"
              onChange={e => {
                setText(e.target.value)
                const n = Number(e.target.value)
                // Committed as it is typed while it reads as a real answer;
                // half-typed numbers are left alone rather than snapped to the
                // floor, which is what makes "8" on the way to "80" bearable.
                if (Number.isFinite(n) && n >= MIN_ALLOWANCE && n <= FULL_ALLOWANCE) {
                  onChange(Math.round(n))
                }
              }}
              onBlur={() => {
                const pct = clampAllowance(text)
                setText(String(pct))
                onChange(pct)
              }}
              className={`${FIELD} flex-1 min-w-0 tabular-nums`}
            />
            <span className="t-cap text-ink/50 flex-shrink-0">%</span>
          </>
        )}
      </div>

      <p className="t-cap text-ink/65 leading-snug">
        {suggested === FULL_ALLOWANCE
          ? 'This board is played off the full course handicap.'
          : <>
              <span className="text-accent-deep">{suggested}% is the standard allowance</span>
              {' for this kind of competition. '}
              {value === FULL_ALLOWANCE
                ? 'Leave it off and everyone plays off the full figure.'
                : `Everyone's course handicap is cut to ${value}% of it, rounded to the nearest shot. Gross scores are unaffected, and every other leaderboard keeps its own allowance.`}
            </>}
      </p>
    </div>
  )
}

// ─── The cascade ───────────────────────────────────────────────

function Builder({
  existing, initial, playerCount, teamCount, onSave, onCancel,
}: {
  /** What the trip already runs, NOT counting the board being edited. */
  existing: Leaderboard[]
  /** The board being changed, or null when making a new one. */
  initial: Leaderboard | null
  playerCount: number
  teamCount: number
  onSave: (lb: Leaderboard) => void
  onCancel: (() => void) | null
}) {
  const [draft, setDraft] = useState<Partial<Leaderboard>>(initial ?? {})
  const set = (patch: Partial<Leaderboard>) => setDraft(d => ({ ...d, ...patch }))

  // A prize table is one row per finisher, and on a team board the finishers
  // are the teams. Sized off the players it would pay places nobody can come
  // in. Two is the floor, because a table with no rows cannot be answered at
  // all — but a floor is a guess, and a guess must not become the answer:
  // teams are always picked after the board exists, and players go on
  // joining. `resolveCustomPoints` is what keeps an untouched table in step
  // with the field it turns out to have.
  const teamBoard = draft.audience === 'team'
  const field = teamBoard ? teamCount : playerCount
  const fieldSize = Math.max(2, field)
  const unit = teamBoard ? 'teams' : 'players'

  const editing = initial !== null
  const drawTaken = hasMatchplay(existing)
  const missing = unanswered(draft)
  const ready = isComplete(draft)
  const league = draft.competition === 'league'
  // Changing an answer can land a board on a competition the trip already
  // runs. It cannot be saved, and the form has to say so rather than let the
  // button look ready.
  const clashes = draft.audience != null && draft.competition != null
    && !isFormatFree(existing, draft as Leaderboard)

  // Teams answer one question more than individuals, so the numbers are
  // counted rather than written down — a form that skips from 3 to 5 reads
  // as though something went missing.
  let q = 0
  const next = () => ++q

  return (
    <Card className="p-5 flex flex-col gap-5">
      <div>
        {/* "Another", not "A second". The heading counted for you, and it
            counted wrong every time after the first: adding a fifth board
            was still announced as adding a second. Counting is the one thing
            this line does not need to do — how many are already running is
            visible in the list directly behind this form. */}
        <p className="t-h2 text-ink">
          {editing
            ? 'Change this leaderboard'
            : existing.length === 0 ? 'First, your primary leaderboard' : 'Add another board'}
        </p>
        <p className="t-cap text-ink/65 mt-1 leading-snug">
          {editing
            ? 'Edited leaderboards will re-populate with the already entered scores.'
            : existing.length === 0
              ? 'This is your trip\'s main leaderboard for the trip. You can add secondary leaderboards as well later.'
              : 'Scored from the same cards, it will run alongside your primary board.'}
        </p>
      </div>

      <Question n={next()} title="Is this a solo or team leaderboard?">
        {([
          { key: 'individual' as Audience, label: 'Solo', hint: 'Every player ranked on their own card.' },
          { key: 'team' as Audience, label: 'Teams', hint: 'Add players to teams, and the teams are ranked against each other' },
        ]).map(a => (
          <Choice
            key={a.key}
            on={draft.audience === a.key}
            label={a.label}
            hint={a.hint}
            // Who is ranked is the question everything else hangs off, so
            // changing it starts the cascade again. The sheet is not carried
            // across either — teams are apportioned on the team screen.
            onClick={() => setDraft({ audience: a.key })}
          />
        ))}
      </Question>

      {draft.audience && (
        <Question n={next()} title="Pick the format.">
          <Choice
            on={league}
            label="League"
            hint="Everyone ranked on a running table."
            onClick={() => set({ competition: 'league', scoring: undefined, teamFormat: undefined, combine: undefined })}
          />
          <Choice
            on={draft.competition === 'matchplay'}
            label="Matchplay"
            hint={drawTaken
              ? 'Only one matchplay bracket can be created at a time.'
              : 'A knockout bracket.'}
            taken={drawTaken}
            onClick={() => set({ competition: 'matchplay' })}
          />
        </Question>
      )}

      {/* The three league questions, asked in the same order every time.
          They are genuinely independent — how a round is scored says nothing
          about how the rounds add up — so none of them hides another. */}
      {draft.audience && league && (
        <Question n={next()} title="How should the rounds be scored?">
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
              taken={!isFormatFree(existing, { ...draft, combine: c.key } as Leaderboard)}
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
          known={field > 0}
          unit={unit}
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

      {/* Last, because it is the one answer that is a suggestion rather than a
          question — a trip that ignores it plays off the full handicap, which
          is what every trip did before it was asked. */}
      {offersAllowance(draft) && (
        <Question n={next()} title="Do you want to apply a handicap reduction?">
          <AllowancePicker
            value={allowanceOf(draft)}
            suggested={suggestedAllowance(draft)}
            // Not stored when there is no reduction, so a board that leaves
            // this alone is the object it has always been.
            onChange={pct => set({
              handicapAllowance: pct === FULL_ALLOWANCE ? undefined : pct,
            })}
          />
        </Question>
      )}

      {draft.competition === 'matchplay' && (
        <p className="t-body text-ink/80">
          The draw will be generated at random.
        </p>
      )}

      {/* What is still outstanding, so the form has an end */}
      {missing.length > 0 && draft.audience && (
        <p className="t-cap text-ink/65">Still to answer: {missing.join(' · ')}</p>
      )}

      {clashes && missing.length === 0 && (
        <p className="t-cap text-rust-deep leading-snug">
          This trip already runs that leaderboard. Change an answer — two
          boards scored the same way would print the same table twice.
        </p>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass('secondary')}>
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!ready || clashes}
          onClick={() => ready && !clashes && onSave({
            ...(draft as Leaderboard),
            // An edit keeps its identity, so the tab it is on and the teams
            // already picked for it stay with it.
            id: initial?.id ?? `lb-${Date.now()}`,
            // Store the table that was on screen — the same function that
            // drew it, so the two cannot disagree about how many places there
            // are. A board saved without the table being touched still stores
            // a real one sized to the field, because that is what was shown.
            ...(draft.combine === 'position'
              ? { customPoints: editableRows(draft.customPoints ?? [], fieldSize) }
              : {}),
          })}
          className={buttonClass('primary')}
        >
          {editing
            ? 'Save changes'
            : existing.length === 0 ? 'Create leaderboard' : 'Add leaderboard'}
        </button>
      </div>
    </Card>
  )
}

// ─── Main ──────────────────────────────────────────────────────

export default function LeaderboardSetup({
  boards, playerCount, teamCount, readOnly = false, onChange,
}: {
  boards: Leaderboard[]
  /** The field an individual prize table pays out to. */
  playerCount: number
  /** The field a team prize table pays out to. */
  teamCount: number
  /** Shown but not changeable — somebody who is not the trip's owner. */
  readOnly?: boolean
  onChange: (boards: Leaderboard[]) => void
}) {
  const [adding, setAdding] = useState(false)
  /** The id of the board open in the cascade, or null. */
  const [editingId, setEditingId] = useState<string | null>(null)

  const done = boards.length > 0
  const editing = boards.find(b => b.id === editingId) ?? null
  // The board being changed is not competition for itself.
  const others = boards.filter(b => b.id !== editingId)

  /**
   * Where a saved board lands.
   *
   * A team board needs a sheet of its own the moment it exists, so the team
   * screen has something to apportion. It keeps the sheet it already had when
   * one is still a team board after the edit; a board that stops ranking
   * teams gives its sheet up, and one that starts ranking them takes a fresh
   * one rather than inheriting somebody else's teams.
   */
  function placed(lb: Leaderboard, was: Leaderboard | null): Leaderboard {
    if (lb.audience !== 'team') {
      const rest = { ...lb }
      delete rest.teamSet
      return rest
    }
    if (was?.audience === 'team' && was.teamSet) return { ...lb, teamSet: was.teamSet }
    return { ...lb, teamSet: nextSheetId(boards.filter(b => b.id !== lb.id)) }
  }

  function save(lb: Leaderboard) {
    const was = boards.find(b => b.id === lb.id) ?? null
    const next = placed(lb, was)
    onChange(was
      ? boards.map(b => (b.id === next.id ? next : b))
      : [...boards, next])
    setAdding(false)
    setEditingId(null)
  }

  return (
    <div className="flex flex-col gap-4">

      {boards.map((lb, i) => (
        editingId === lb.id ? (
          <Builder
            key={lb.id ?? slotKey(lb)}
            existing={others}
            initial={lb}
            playerCount={playerCount}
            teamCount={teamCount}
            onSave={save}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <Card key={lb.id ?? slotKey(lb)} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="t-h2 text-ink">{boardTitle(lb)}</span>
                  {i === 0 && <Badge tone="win">Primary</Badge>}
                </div>
                <p className="t-cap text-ink/65 mt-1 leading-snug">{boardRules(lb)}</p>
              </div>
              {/* A board is a way of reading the cards, not a place the cards
                  live, so changing one is safe at any point in the trip. */}
              {!readOnly && (
                <div className="flex-shrink-0 flex items-center">
                  <button
                    type="button"
                    onClick={() => { setAdding(false); setEditingId(lb.id) }}
                    aria-label={`Change ${boardTitle(lb)}`}
                    className="w-9 h-9 flex items-center justify-center text-ink/50 hover:text-accent-deep transition-colors duration-150"
                  >
                    <IconSettings size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(boards.filter(b => b.id !== lb.id))}
                    aria-label={`Remove ${boardTitle(lb)}`}
                    className="w-9 h-9 flex items-center justify-center text-ink/50 hover:text-rust transition-colors duration-150"
                  >
                    <IconX size={16} />
                  </button>
                </div>
              )}
            </div>
          </Card>
        )
      ))}

      {!readOnly && !editing && (!done || adding) && (
        <Builder
          existing={boards}
          initial={null}
          playerCount={playerCount}
          teamCount={teamCount}
          onSave={save}
          onCancel={done ? () => setAdding(false) : null}
        />
      )}

      {/* Offered from the start so it is clear more is possible, but not
          usable until the trip has something to play for. */}
      {!readOnly && !adding && !editing && (
        <Card className={`p-5 ${done ? '' : 'opacity-55'}`}>
          <div className="flex items-start gap-3">
            <span className={`flex-shrink-0 mt-0.5 ${done ? 'text-accent-deep' : 'text-ink/50'}`}>
              <IconTrophy size={18} />
            </span>
            <div className="min-w-0">
              <p className="t-card text-ink">Create a secondary leaderboard</p>
              <p className="t-cap text-ink/65 mt-1 leading-snug">
                {!done
                  ? 'Once your primary leaderboard is set, you can add more.'
                  : 'A trip can run several events in parallel off the same cards — an order of merit alongside a daily prize, or a knockout between different teams beside a league.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!done}
            onClick={() => setAdding(true)}
            className={`${buttonClass('secondary')} mt-4`}
          >
            <IconPlus size={15} />
            Add a leaderboard
          </button>
        </Card>
      )}
    </div>
  )
}
