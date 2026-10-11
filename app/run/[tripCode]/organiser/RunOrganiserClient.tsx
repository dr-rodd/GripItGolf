'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import EventPermissionToggles from '@/app/components/EventPermissionToggles'
import { RUN_PERMISSIONS, type RunPermissions } from '@/lib/runChallenge'
import type { RunChallenge } from '../data'
import { TeamsList, RulesSummary, SectionTitle } from '../RunPieces'

/**
 * The organiser area's body, once the PIN is in.
 *
 * Permissions save the moment a toggle moves — the whole run map, written
 * over `trips.event_permissions` — and roll back with a calm line if the
 * write is refused. Teams and rules are shown as they stand; changing them
 * is the next stage's work, and the page says so rather than pretending.
 */
export default function RunOrganiserClient({ challenge, dates, progress }: {
  challenge: RunChallenge
  dates: string | null
  progress: string
}) {
  const [perms, setPerms] = useState<RunPermissions>(challenge.perms)
  const [permsError, setPermsError] = useState<string | null>(null)

  const runners = challenge.teams.reduce((n, t) => n + t.members.length, 0) + challenge.unassigned.length

  async function savePermissions(next: RunPermissions) {
    const prev = perms
    setPerms(next)
    setPermsError(null)

    const { error } = await supabase
      .from('trips')
      .update({ event_permissions: next })
      .eq('id', challenge.id)

    if (error) {
      setPerms(prev)
      setPermsError(/column|schema cache/i.test(error.message ?? '')
        ? 'Could not save — a database update may not have been applied yet.'
        : 'Could not save that change — try again.')
    }
  }

  return (
    <main className="min-h-dvh bg-cream">
      <TripHeader backTo={`/run/${challenge.code}`} />

      <div className="max-w-lg mx-auto px-4 pt-8 pb-16 page-enter space-y-8">

        <div>
          <p className="t-cap uppercase tracking-[0.12em] text-accent-deep mb-1.5">Organiser area</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink leading-tight">
            {challenge.name}
          </h1>
        </div>

        {/* ── The bird's-eye view ── */}
        <div className="bg-surface border border-bark/12 rounded-2xl p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="t-cap text-ink/65">Dates</dt>
              <dd className="text-ink text-sm mt-0.5">{dates ?? '—'}</dd>
            </div>
            <div>
              <dt className="t-cap text-ink/65">Status</dt>
              <dd className="text-ink text-sm mt-0.5">{progress || '—'}</dd>
            </div>
            <div>
              <dt className="t-cap text-ink/65">Code</dt>
              <dd className="text-ink text-sm mt-0.5 tracking-[0.12em] font-medium">{challenge.code}</dd>
            </div>
            <div>
              <dt className="t-cap text-ink/65">Field</dt>
              <dd className="text-ink text-sm mt-0.5">
                {runners === 1 ? '1 runner' : `${runners} runners`} ·{' '}
                {challenge.teams.length === 1 ? '1 team' : `${challenge.teams.length} teams`}
              </dd>
            </div>
          </dl>
          <Link
            href={`/run/${challenge.code}`}
            className="inline-block t-cap text-accent-deep hover:text-accent transition-colors mt-4"
          >
            Open the challenge →
          </Link>
        </div>

        {/* ── What the field may do ── */}
        <section>
          <SectionTitle>Participant permissions</SectionTitle>
          <EventPermissionToggles
            registry={RUN_PERMISSIONS}
            value={perms}
            onChange={savePermissions}
          />
          {permsError && (
            <p className="text-rust-deep text-sm mt-3 leading-snug">{permsError}</p>
          )}
        </section>

        {/* ── The teams, as they stand ── */}
        <section>
          <SectionTitle>Teams</SectionTitle>
          <TeamsList teams={challenge.teams} unassigned={challenge.unassigned} />
          <p className="text-ink/65 text-[13px] mt-3 leading-snug">
            Adding, renaming and moving people between teams arrives in the
            next update.
          </p>
        </section>

        {/* ── The rules, as they stand ── */}
        <section>
          <SectionTitle>How points work</SectionTitle>
          <RulesSummary setup={challenge.setup} />
          <p className="text-ink/65 text-[13px] mt-3 leading-snug">
            Changing the rules arrives with the leaderboard.
          </p>
        </section>
      </div>
    </main>
  )
}
