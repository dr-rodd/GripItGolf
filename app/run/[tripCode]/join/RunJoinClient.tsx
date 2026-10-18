'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'
import { rememberPlayer } from '@/lib/playerCookie'
import { isDuplicateNameError, sortForClaiming } from '@/lib/roster'
import { MAIN_SET } from '@/lib/teamSets'
import { setTeam } from '@/lib/teamMembers'
import {
  MAX_RUNNER_NAME, MAX_TEAM_NAME,
  runnerNameIssue, teamNameIssue, nextTeamColor, joinChoices,
} from '@/lib/runChallenge'
import type { RunRosterEntry } from '../data'
import { FIELD, buttonClass, cardClass, optionClass } from '@/app/components/ui'

/**
 * The join screen's two steps: who you are, then which team.
 *
 * **Who.** Tap your name if the organiser added it — or if you have already
 * joined on another phone, in which case nothing is written and this phone
 * is simply linked too. Or, when the challenge lets people join by
 * themselves, type a new name.
 *
 * **Which team.** Pick one, or start one when the challenge allows it. A
 * name the organiser already put on a team skips this step. Nobody finishes
 * without a team — that is the rule the whole challenge rests on.
 *
 * Writes go in the platform's order — a new team, then the player, then the
 * membership through the one writer (`setTeam`, which keeps
 * `players.team_id` in step). Nothing is claimed until the team step is
 * done, so walking away halfway leaves the roster as it was. If the
 * membership alone fails, the runner exists and is kept, and the screen
 * stays on the team step to try again rather than creating them twice.
 *
 * Linking the phone follows golf's rule exactly: remember the player, then
 * `router.refresh()` before navigating, or the router serves back a home
 * page rendered for whoever this phone was a moment ago.
 */

type Team = { id: string; name: string; color: string; count: number }
type Who =
  | { kind: 'claim'; entry: RunRosterEntry }
  | { kind: 'new'; name: string }
type TeamChoice =
  | { kind: 'existing'; id: string }
  | { kind: 'new' }

const CARD = optionClass(false, 'row')
const CARD_ON = optionClass(true, 'row')
const INPUT = FIELD
const PRIMARY = buttonClass('primary')

