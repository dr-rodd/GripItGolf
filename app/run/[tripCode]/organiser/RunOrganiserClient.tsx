'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import EventPermissionToggles from '@/app/components/EventPermissionToggles'
import { RUN_PERMISSIONS, type RunPermissions, describeDay } from '@/lib/runChallenge'
import type { RunChallenge } from '../data'
import { SectionTitle } from '../RunPieces'
import RunTeamsEditor from './RunTeamsEditor'
import RunRulesEditor from './RunRulesEditor'
import RunDatesEditor from './RunDatesEditor'
import { cardClass } from '@/app/components/ui'

/**
 * The organiser area's body, once the PIN is in.
 *
 * Permissions save the moment a toggle moves — the whole run map, written
 * over `trips.event_permissions` — and roll back with a calm line if the
 * write is refused. Teams are edited here in full (RunTeamsEditor), and so
 * are the points rules (RunRulesEditor) — a saved change re-counts every
 * run on every board, because points are never stored — and the dates
 * (RunDatesEditor), until the challenge is final.
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
    <main className="min-h-dvh paper has-tabbar">
      <TripHeader backTo={`/run/${challenge.code}`} />

      <div className="max-w-lg mx-auto px-4 pt-8 pb-16 page-enter space-y-8">

        <div>
          <p className="t-label text-accent-deep mb-1.5">Organiser area</p>
          <h1 className="t-h1 text-ink">
            {challenge.name}
          </h1>
        </div>

        {/* ── The bird's-eye view ── */}
        <div className={`p-5 ${cardClass()}`}>
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
              <dd className="t-code text-ink text-sm mt-0.5">{challenge.code}</dd>
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

        {/* ── The dates — extend, or move, until the result is frozen ── */}
        <section>
          <SectionTitle>Dates</SectionTitle>
          {challenge.final ? (
            <p className="text-ink/65 text-[13px] leading-snug">
              Final — the standings were frozen on {describeDay(challenge.final.frozenOn)}, so the
              dates can no longer change.
            </p>
          ) : (
            <>
              <p className="text-ink/65 text-[13px] mb-3 leading-snug">
                Late runs count for three days after the finish; then the standings freeze and
                every Strava connection ends. Extending the finish moves all of that with it.
              </p>
              <RunDatesEditor tripId={challenge.id} start={challenge.startDate} end={challenge.endDate} />
            </>
          )}
        </section>

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

        {/* ── The teams: add, rename, move people, remove ── */}
        <section>
          <SectionTitle>Teams</SectionTitle>
          <p className="text-ink/65 text-[13px] mb-3 leading-snug">
            Tap a runner to rename, move or remove them. A team can be
            removed once it is empty.
          </p>
          <RunTeamsEditor
            tripId={challenge.id}
            teams={challenge.teams}
            unassigned={challenge.unassigned}
          />
        </section>

        {/* ── The points rules — change them, and every board re-counts ── */}
        <section>
          <SectionTitle>How points work</SectionTitle>
          <RunRulesEditor tripId={challenge.id} setup={challenge.setup} />
        </section>
      </div>
    </main>
  )
}
