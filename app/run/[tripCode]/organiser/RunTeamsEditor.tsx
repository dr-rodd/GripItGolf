'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isDuplicateNameError } from '@/lib/roster'
import { MAIN_SET } from '@/lib/teamSets'
import { setTeam } from '@/lib/teamMembers'
import {
  MAX_RUNNER_NAME, MAX_TEAM_NAME,
  runnerNameIssue, teamNameIssue, nextTeamColor, canRemoveTeam,
} from '@/lib/runChallenge'
import type { RunTeam, RunMember } from '../data'
import { FIELD, buttonClass, cardClass } from '@/app/components/ui'

/**
 * The organiser's teams: everything about who runs for whom, behind the PIN.
 *
 * Teams are added, renamed, and removed once empty — everyone runs for a
 * team, so a team with runners in it cannot be deleted out from under them
 * (`canRemoveTeam`); move them first. Runners are added by name (unclaimed
 * until the person taps it on the join screen), renamed, moved, or removed.
 *
 * **The database is the state.** Every change is one write and then
 * `router.refresh()`, which re-reads the challenge on the server and hands
 * this component fresh props — so the screen always shows what was saved,
 * never a guess, and two organisers on two phones converge on the next
 * refresh. Membership goes through the one writer (`setTeam`); every other
 * write is filtered on the trip as well as the row.
 *
 * Errors are said in the card where the tap happened, calmly.
 */

// A team's row is dense — a name field and two or three buttons across a
// phone — so the field and the buttons are the dense sizes: 44px tall.
const INPUT = `${FIELD} field-dense min-w-0`
const SAVE = `${buttonClass('primary', false, true)} flex-shrink-0`
const QUIET = `${buttonClass('secondary', false, true)} flex-shrink-0`
const DANGER = `${buttonClass('danger', false, true)} flex-shrink-0`

