import {
  type RunSetup, describeRules, describeTeamScore,
} from '@/lib/runChallenge'
import type { RunTeam, RunMember } from './data'

/**
 * The pieces of a run challenge both its pages print — the hub and the
 * organiser area — so a team or a rule cannot read one way on one screen
 * and another way on the other. Plain components, no state.
 */

export function TeamsList({ teams, unassigned }: {
  teams: RunTeam[]
  unassigned: RunMember[]
}) {
  return (
    <div className="space-y-2">
      {teams.map(t => (
        <div key={t.id} className="bg-surface border border-bark/12 rounded-2xl p-4">
          <div className="flex items-center gap-2.5">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: t.color }}
              aria-hidden="true"
            />
            <p className="text-ink text-sm font-medium flex-1 min-w-0 truncate">{t.name}</p>
            <span className="text-ink/65 text-[13px] tabular-nums flex-shrink-0">
              {t.members.length === 1 ? '1 runner' : `${t.members.length} runners`}
            </span>
          </div>
          <p className="text-ink/65 text-[13px] mt-1.5 leading-snug pl-[1.375rem]">
            {t.members.length > 0
              ? t.members.map(m => m.name).join(', ')
              : 'Nobody yet.'}
          </p>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="bg-surface border border-rust/30 rounded-2xl p-4">
          <p className="text-rust-deep text-sm font-medium">No team yet</p>
          <p className="text-ink/65 text-[13px] mt-1 leading-snug">
            {unassigned.map(m => m.name).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

export function RulesSummary({ setup }: { setup: RunSetup }) {
  const teamBoard = setup.boards.find(b => b.audience === 'team')
  return (
    <div className="bg-surface border border-bark/12 rounded-2xl p-4">
      <ul className="space-y-1">
        {describeRules(setup.rules).map(line => (
          <li key={line} className="text-ink/80 text-sm leading-snug">{line}</li>
        ))}
        {teamBoard && (
          <li className="text-ink/80 text-sm leading-snug">
            {describeTeamScore(teamBoard.teamScore)}
          </li>
        )}
      </ul>
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="t-cap uppercase tracking-[0.12em] text-ink/65 mb-2.5">{children}</h2>
  )
}
