'use client'

import { useState } from 'react'
import {
  type Leaderboard, type Audience,
  scoringsFor, TEAM_FORMATS, COMBINES, MAX_DISCARD,
  unanswered, isComplete, offersDiscard, offersTieBreak, offersQuotaScale,
  offersCountingScores, countingScoresOf, aggregateFinishOf, offersTeamNames,
  offersTeeTeams, MIN_TEAM_SIZE, MAX_TEAM_SIZE_TOGETHER, MAX_TEAM_SIZE_SEPARATE,
  offersAllowance, tripQuotaScale, slotKey, isFormatFree,
  freeScorings, freeTeamFormats,
  hasMatchplay, boardTitle, boardRules,
  TAG_MODES, MAX_TAG_COUNT, DEFAULT_TAG_COUNT, tagCountOf,
  isTagBoard, offersTeamFormat, offersTagMode, offersTagCount,
} from '@/lib/leaderboards'
import { DEFAULT_TEAM_SCORING, MAX_COUNTING_SCORES, lastHoles } from '@/lib/teamScoring'
import {
  FULL_ALLOWANCE, MIN_ALLOWANCE, ALLOWANCE_PRESETS,
  clampAllowance, allowanceOf, suggestedAllowance,
} from '@/lib/handicapAllowance'
import { TIE_BREAKS, OVERALL_TIES, DEFAULT_TIE_BREAK, tieBreakOf, overallTieOf } from '@/lib/tiebreak'
import {
  type RoundLink, type MatchDecision,
  MATCH_DECISIONS, DEFAULT_MATCH_DECISION, linkFor, isQuota,
} from '@/lib/matchDecision'
import {
  type QuotaScale, QUOTA_SCALES, DEFAULT_QUOTA_SCALE, quotaScaleOf, quotaScaleLabel,
} from '@/lib/quota'
import { previewBracket } from '@/lib/matchplay'
import { nextSheetId, setOf, withSheet } from '@/lib/teamSets'
import { TAG_SET } from '@/lib/tagBoards'
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

/**
 * What a board being made starts out as. Nothing: every answer with a
 * default is seeded when the question it belongs to is reached — the tie
 * rule, whose two defaults differ (see lib/tiebreak.ts), is seeded when the
 * board says it pays by position, because that is the only board the
 * question is asked of.
 */
const FRESH: Partial<Leaderboard> = {}

/** A round of golf on this trip, as the matchplay link picker needs it. */
export type LinkableRound = {
  id: string
  roundNumber?: number
  courseName?: string | null
}

const roundLabel = (r: LinkableRound) =>
  [r.roundNumber ? `Round ${r.roundNumber}` : 'Round', r.courseName]
    .filter(Boolean).join(' — ')

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

/**
 * How many of the team's scores make the composite card on each hole.
 *
 * Two chips cover almost every board — best score is classic better ball,
 * best 2 the platform's long-standing default — with a keypad behind
 * "Something else" for the rare board that counts more. Above the team's
 * size a count simply caps out at everyone, so a big number is never wrong,
 * only pointless.
 */