export default function RunTeamsEditor({ tripId, teams, unassigned }: {
  tripId: string
  teams: RunTeam[]
  unassigned: RunMember[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [writing, setWriting] = useState(false)
  const busy = writing || pending

  // One thing open at a time: a team being renamed, a runner being edited,
  // a team's add-runner box, or the add-team box.
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<{ at: string; msg: string } | null>(null)

  const roster = [...teams.flatMap(t => t.members), ...unassigned]

  function openBox(key: string, initial = '') {
    setOpen(prev => prev === key ? null : key)
    setDraft(initial)
    setError(null)
  }

  /** One write, then re-read everything from the server. */
  async function write(at: string, run: () => Promise<string | null>) {
    if (busy) return
    setWriting(true)
    setError(null)
    const msg = await run()
    setWriting(false)
    if (msg) {
      setError({ at, msg })
      return
    }
    setOpen(null)
    setDraft('')
    startTransition(() => router.refresh())
  }

  // ── Teams ──

  function addTeam() {
    const issue = teamNameIssue(draft, teams)
    if (issue) { setError({ at: 'new-team', msg: issue }); return }
    write('new-team', async () => {
      const { error: err } = await supabase
        .from('teams')
        .insert({ trip_id: tripId, name: draft.trim(), color: nextTeamColor(teams.length) })
      return err ? 'Could not add the team — try again.' : null
    })
  }

  function renameTeam(team: RunTeam) {
    const issue = teamNameIssue(draft, teams, team.id)
    if (issue) { setError({ at: team.id, msg: issue }); return }
    write(team.id, async () => {
      const { error: err } = await supabase
        .from('teams')
        .update({ name: draft.trim() })
        .eq('id', team.id)
        .eq('trip_id', tripId)
      return err ? 'Could not rename the team — try again.' : null
    })
  }

  function removeTeam(team: RunTeam) {
    if (!canRemoveTeam(team.members.length)) {
      setError({ at: team.id, msg: 'Move its runners to another team first.' })
      return
    }
    write(team.id, async () => {
      const { error: err } = await supabase
        .from('teams')
        .delete()
        .eq('id', team.id)
        .eq('trip_id', tripId)
      return err ? 'Could not remove the team — try again.' : null
    })
  }

  // ── Runners ──

  function addRunner(team: RunTeam) {
    const at = `add:${team.id}`
    const issue = runnerNameIssue(draft, roster)
    if (issue) { setError({ at, msg: issue }); return }
    write(at, async () => {
      const { data, error: err } = await supabase
        .from('players')
        .insert({ trip_id: tripId, name: draft.trim(), role: 'player', claimed: false, team_id: null })
        .select('id')
        .single()
      if (err || !data) {
        return isDuplicateNameError(err)
          ? `${draft.trim()} is already in this challenge.`
          : 'Could not add the runner — try again.'
      }
      const failure = await setTeam(tripId, data.id, MAIN_SET, team.id)
      return failure ? 'Added, but not to the team — they are under No team; move them from there.' : null
    })
  }

  function renameRunner(m: RunMember) {
    const at = `runner:${m.id}`
    const issue = runnerNameIssue(draft, roster, m.id)
    if (issue) { setError({ at, msg: issue }); return }
    write(at, async () => {
      const { error: err } = await supabase
        .from('players')
        .update({ name: draft.trim() })
        .eq('id', m.id)
        .eq('trip_id', tripId)
      if (!err) return null
      return isDuplicateNameError(err)
        ? `${draft.trim()} is already in this challenge.`
        : 'Could not rename them — try again.'
    })
  }

  function moveRunner(m: RunMember, teamId: string) {
    write(`runner:${m.id}`, async () => {
      const failure = await setTeam(tripId, m.id, MAIN_SET, teamId)
      return failure ? 'Could not move them — try again.' : null
    })
  }

  function removeRunner(m: RunMember) {
    if (!window.confirm(`Remove ${m.name} from the challenge?`)) return
    write(`runner:${m.id}`, async () => {
      const { error: err } = await supabase
        .from('players')
        .delete()
        .eq('id', m.id)
        .eq('trip_id', tripId)
      return err ? 'Could not remove them — try again.' : null
    })
  }

  // ── Render ──

  const errorFor = (at: string) => error?.at === at
    ? <p className="text-rust-deep text-[13px] mt-2 leading-snug">{error.msg}</p>
    : null

  // A function returning markup, not a component: a component declared in
  // here would be a new type every render, remounting the row — and its
  // rename box would lose focus on every keystroke.
  function runnerRow(m: RunMember, teamId: string | null) {
    const key = `runner:${m.id}`
    const isOpen = open === key
    return (
      <li key={m.id} className="border-t border-bark/12 first:border-t-0">
        <button
          type="button"
          onClick={() => openBox(key, m.name)}
          aria-expanded={isOpen}
          className="w-full flex items-center gap-3 py-2.5 text-left"
        >
          <span className="text-ink text-sm flex-1 min-w-0 truncate">{m.name}</span>
          <span className={`t-cap flex-shrink-0 ${m.claimed ? 'text-accent-deep' : 'text-ink/65'}`}>
            {m.claimed ? 'Joined' : 'Not joined yet'}
          </span>
        </button>
        {isOpen && (
          <div className="pb-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                maxLength={MAX_RUNNER_NAME}
                aria-label={`Rename ${m.name}`}
                className={INPUT}
              />
              <button type="button" onClick={() => renameRunner(m)}
                disabled={busy || !draft.trim() || draft.trim() === m.name} className={SAVE}>
                Save
              </button>
            </div>
            <div className="flex gap-2">
              <select
                value={teamId ?? ''}
                onChange={e => e.target.value && moveRunner(m, e.target.value)}
                disabled={busy || teams.length === 0}
                aria-label={`Move ${m.name} to another team`}
                className={`${INPUT} flex-1`}
              >
                {teamId === null && <option value="">Put on a team…</option>}
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.id === teamId ? `On ${t.name}` : `Move to ${t.name}`}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => removeRunner(m)} disabled={busy} className={DANGER}>
                Remove
              </button>
            </div>
            {errorFor(key)}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-3">
      {teams.map(team => {
        const renaming = open === `team:${team.id}`
        const adding = open === `add:${team.id}`
        return (
          <div key={team.id} className={`p-4 ${cardClass()}`}>
            {/* The team itself */}
            {renaming ? (
              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    maxLength={MAX_TEAM_NAME}
                    aria-label={`Rename ${team.name}`}
                    className={INPUT}
                    autoFocus
                  />
                  <button type="button" onClick={() => renameTeam(team)}
                    disabled={busy || !draft.trim() || draft.trim() === team.name} className={SAVE}>
                    Save
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => openBox(`team:${team.id}`)} className={QUIET}>
                    Cancel
                  </button>
                  {canRemoveTeam(team.members.length) && (
                    <button type="button" onClick={() => removeTeam(team)} disabled={busy} className={DANGER}>
                      Remove team
                    </button>
                  )}
                </div>
                {errorFor(team.id)}
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} aria-hidden="true" />
                <p className="text-ink text-sm font-medium flex-1 min-w-0 truncate">{team.name}</p>
                <span className="text-ink/65 text-[13px] tabular-nums flex-shrink-0">
                  {team.members.length === 1 ? '1 runner' : `${team.members.length} runners`}
                </span>
                <button
                  type="button"
                  onClick={() => openBox(`team:${team.id}`, team.name)}
                  className="t-cap text-accent-deep hover:text-accent transition-colors flex-shrink-0 pl-2"
                >
                  Edit
                </button>
              </div>
            )}

            {/* Its runners */}
            {team.members.length > 0 && (
              <ul className="mt-2">
                {team.members.map(m => runnerRow(m, team.id))}
              </ul>
            )}

            {/* Adding one */}
            {adding ? (
              <div className="mt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Runner's name"
                    maxLength={MAX_RUNNER_NAME}
                    aria-label={`Add a runner to ${team.name}`}
                    className={INPUT}
                    autoFocus
                  />
                  <button type="button" onClick={() => addRunner(team)}
                    disabled={busy || !draft.trim()} className={SAVE}>
                    Add
                  </button>
                </div>
                {errorFor(`add:${team.id}`)}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openBox(`add:${team.id}`)}
                className="mt-2 text-ink/65 text-[13px] hover:text-ink/80 transition-colors"
              >
                + Add a runner
              </button>
            )}
          </div>
        )
      })}

      {/* Nobody should be here — joining needs a team — but a failed write
          could leave somebody, and they are shown rather than vanishing. */}
      {unassigned.length > 0 && (
        <div className={`border-rust/30 p-4 ${cardClass()}`}>
          <p className="text-rust-deep text-sm font-medium">No team yet</p>
          <ul className="mt-2">
            {unassigned.map(m => runnerRow(m, null))}
          </ul>
        </div>
      )}

      {/* A new team */}
      {open === 'new-team' ? (
        <div className={`p-4 ${cardClass()}`}>
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Team name"
              maxLength={MAX_TEAM_NAME}
              aria-label="New team name"
              className={INPUT}
              autoFocus
            />
            <button type="button" onClick={addTeam} disabled={busy || !draft.trim()} className={SAVE}>
              Add
            </button>
          </div>
          {errorFor('new-team')}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => openBox('new-team')}
          className="w-full py-4 border border-dashed border-bark/25 rounded-xl text-ink/65 text-sm hover:text-ink/80 transition-colors"
        >
          + Add a team
        </button>
      )}
    </div>
  )
}
