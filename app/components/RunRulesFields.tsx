'use client'

import Toggle from './Toggle'
import {
  RUN_ACTIVITIES, TEAM_SCORES, MAX_POINTS, MAX_MIN_KM, MAX_DAILY_CAP,
  type RunActivity, type RulesDraft,
  rulesFromDraft, draftIssue, describeRules, exampleLine, formatPoints,
} from '@/lib/runChallenge'

/**
 * A run challenge's points rules, as a form — the one copy. Challenge setup
 * (step 3) and the organiser area both render this, so the rules are asked
 * the same way wherever they are set, and read back through the same
 * `rulesFromDraft`.
 *
 * Controlled: the caller holds the draft (lib/runChallenge.ts's
 * `RulesDraft`, numbers kept as typed) and decides what a change means —
 * setup keeps it in form state, the organiser area saves it with a button.
 * Below the fields, what the numbers add up to, said back in words, or why
 * they cannot be saved.
 */

/** A number field keeps what was typed; the rules read it through parseRules. */
const numeric = (v: string) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')

const SMALL_INPUT = 'w-20 bg-cream border border-bark/12 rounded-lg px-3 py-2 text-ink text-right tabular-nums focus:outline-none focus:border-accent/50 transition-colors'

function NumberRow({ label, hint, value, onChange, unit, max }: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  unit: string
  max: number
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface border border-bark/12 rounded-2xl p-4">
      <div className="min-w-0">
        <p className="text-ink text-sm font-medium">{label}</p>
        <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{hint}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(numeric(e.target.value))}
          maxLength={String(max).length + 2}
          aria-label={label}
          className={SMALL_INPUT}
        />
        <span className="text-ink/65 text-[13px] w-10">{unit}</span>
      </div>
    </div>
  )
}

export default function RunRulesFields({ draft, onChange, askTeams = true }: {
  draft: RulesDraft
  onChange: (next: RulesDraft) => void
  /** Ask how teams are compared. Always, today; a board without teams one day. */
  askTeams?: boolean
}) {
  const set = (patch: Partial<RulesDraft>) => onChange({ ...draft, ...patch })
  const rules = rulesFromDraft(draft)
  const issue = draftIssue(draft)

  function toggleActivity(key: RunActivity) {
    const on = draft.activities.includes(key)
    set({
      activities: on
        ? draft.activities.filter(a => a !== key)
        : RUN_ACTIVITIES.map(a => a.key).filter(k => k === key || draft.activities.includes(k)),
    })
  }

  return (
    <div className="space-y-3">
      <NumberRow
        label="Points per km"
        hint="For every kilometre of a run that counts."
        value={draft.perKm} onChange={v => set({ perKm: v })} unit="pts" max={MAX_POINTS}
      />
      <NumberRow
        label="Points per run"
        hint="For the run itself — turning up is worth something."
        value={draft.perRun} onChange={v => set({ perRun: v })} unit="pts" max={MAX_POINTS}
      />
      <NumberRow
        label="Shortest run that counts"
        hint="Anything shorter earns nothing."
        value={draft.minKm} onChange={v => set({ minKm: v })} unit="km" max={MAX_MIN_KM}
      />

      <div className="bg-surface border border-bark/12 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium">Daily limit</p>
            <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
              The most points one person can earn in a day — keeps it a
              challenge rather than an ultramarathon.
            </p>
          </div>
          <Toggle checked={draft.capOn} onChange={on => set({ capOn: on })} label="Limit points per day" />
        </div>
        {draft.capOn && (
          <div className="flex items-center justify-end gap-2 mt-3">
            <input
              type="text"
              inputMode="decimal"
              value={draft.cap}
              onChange={e => set({ cap: numeric(e.target.value) })}
              maxLength={String(MAX_DAILY_CAP).length + 2}
              aria-label="Most points a day"
              className={SMALL_INPUT}
            />
            <span className="text-ink/65 text-[13px] w-10">pts</span>
          </div>
        )}
      </div>

      <div className="bg-surface border border-bark/12 rounded-2xl p-4">
        <p className="text-ink text-sm font-medium">What counts</p>
        <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
          Which activities earn points.
        </p>
        <div className="flex flex-wrap gap-2">
          {RUN_ACTIVITIES.map(a => (
            <button
              key={a.key}
              type="button"
              onClick={() => toggleActivity(a.key)}
              aria-pressed={draft.activities.includes(a.key)}
              className={`px-3 py-2 rounded-xl text-sm transition-colors ${
                draft.activities.includes(a.key)
                  ? 'bg-accent-deep text-white'
                  : 'bg-cream border border-bark/12 text-ink/80 hover:border-bark/25'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {askTeams && (
        <div className="bg-surface border border-bark/12 rounded-2xl p-4">
          <p className="text-ink text-sm font-medium">How teams are compared</p>
          <div className="space-y-2 mt-3">
            {TEAM_SCORES.map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => set({ teamScore: s.key })}
                aria-pressed={draft.teamScore === s.key}
                className={`w-full text-left rounded-xl px-4 py-3 border transition-colors ${
                  draft.teamScore === s.key
                    ? 'border-accent/60 bg-accent/[0.08]'
                    : 'border-bark/12 bg-cream hover:border-bark/25'
                }`}
              >
                <p className="text-ink text-sm font-medium">{s.label}</p>
                <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{s.hint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* What the numbers add up to, said back in words. */}
      <div className="px-4 py-3.5 bg-accent/[0.08] border border-accent/30 rounded-xl">
        {issue ? (
          <p className="text-rust-deep text-sm leading-snug">{issue}</p>
        ) : (
          <>
            <p className="text-ink text-sm font-medium">{exampleLine(rules)}</p>
            <ul className="mt-1.5 space-y-0.5">
              {describeRules(rules).map(line => (
                <li key={line} className="text-ink/80 text-[13px] leading-snug">{line}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {rules.pointsPerKm === MAX_POINTS || rules.pointsPerRun === MAX_POINTS ? (
        <p className="text-ink/65 text-[13px] leading-snug">
          Points top out at {formatPoints(MAX_POINTS)} per km or per run.
        </p>
      ) : null}
    </div>
  )
}