function CountingScoresPicker({
  value, onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  const presets = [1, 2]
  const [custom, setCustom] = useState(!presets.includes(value))
  const [text, setText] = useState(String(value))

  const pick = (n: number) => { setCustom(false); setText(String(n)); onChange(n) }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {presets.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            className={chipClass(!custom && value === n)}
          >
            {n === 1 ? 'Best score' : `Best ${n} scores`}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setCustom(true)}
        className={`${chipClass(custom)} px-4 self-start`}
      >
        Something else
      </button>

      {/* Its own row, visibly sized. It shared a row with the chip and was
          squeezed to a sliver — the number being typed was invisible, and a
          number typed blind is how a wrong count gets stored. The width is a
          max-w cap rather than a w-*: FIELD carries w-full, both are width
          utilities, and which wins is stylesheet order — a coin toss this
          file has been burnt by once already. max-width is a different
          property and always caps. Sized to two digits, which is every
          answer this box can hold. */}
      {custom && (
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_COUNTING_SCORES}
            value={text}
            aria-label="Scores counting on each hole"
            onChange={e => {
              setText(e.target.value)
              const n = Number(e.target.value)
              // Committed as it is typed while it reads as a real answer —
              // the same rule as the allowance keypad above.
              if (Number.isFinite(n) && n >= 1 && n <= MAX_COUNTING_SCORES) {
                onChange(Math.round(n))
              }
            }}
            onBlur={() => {
              const n = Number(text)
              // Only a real answer is kept. An out-of-range number is a slip
              // of the thumb, and rounding it to the nearest legal value
              // would store a decision nobody made — the box goes back to
              // what the board actually holds instead.
              if (Number.isFinite(n) && n >= 1 && n <= MAX_COUNTING_SCORES) {
                const v = Math.round(n)
                setText(String(v))
                onChange(v)
              } else {
                setText(String(value))
              }
            }}
            className={`${FIELD} max-w-[4.5rem] flex-none text-center text-lg tabular-nums`}
          />
          <span className="t-cap text-ink/65">scores a hole</span>
        </div>
      )}

      <p className="t-cap text-ink/65 leading-snug">
        {value === 1
          ? 'Only the team\'s best score on each hole goes on the composite card.'
          : `The team's best ${value} scores on each hole go on the composite card. A count above a team's size just counts everyone.`}
      </p>
    </div>
  )
}

/**
 * The grandstand finish: closing holes where the whole team counts.
 *
 * Off, or a number of holes typed in — it can only add scores to the card,
 * so a trailing team can still catch up over the last few while the leaders
 * carry their weakest players home.
 */
function GrandstandFinishPicker({
  value, onChange,
}: {
  /** 0 when off, else how many closing holes. */
  value: number
  onChange: (n: number) => void
}) {
  const [on, setOn] = useState(value > 0)
  const [text, setText] = useState(String(value > 0 ? value : 3))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setOn(false); onChange(0) }}
          className={`${chipClass(!on)} px-5 flex-shrink-0`}
        >
          No
        </button>
        <button
          type="button"
          onClick={() => {
            setOn(true)
            const n = Number(text)
            if (Number.isFinite(n) && n >= 1 && n <= 18) onChange(Math.round(n))
          }}
          className={`${chipClass(on)} px-4 flex-shrink-0`}
        >
          Yes, the last…
        </button>
      </div>

      {/* Its own row, visibly sized. It shared a row with two chips and was
          squeezed to a sliver — the number being typed was invisible, and a
          number typed blind is how "the last 18" got stored: at 18 every
          hole is the finish and the whole team counts everywhere, which
          reads as the counting-scores setting being ignored. The width is a
          max-w cap, not a w-*, for the reason on the counting box above —
          FIELD's own w-full wins the utility coin toss otherwise, which is
          how this box came to span the whole card. Two digits fit 1–18. */}
      {on && (
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={18}
            value={text}
            aria-label="Closing holes where everyone counts"
            onChange={e => {
              setText(e.target.value)
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n >= 1 && n <= 18) onChange(Math.round(n))
            }}
            onBlur={() => {
              const n = Number(text)
              // Only a real answer is kept. "33" rounded down to 18 stored a
              // decision nobody made — and 18 is the biggest decision on the
              // question, everyone counting on every hole — so an
              // out-of-range number goes back to what the board holds.
              if (Number.isFinite(n) && n >= 1 && n <= 18) {
                const v = Math.round(n)
                setText(String(v))
                onChange(v)
              } else {
                setText(String(value > 0 ? value : 3))
              }
            }}
            className={`${FIELD} max-w-[4.5rem] flex-none text-center text-lg tabular-nums`}
          />
          <span className="t-cap text-ink/65">holes</span>
        </div>
      )}

      <p className="t-cap text-ink/65 leading-snug">
        {value > 0
          ? `Over ${lastHoles(value)}, every score in the team counts — a trailing team can still catch up.`
          : 'A grandstand finish: over the closing holes every score in the team counts, so a trailing team can still catch up.'}
      </p>
    </div>
  )
}