export default function RunJoinClient({
  tripId, code, name, roster, teams, choices, viewerId,
}: {
  tripId: string
  code: string
  name: string
  roster: RunRosterEntry[]
  teams: Team[]
  choices: ReturnType<typeof joinChoices>
  viewerId: string | null
}) {
  const router = useRouter()
  const [step, setStep] = useState<'who' | 'team'>('who')
  const [who, setWho] = useState<Who | null>(null)
  const [newName, setNewName] = useState('')
  const [choice, setChoice] = useState<TeamChoice | null>(null)
  const [newTeam, setNewTeam] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const viewer = roster.find(r => r.id === viewerId) ?? null
  const teamName = (id: string | null) => teams.find(t => t.id === id)?.name ?? null
  const teamColor = (id: string | null) => teams.find(t => t.id === id)?.color

  /** Remember them here, throw away pages rendered for the old cookie, go home. */
  function finish(playerId: string) {
    rememberPlayer(code, playerId)
    router.refresh()
    router.push(`/run/${code}`)
  }

  // ── Step 1 · who ──

  async function tapName(entry: RunRosterEntry) {
    if (busy) return
    setError(null)
    // Already joined (on another phone, usually): link this one too.
    if (entry.claimed) {
      setBusy(true)
      finish(entry.id)
      return
    }
    // Added by the organiser with no team yet: the team step comes first,
    // and the claim is written with it.
    if (!entry.teamId) {
      setWho({ kind: 'claim', entry })
      setChoice(null)
      setStep('team')
      return
    }
    // Added by the organiser, on a team: claim it and go.
    setBusy(true)
    const { error: err } = await supabase
      .from('players')
      .update({ claimed: true })
      .eq('id', entry.id)
      .eq('trip_id', tripId)
    if (err) {
      setBusy(false)
      setError('Could not claim that name — try again.')
      return
    }
    finish(entry.id)
  }

  const newNameIssue = newName.trim() ? runnerNameIssue(newName, roster) : null

  function continueAsNew(e: React.FormEvent) {
    e.preventDefault()
    if (runnerNameIssue(newName, roster)) return
    setError(null)
    setWho({ kind: 'new', name: newName.trim() })
    setChoice(null)
    setStep('team')
  }

  // ── Step 2 · which team ──

  const newTeamIssue = choice?.kind === 'new' ? teamNameIssue(newTeam, teams) : null
  const canJoin = !busy && !!who && !!choice && !newTeamIssue
  const joinLabel = choice?.kind === 'existing'
    ? `Join ${teamName(choice.id) ?? 'team'}`
    : choice?.kind === 'new' && newTeam.trim() ? `Start ${newTeam.trim()}` : 'Join'

  async function join() {
    if (!canJoin || !who || !choice) return
    setBusy(true)
    setError(null)

    // 1. A new team, when starting one.
    let teamId = choice.kind === 'existing' ? choice.id : null
    let createdTeam: string | null = null
    if (choice.kind === 'new') {
      const { data, error: err } = await supabase
        .from('teams')
        .insert({ trip_id: tripId, name: newTeam.trim(), color: nextTeamColor(teams.length) })
        .select('id')
        .single()
      if (err || !data) {
        setBusy(false)
        setError('Could not start the team — try again.')
        return
      }
      teamId = data.id
      createdTeam = data.id
    }
    if (!teamId) { setBusy(false); return }

    // 2. The runner: a new one, or the organiser's name, claimed now.
    let playerId: string
    if (who.kind === 'new') {
      const { data, error: err } = await supabase
        .from('players')
        .insert({ trip_id: tripId, name: who.name, role: 'player', claimed: true, team_id: null })
        .select('id')
        .single()
      if (err || !data) {
        // Leave nothing behind for a join that did not happen.
        if (createdTeam) {
          await supabase.from('teams').delete().eq('id', createdTeam).eq('trip_id', tripId)
        }
        setBusy(false)
        setError(isDuplicateNameError(err)
          ? `${who.name} is already in this challenge — if that's you, go back and tap your name.`
          : 'Could not add you — try again.')
        return
      }
      playerId = data.id
    } else {
      const { error: err } = await supabase
        .from('players')
        .update({ claimed: true })
        .eq('id', who.entry.id)
        .eq('trip_id', tripId)
      if (err) {
        setBusy(false)
        setError('Could not claim that name — try again.')
        return
      }
      playerId = who.entry.id
    }

    // 3. The team, through the one membership writer.
    const failure = await setTeam(tripId, playerId, MAIN_SET, teamId)
    if (failure) {
      // The runner exists now — keep them, and let the retry only pick the
      // team, so nobody is created twice.
      rememberPlayer(code, playerId)
      setWho({ kind: 'claim', entry: { id: playerId, name: who.kind === 'new' ? who.name : who.entry.name, claimed: true, isLead: false, teamId: null } })
      setChoice({ kind: 'existing', id: teamId })
      setBusy(false)
      setError('You\'re in, but your team did not save — tap Join to try again.')
      return
    }
    finish(playerId)
  }

  // ── Render ──

  if (choices.closed) {
    return (
      <div className="text-center">
        <h1 className="t-h1 text-ink mb-2">{name}</h1>
        <p className="text-ink/65 text-sm mb-8">This challenge has finished — joining is closed.</p>
        <Link href={`/run/${code}`} className="t-cap text-accent-deep hover:text-accent transition-colors">
          Back to the challenge →
        </Link>
      </div>
    )
  }

  if (step === 'team' && who) {
    const runnerName = who.kind === 'new' ? who.name : who.entry.name
    return (
      <div>
        <div className="mb-4">
          <BackButton onClick={() => { setStep('who'); setError(null) }} />
        </div>
        <h1 className="t-h1 text-ink mb-1.5">Pick your team</h1>
        <p className="text-ink/65 text-sm mb-6">You&apos;re running as {runnerName}.</p>

        <div className="space-y-2" role="radiogroup" aria-label="Teams">
          {teams.map(t => {
            const on = choice?.kind === 'existing' && choice.id === t.id
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={on}
                onClick={() => setChoice({ kind: 'existing', id: t.id })}
                className={on ? CARD_ON : CARD}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} aria-hidden="true" />
                <span className="text-ink text-sm font-medium flex-1 min-w-0 truncate">{t.name}</span>
                <span className="text-ink/65 text-[13px] tabular-nums flex-shrink-0">
                  {t.count === 1 ? '1 runner' : `${t.count} runners`}
                </span>
              </button>
            )
          })}

          {choices.startTeam && (
            <div className={`px-4 py-3.5 ${cardClass(choice?.kind === 'new' ? 'chosen' : 'raised')}`}>
              {choice?.kind === 'new' ? (
                <>
                  <p className="text-ink text-sm font-medium mb-2">Start a new team</p>
                  <input
                    type="text"
                    value={newTeam}
                    onChange={e => setNewTeam(e.target.value)}
                    placeholder="Team name"
                    maxLength={MAX_TEAM_NAME}
                    className={INPUT}
                    autoFocus
                  />
                  {newTeam.trim() && newTeamIssue && (
                    <p className="text-rust-deep text-[13px] mt-2 leading-snug">{newTeamIssue}</p>
                  )}
                </>
              ) : (
                <button onClick={() => setChoice({ kind: 'new' })} className="w-full text-left text-ink/80 text-sm">
                  + Start a new team
                </button>
              )}
            </div>
          )}

          {teams.length === 0 && !choices.startTeam && (
            <p className="text-ink/65 text-sm leading-snug">
              There are no teams yet — ask the organiser to add one.
            </p>
          )}
        </div>

        {error && (
          <div className="mt-6 p-4 bg-rust/10 border border-rust/30 rounded-xl">
            <p className="text-rust-deep text-sm">{error}</p>
          </div>
        )}

        <div className="mt-8">
          <button onClick={join} disabled={!canJoin} className={PRIMARY}>
            {busy ? 'Joining…' : joinLabel}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 1 · who ──
  const listed = sortForClaiming(roster)
  return (
    <div>
      <h1 className="t-h1 text-ink mb-1.5">Join {name}</h1>
      <p className="text-ink/65 text-sm mb-6">
        {viewer
          ? `This phone is ${viewer.name}. Pick a different name to switch.`
          : 'Find your name, or add yourself — then pick your team.'}
      </p>

      {choices.nothing && (
        <div className={`px-4 py-3.5 ${cardClass()}`}>
          <p className="text-ink/80 text-sm leading-snug">
            Joining by yourself is switched off for this challenge. Ask the
            organiser to add your name, then come back and tap it here.
          </p>
        </div>
      )}

      {choices.claim && (
        <section className="mb-8">
          <h2 className="t-label text-ink/80 mb-2.5">Find your name</h2>
          <div className="space-y-2">
            {listed.map(r => (
              <button
                key={r.id}
                onClick={() => tapName(r)}
                disabled={busy}
                className={`${CARD} disabled:opacity-60`}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: teamColor(r.teamId) ?? 'transparent' }}
                  aria-hidden="true"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-ink text-sm font-medium truncate">
                    {r.name}{r.id === viewerId ? ' (this phone)' : ''}
                  </span>
                  <span className="block text-ink/65 text-[13px] truncate">
                    {teamName(r.teamId) ?? 'No team yet'}
                  </span>
                </span>
                {r.claimed && (
                  <span className="t-cap text-accent-deep flex-shrink-0">Joined</span>
                )}
              </button>
            ))}
          </div>
          {!choices.addSelf && (
            <p className="text-ink/65 text-[13px] mt-3 leading-snug">
              Can&apos;t see your name? Ask the organiser to add it.
            </p>
          )}
        </section>
      )}

      {choices.addSelf && (
        <section>
          <h2 className="t-label text-ink/80 mb-2.5">
            {choices.claim ? 'New here?' : 'Your name'}
          </h2>
          <form onSubmit={continueAsNew} className="space-y-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Your name"
              maxLength={MAX_RUNNER_NAME}
              autoComplete="name"
              className={INPUT}
            />
            {newNameIssue && (
              <p className="text-rust-deep text-[13px] leading-snug">
                {newNameIssue}{choices.claim ? ' If that\'s you, tap your name above.' : ''}
              </p>
            )}
            <button type="submit" disabled={!newName.trim() || !!newNameIssue || busy} className={PRIMARY}>
              Continue
            </button>
          </form>
        </section>
      )}

      {error && (
        <div className="mt-6 p-4 bg-rust/10 border border-rust/30 rounded-xl">
          <p className="text-rust-deep text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
