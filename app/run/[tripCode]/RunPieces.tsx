import BackButton from '@/app/components/BackButton'
import {
  type RunSetup, describeRules, describeTeamScore,
} from '@/lib/runChallenge'
import type { RunTeam, RunMember } from './data'
import { cardClass } from '@/app/components/ui'

/**
 * The pieces of a run challenge both its pages print — the hub and the
 * organiser area — so a team or a rule cannot read one way on one screen
 * and another way on the other. Plain components, no state.
 */

export function TeamsList({ teams, unassigned, viewerId = null }: {
  teams: RunTeam[]
  unassigned: RunMember[]
  /** The runner holding this phone, named as "you" in their team. */
  viewerId?: string | null
}) {
  const named = (m: RunMember) => m.id === viewerId ? `${m.name} (you)` : m.name
  return (
    <div className="space-y-2">
      {teams.map(t => (
        <div key={t.id} className={`p-4 ${cardClass()}`}>
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
              ? t.members.map(named).join(', ')
              : 'Nobody yet.'}
          </p>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className={`border-rust/30 p-4 ${cardClass()}`}>
          <p className="text-rust-deep text-sm font-medium">No team yet</p>
          <p className="text-ink/65 text-[13px] mt-1 leading-snug">
            {unassigned.map(named).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

export function RulesSummary({ setup }: { setup: RunSetup }) {
  const teamBoard = setup.boards.find(b => b.audience === 'team')
  return (
    <div className={`p-4 ${cardClass()}`}>
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
    <h2 className="t-label text-ink/80 mb-2.5">{children}</h2>
  )
}

/** The calm page a code nobody owns gets — every run route's one copy. */
export function ChallengeNotFound() {
  return (
    <main className="min-h-dvh has-tabbar flex flex-col items-center justify-center paper px-6">
      <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
        Challenge not found
      </p>
      <p className="text-ink/65 text-sm mb-8">Check the code and try again.</p>
      <BackButton href="/" label="Home" />
    </main>
  )
}

/** A quiet notice card — a missing database update, a closed door. */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className={`px-4 py-3.5 ${cardClass()}`}>
      <p className="text-ink/80 text-sm leading-snug">{children}</p>
    </div>
  )
}