/**
 * Linking each bracket round to a round of golf.
 *
 * A knockout is played somewhere. Say which round of the trip each bracket
 * round is contested over and how a match on it is settled, and the winners
 * follow from the scorecards — see lib/matchDecision.ts. Leave a bracket
 * round unlinked and it is tapped in by hand, which is what every draw did
 * before this existed, so an existing trip is untouched by the question.
 *
 * The rounds are named off the field, through `previewBracket` — the same
 * function the Create Matchplay button previews with, so the names here are
 * the names that will be drawn. A field too small to draw at all shows the
 * reason rather than an empty panel: teams and players both arrive after a
 * board is made, and a blank space would read as a broken screen.
 *
 * **A link is stored against the bracket round's number, not its name.** A
 * field growing from seven to nine turns a Quarter-Final into a Round of 16
 * and adds a round below it — the names all shift, the numbers do not.
 */
function RoundLinks({
  links, rounds, entrantCount, tripScale, onChange,
}: {
  links: RoundLink[]
  rounds: LinkableRound[]
  /** Players in a singles draw, pairings in a pairs one. */
  entrantCount: number
  /** What the trip's Quota board plays, which a link may override. */
  tripScale: QuotaScale
  onChange: (links: RoundLink[]) => void
}) {
  const shape = previewBracket(entrantCount)

  const setLink = (bracketRound: number, patch: Partial<RoundLink>) => {
    const current = linkFor(links, bracketRound)
    const next = links.filter(l => l.bracketRound !== bracketRound)
    const roundId = patch.roundId ?? current?.roundId
    // No round, no link. Clearing the round is how a bracket round goes back
    // to being decided by hand, so it is a removal rather than a half-filled
    // entry the scoring side would have to guard against.
    if (roundId) {
      const decidedBy = patch.decidedBy ?? current?.decidedBy ?? DEFAULT_MATCH_DECISION
      // The override belongs to the quota method. A link switched to
      // something else would otherwise carry an answer to a question it is
      // no longer being asked, and switching back would silently restore it.
      const quotaScale = isQuota(decidedBy)
        ? patch.quotaScale ?? current?.quotaScale
        : undefined
      next.push({
        bracketRound, roundId, decidedBy,
        ...(quotaScale ? { quotaScale } : {}),
      })
    }
    onChange(next.sort((a, b) => a.bracketRound - b.bracketRound))
  }

  return (
    <div className="border-t border-bark/12 pt-4 mt-1">
      <p className="t-label text-ink/80 mb-1">Decide matches from the cards?</p>
      <p className="t-cap text-ink/65 mb-3 leading-snug">
        Link a bracket round to a round of golf and the winners come off the
        scorecards. Leave one unlinked to tap the results in yourself.
      </p>

      {!shape ? (
        <p className="t-cap text-ink/65 leading-snug">
          The rounds of the draw are named once the field is known — add
          players, or pick the pairings, and come back to this.
        </p>
      ) : rounds.length === 0 ? (
        <p className="t-cap text-ink/65 leading-snug">
          This trip has no golf in its itinerary yet. Add a round and it can be
          linked here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shape.roundNames.map((name, i) => {
            const bracketRound = i + 1
            const link = linkFor(links, bracketRound)
            return (
              <div
                key={bracketRound}
                className={`rounded-xl border px-3 py-3 ${
                  link ? 'border-accent/40 bg-accent/[0.05]' : 'border-bark/25 bg-surface'
                }`}
              >
                <p className="t-card text-ink mb-2">{name}</p>

                <label className={FIELD_LABEL}>Played over</label>
                <select
                  value={link?.roundId ?? ''}
                  onChange={e => setLink(bracketRound, { roundId: e.target.value })}
                  className={FIELD}
                >
                  <option value="">Decided by hand</option>
                  {rounds.map(r => (
                    <option key={r.id} value={r.id}>{roundLabel(r)}</option>
                  ))}
                </select>

                {link && (
                  <>
                    <label className={`${FIELD_LABEL} mt-3`}>Decided by</label>
                    <select
                      value={link.decidedBy}
                      onChange={e => setLink(bracketRound, {
                        decidedBy: e.target.value as MatchDecision,
                      })}
                      className={FIELD}
                    >
                      {MATCH_DECISIONS.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                    <p className="t-cap text-ink/65 mt-2 leading-snug">
                      {MATCH_DECISIONS.find(m => m.key === link.decidedBy)?.hint}
                    </p>

                    {/* The scale is the trip's, set on its Quota board. This
                        is only here to disagree with it for the knockout —
                        so it opens on "the trip's" and names what that is,
                        rather than asking the same question twice. */}
                    {isQuota(link.decidedBy) && (
                      <>
                        <label className={`${FIELD_LABEL} mt-3`}>Quota scale</label>
                        <select
                          value={link.quotaScale ?? ''}
                          onChange={e => setLink(bracketRound, {
                            quotaScale: (e.target.value || undefined) as QuotaScale | undefined,
                          })}
                          className={FIELD}
                        >
                          <option value="">
                            Same as the trip — {quotaScaleLabel(tripScale)}
                          </option>
                          {QUOTA_SCALES.map(q => (
                            <option key={q.key} value={q.key}>{q.label}</option>
                          ))}
                        </select>
                        <p className="t-cap text-ink/65 mt-2 leading-snug">
                          {QUOTA_SCALES.find(q => q.key === (link.quotaScale ?? tripScale))?.hint}
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── The cascade ───────────────────────────────────────────────

function Builder({
  existing, initial, playerCount, teamCount, rounds, askTeeTeams = false,
  askTags = false, onSave, onCancel,
}: {
  /** What the trip already runs, NOT counting the board being edited. */
  existing: Leaderboard[]
  /** The board being changed, or null when making a new one. */
  initial: Leaderboard | null
  playerCount: number
  teamCount: number
  /** The trip's golf, for linking a bracket round to one of them. */
  rounds: LinkableRound[]
  /** Events only — ask team boards how they meet the tee sheet. */
  askTeeTeams?: boolean
  /** Events only — offer a board that ranks tags (lib/tagBoards.ts). */
  askTags?: boolean
  onSave: (lb: Leaderboard) => void
  onCancel: (() => void) | null
}) {
  const [draft, setDraft] = useState<Partial<Leaderboard>>(initial ?? FRESH)
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

      <Question n={next()} title="Who is being ranked?">
        {([
          { key: 'individual' as Audience, label: 'Solo', hint: 'Every player ranked on their own card.' },
          { key: 'team' as Audience, label: 'Teams', hint: 'Add players to teams, and the teams are ranked against each other' },
        ]).map(a => (
          <Choice
            key={a.key}
            on={draft.audience === a.key && !draft.tagMode}
            label={a.label}
            hint={a.hint}
            // Who is ranked is the question everything else hangs off, so
            // changing it starts the cascade again. The sheet is not carried
            // across either — teams are apportioned on the team screen.
            onClick={() => setDraft({ ...FRESH, audience: a.key })}
          />
        ))}
        {/* Events only. Tags are the sides a field carries all week while
            the fourballs change daily, and a trip has no organiser to set
            them — the same context `askTeeTeams` carries, for the same
            reason: this model does not know what kind of trip is asking.
            Picking it writes a mode straight away, so the draft is never a
            tags board that has not said how it scores. */}
        {askTags && (
          <Choice
            on={isTagBoard(draft)}
            label="Tags"
            hint="Rank the sides players carry all week — whoever they play with on the day."
            onClick={() => setDraft({
              ...FRESH, audience: 'team', tagMode: TAG_MODES[0].key,
            })}
          />
        )}
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
          {/* Per audience, not the whole list: quota is individual-only, and
              rendering it greyed for a team board would read as "already
              running" when it was never on offer. */}
          {scoringsFor(draft.audience).map(s => (
            <Choice
              key={s.key}
              on={draft.scoring === s.key}
              label={s.label}
              hint={s.hint}
              // A tags board is a fresh axis on the grid `freeScorings`
              // walks, so it is asked of the candidate directly — through
              // the same `isFormatFree`, never a second rule about what
              // makes two boards one.
              taken={isTagBoard(draft)
                ? !isFormatFree(existing, { ...draft, scoring: s.key } as Leaderboard)
                : !freeScorings(existing, draft.audience!).includes(s.key)}
              onClick={() => set({ scoring: s.key })}
            />
          ))}
        </Question>
      )}

      {/* Only a Quota board earns quota points, so only a Quota board is
          asked. It sits directly under the scoring rather than at the end of
          the cascade because it is not a refinement of the board — it is what
          the board's numbers mean. */}
      {offersQuotaScale(draft) && (
        <Question n={next()} title="How is quota scored?">
          {QUOTA_SCALES.map(q => (
            <Choice
              key={q.key}
              on={quotaScaleOf(draft) === q.key}
              label={q.label}
              hint={q.hint}
              onClick={() => set({ quotaScale: q.key })}
            />
          ))}
          <p className="t-cap text-ink/65 leading-snug">
            Your quota is 36 minus your course handicap either way — the scale
            only decides what going under par is worth.
          </p>
        </Question>
      )}

      {/* A tags board's own question, sitting where a team board is asked
          how its players combine — because it is the same question asked
          of a side: what makes the tag's score for the day. */}
      {offersTagMode(draft) && (
        <Question n={next()} title="How does a tag score a round?">
          {TAG_MODES.map(m => (
            <Choice
              key={m.key}
              on={draft.tagMode === m.key}
              label={m.label}
              hint={m.hint}
              // Asked of the candidate rather than through `freeScorings`:
              // the board grid describes ordinary boards, and a tag is a
              // fresh axis on it. `isFormatFree` is still the one copy of
              // what makes two boards the same competition.
              taken={!isFormatFree(existing, { ...draft, tagMode: m.key } as Leaderboard)}
              // The count belongs to the mode that counts a few. Carried
              // across, it would sit on a board no longer being asked.
              onClick={() => set({
                tagMode: m.key,
                ...(m.key === 'best_cards' ? {} : { tagCount: undefined }),
              })}
            />
          ))}
        </Question>
      )}

      {offersTagCount(draft) && (
        <Question n={next()} title="How many cards count each round?">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: MAX_TAG_COUNT }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => set({
                  // Not stored when it is the default, so a board that
                  // leaves this alone reads back as the object it was.
                  tagCount: n === DEFAULT_TAG_COUNT ? undefined : n,
                })}
                aria-pressed={tagCountOf(draft) === n}
                className={`w-11 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tagCountOf(draft) === n
                    ? 'bg-accent-deep text-white'
                    : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="t-cap text-ink/65 leading-snug">
            A tag with fewer players out than this counts everyone who
            played — a card nobody handed in is not a nought.
          </p>
        </Question>
      )}

      {offersTeamFormat(draft) && draft.scoring && (
        <Question n={next()} title="How do a team's players combine?">
          {TEAM_FORMATS.map(f => (
            <Choice
              key={f.key}
              on={draft.teamFormat === f.key}
              label={f.label}
              hint={f.hint}
              taken={!freeTeamFormats(existing, draft.scoring).includes(f.key)}
              // The count and the finish belong to better ball. Carrying
              // them across to another format would leave the board storing
              // answers to questions it is no longer being asked.
              onClick={() => set({
                teamFormat: f.key,
                ...(f.key === 'better_ball'
                  ? {}
                  : { countingScores: undefined, aggregateFinish: undefined }),
              })}
            />
          ))}
        </Question>
      )}

      {/* Directly under the format it refines: how many scores build the
          composite card. Best 2 is what every board counted before this was
          asked, so leaving it alone changes nothing. */}
      {offersCountingScores(draft) && (
        <Question n={next()} title="How many scores count on each hole?">
          <CountingScoresPicker
            value={countingScoresOf(draft)}
            // Not stored when it is the default, so a board that leaves this
            // alone is the object it has always been.
            onChange={n => set({
              countingScores: n === DEFAULT_TEAM_SCORING.countingScores ? undefined : n,
            })}
          />
        </Question>
      )}

      {/* The same format's other option: does the whole team count at the
          finish? Off is what every board has always done, so leaving it
          alone changes nothing. */}
      {offersCountingScores(draft) && (
        <Question n={next()} title="Should every score count on the closing holes?">
          <GrandstandFinishPicker
            value={aggregateFinishOf(draft)}
            // Not stored when it is off, for the same reason as the count.
            onChange={n => set({ aggregateFinish: n > 0 ? n : undefined })}
          />
        </Question>
      )}

      {/* How the rows read, not how they score. A group that never names its
          teams would rather see the players. */}
      {offersTeamNames(draft) && (
        <Question n={next()} title="How should teams be named on the board?">
          <Choice
            on={!draft.hideTeamName}
            label="Team names"
            hint="Each row is the team — Team A, with the players underneath."
            onClick={() => set({ hideTeamName: undefined })}
          />
          <Choice
            on={draft.hideTeamName === true}
            label="Just the players"
            hint="No team name — each row reads as the players themselves."
            onClick={() => set({ hideTeamName: true })}
          />
        </Question>
      )}

      {/* Events only — a trip has no tee sheet to meet, so `askTeeTeams`
          arrives false there and the question never renders. Absent is
          together, because partners almost always play together; only the
          exception is stored (lib/leaderboards.ts `teeTeams`). */}
      {askTeeTeams && offersTeeTeams(draft) && (
        <Question n={next()} title="How do teams meet the tee sheet?">
          <Choice
            on={draft.teeTeams !== 'separate'}
            label="Teams share a tee time"
            hint="Partners go out together — putting one on the sheet books the team."
            // Tightening back to together also tightens the size cap.
            onClick={() => set({
              teeTeams: undefined,
              ...(draft.teamSize && draft.teamSize > MAX_TEAM_SIZE_TOGETHER
                ? { teamSize: MAX_TEAM_SIZE_TOGETHER } : {}),
            })}
          />
          <Choice
            on={draft.teeTeams === 'separate'}
            label="Members can play separately"
            hint="Teammates may go out in different slots, all feeding the same board."
            onClick={() => set({ teeTeams: 'separate' })}
          />
        </Question>
      )}

      {/* Events only, like the tee-teams question above. Absent means the
          organiser assigns — the teams screen as it has always been. 'self'
          opens the teams screen to the field: teams of the chosen size,
          formed and joined without the PIN, named from their members —
          which is why picking it also seeds hideTeamName, so the board's
          rows read as the players too. */}
      {askTeeTeams && offersTeeTeams(draft) && (
        <Question n={next()} title="How are teams formed?">
          <Choice
            on={draft.teamPick !== 'self'}
            label="You assign them"
            hint="Pick the teams yourself on the teams screen — count and members are yours."
            onClick={() => set({ teamPick: undefined, teamSize: undefined })}
          />
          <Choice
            on={draft.teamPick === 'self'}
            label="Players pick their own"
            hint="You set the team size; the field forms and joins teams themselves."
            onClick={() => set({
              teamPick: 'self',
              teamSize: draft.teamSize ?? MIN_TEAM_SIZE,
              hideTeamName: true,
            })}
          />
          {draft.teamPick === 'self' && (
            <div className="mt-1">
              <p className="t-cap text-ink/65 mb-2">Players per team</p>
              <div className="flex gap-1.5">
                {Array.from(
                  {
                    length: (draft.teeTeams === 'separate'
                      ? MAX_TEAM_SIZE_SEPARATE : MAX_TEAM_SIZE_TOGETHER)
                      - MIN_TEAM_SIZE + 1,
                  },
                  (_, i) => MIN_TEAM_SIZE + i,
                ).map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set({ teamSize: n })}
                    aria-pressed={draft.teamSize === n}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      draft.teamSize === n
                        ? 'bg-accent-deep text-white'
                        : 'bg-surface border border-bark/12 text-ink/80 hover:border-bark/25'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
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
              // The tie rule is a prizes question, so it arrives and leaves
              // with the prize table: seeded with golf's answer when the
              // board starts paying by position, cleared when it stops —
              // a totals board must not store an answer it is never asked.
              onClick={() => set({
                combine: c.key,
                customPoints: c.key === 'position' ? defaultCustomPoints(fieldSize) : undefined,
                tieBreak: c.key === 'position' ? (draft.tieBreak ?? DEFAULT_TIE_BREAK) : undefined,
                overallTie: c.key === 'position' ? draft.overallTie : undefined,
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

      {/* Only a board that pays by position is asked. A tie only needs
          breaking where the places are worth something different — on a
          totals board level players simply share the place. */}
      {offersTieBreak(draft) && (
        <Question n={next()} title="How are ties broken?">
          {TIE_BREAKS.map(t => (
            <Choice
              key={t.key}
              on={tieBreakOf(draft) === t.key}
              label={t.label}
              hint={t.hint}
              onClick={() => set({
                tieBreak: t.key,
                // The overall answer belongs to countback. Carrying it across
                // would leave a board storing an answer to a question it is
                // no longer being asked.
                overallTie: t.key === 'countback' ? overallTieOf(draft) : undefined,
              })}
            />
          ))}

          {tieBreakOf(draft) === 'countback' && (
            <div className="pl-3 border-l-2 border-accent/25 flex flex-col gap-2 mt-1">
              <p className="t-cap text-ink/65 leading-snug">
                Each round is settled on its own back 9. And the trip total,
                once the rounds are added up?
              </p>
              {OVERALL_TIES.map(o => (
                <Choice
                  key={o.key}
                  on={overallTieOf(draft) === o.key}
                  label={o.label}
                  hint={o.hint}
                  onClick={() => set({ overallTie: o.key })}
                />
              ))}
            </div>
          )}
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
        <>
          <p className="t-body text-ink/80">
            The draw will be generated at random.
          </p>
          <RoundLinks
            links={draft.roundLinks ?? []}
            rounds={rounds}
            entrantCount={field}
            // The trip's own scale, off the boards it already runs — the
            // draw being made is not one of them and has no scale of its own.
            tripScale={tripQuotaScale(existing)}
            onChange={roundLinks => set({ roundLinks })}
          />
        </>
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
  boards, playerCount, teamCount, rounds = [], readOnly = false, onChange,
  askTeeTeams = false, askTags = false,
}: {
  boards: Leaderboard[]
  /** The field an individual prize table pays out to. */
  playerCount: number
  /** The field a team prize table pays out to. */
  teamCount: number
  /**
   * The trip's golf. Only the matchplay board reads it, to link a bracket
   * round to a round of it — defaulted so every other caller is unaffected.
   */
  rounds?: LinkableRound[]
  /** Shown but not changeable — somebody who is not the trip's owner. */
  readOnly?: boolean
  /**
   * Ask team boards how they meet the tee sheet — events only, because
   * only an event has one. A trip never sees the question and never stores
   * the answer (lib/leaderboards.ts `teeTeams`).
   */
  askTeeTeams?: boolean
  /**
   * Offer a board that ranks tags — events only, for the same reason and
   * with the same shape as `askTeeTeams`: a trip has no organiser to make
   * the sides, and this model does not know what kind of trip is asking.
   */
  askTags?: boolean
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
    // A tags board is not given a sheet, it is pinned to one: the tags are
    // the teams on the tag sheet, which is the sheet every coloured dot on
    // the platform already reads (lib/tagBoards.ts).
    if (isTagBoard(lb)) return { ...lb, teamSet: TAG_SET }
    if (was?.audience === 'team' && was.teamSet && was.teamSet !== TAG_SET) {
      return { ...lb, teamSet: was.teamSet }
    }
    return { ...lb, teamSet: nextSheetId(boards.filter(b => b.id !== lb.id)) }
  }

  function save(lb: Leaderboard) {
    const was = boards.find(b => b.id === lb.id) ?? null
    const next = placed(lb, was)
    let rest = was
      ? boards.map(b => (b.id === next.id ? next : b))
      : [...boards, next]

    // The tag sheet belongs to the tags. An ordinary team board that took
    // it before the tags board existed is moved off rather than left
    // sharing — sharing would silently make the sides into the week's
    // playing teams, which is the one thing tags exist not to be.
    if (isTagBoard(next)) {
      const squatters = rest
        .filter(b => b.id !== next.id && b.audience === 'team'
          && !isTagBoard(b) && setOf(b) === TAG_SET)
        .map(b => b.id)
      if (squatters.length > 0) rest = withSheet(rest, squatters, nextSheetId(rest))
    }

    onChange(rest)
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
            rounds={rounds}
            askTeeTeams={askTeeTeams}
            askTags={askTags}
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
          rounds={rounds}
          askTeeTeams={askTeeTeams}
          askTags={askTags}
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
