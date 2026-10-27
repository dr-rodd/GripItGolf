'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import { boardNames } from '@/lib/displayNames'
import { partnershipName, isMadeName, MAX_PARTNERSHIP } from '@/lib/partnerships'
import { PRESET_COLORS } from '@/lib/teamColors'
import {
  type PickerSheet, type PickerMember, type PickerViewer, type TeeTimePick,
  mayPick, pickChoices, selectionIssue, pickPlan, madeTeamName,
  teeTimeChoices, roomOnTime, teeTimeIssue, withinMyTag, teamTagIssue,
} from '@/lib/teamPicker'
import WizardShell from '@/app/components/WizardShell'
import InlineUnlock from '@/app/components/InlineUnlock'
import { IconCheck } from '@/app/components/icons'
import { FIELD, buttonClass, cardClass, optionClass } from '@/app/components/ui'
import { type TeamRow, createTeam, moveMembers, refreshTeamName, deleteTeam } from '../teamWrites'

const TITLES = ['Who’s in the team?', 'Check the team'] as const

/**
 * The team picker — the one way teams and partnerships are made (Ross,
 * 27 Oct 2026). Step one, who is in it: the organiser ticks anybody, moving
 * a player from another team; a player is in the team they are making,
 * adds partners from the players not yet in one, and cannot untick the
 * members somebody else added (lib/teamPicker.ts `pickChoices`). Step two,
 * the check: the team as it will read — a pair is "Ross & Dave" — the
 * leaderboards it plays on, and whether it goes out together on one tee
 * time (lib/partnerships.ts). Every write goes through ../teamWrites.ts.
 *
 * From the tee sheet (`teeTime`, stage 4) the team is for one tee time:
 * those already on it and in no team are in the team and fixed, the rest
 * of the choice is the players on no time yet, and saving goes back to the
 * sheet with the team to place there (lib/teamPicker.ts `teeTimeChoices`).
 */
export default function TeamPickerWizard({
  tripId, tripCode, isTrip, passcodeHash, sheet, team: givenTeam, teamsOnSheet,
  memberships, players, meId, addedRecorded, backHref, teeTime = null,
}: {
  tripId: string
  tripCode: string
  isTrip: boolean
  passcodeHash: string | null
  sheet: PickerSheet
  /** The team being changed, or null for a new one. */
  team: TeamRow | null
  teamsOnSheet: TeamRow[]
  memberships: PickerMember[]
  players: { id: string; name: string }[]
  meId: string | null
  addedRecorded: boolean
  backHref: string
  /** The tee time the team is for, when it came from the tee sheet. */
  teeTime?: { roundId: string; slot: number; at: TeeTimePick; playingForTags: boolean } | null
}) {
  const router = useRouter()
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  const organiser = isTrip || unlocked || !isLocked(passcodeHash)
  const viewer: PickerViewer = { organiser, meId, selfPick: sheet.selfPick, addedRecorded }

  const onSheet = useMemo(() => memberships.filter(m => m.team_set === sheet.id), [memberships, sheet.id])
  const teamOfPlayer = useMemo(() => new Map(onSheet.map(m => [m.player_id, m.team_id])), [onSheet])
  const membersOf = (teamId: string) => onSheet.filter(m => m.team_id === teamId).map(m => m.player_id)

  // A player already in a team here changes that one — one team a sheet.
  const team = givenTeam
    ?? (!organiser && meId ? teamsOnSheet.find(t => t.id === teamOfPlayer.get(meId)) ?? null : null)
  // A player may change only a team they are in — or, from the tee sheet,
  // join the part-filled one on their time; anybody may look.
  const isMember = !!team && !!meId && teamOfPlayer.get(meId) === team.id
  const joiningTeam = !!teeTime && !!team && !isMember && !organiser
    && !!meId && !teamOfPlayer.has(meId) && membersOf(team.id).length < (sheet.cap ?? MAX_PARTNERSHIP)
  const allowed = mayPick(viewer) && (organiser || !team || isMember || joiningTeam)

  // A tee time's team is never more than the time holds.
  const cap = teeTime ? Math.min(sheet.cap ?? MAX_PARTNERSHIP, MAX_PARTNERSHIP) : sheet.cap
  // Where tags are in play a team is of one, so a player is offered only
  // their own tag's; the organiser is told instead (`tagIssue`, below).
  const at = useMemo(
    () => (teeTime ? withinMyTag(teeTime.at, { organiser, meId }, memberships, teeTime.playingForTags) : null),
    [teeTime, organiser, meId, memberships],
  )

  const choices = useMemo(
    () => at
      ? teeTimeChoices({ players, memberships, sheet: sheet.id, teamId: team?.id ?? null, viewer, at, cap: cap! })
      : pickChoices({ players, memberships, sheet: sheet.id, teamId: team?.id ?? null, viewer }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, memberships, sheet.id, team?.id, organiser, meId, sheet.selfPick, addedRecorded, at, cap],
  )
  const [picked, setPicked] = useState<Set<string>>(() => new Set(choices.filter(c => c.picked).map(c => c.id)))
  // The organiser's unlock arrives after mount; who is ticked to start follows it.
  useEffect(() => { setPicked(new Set(choices.filter(c => c.picked).map(c => c.id))) }, [choices])

  const [step, setStep] = useState(1)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const shortOf = useMemo(() => boardNames(players), [players])
  const teamName = (id: string) => {
    const t = teamsOnSheet.find(x => x.id === id)
    return t ? partnershipName(t, membersOf(id).map(p => ({ id: p, name: nameOf.get(p) ?? '' })), shortOf) : 'another team'
  }

  const after = [...picked]
  const tagIssue = teamTagIssue(after, memberships, !!teeTime?.playingForTags)
  const issue = selectionIssue(after, cap, sheet.noun) ?? (at ? teeTimeIssue(after, at) : null) ?? tagIssue
  const full = cap !== null && picked.size >= cap
  const fits = (id: string) => (at ? roomOnTime(id, after, at, cap!) : !full)
  const shown = choices.filter(c => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()))
  // A name somebody chose stands; a made one follows the players as picked.
  const chosenName = team && !isMadeName(team.name, membersOf(team.id).map(id => nameOf.get(id) ?? ''))
    ? team.name : ''
  const readsAs = partnershipName({ name: chosenName }, after.map(id => ({ id, name: nameOf.get(id) ?? '' })), shortOf)
  const moves = organiser ? after.filter(id => {
    const was = teamOfPlayer.get(id)
    return was && was !== team?.id
  }) : []

  function toggle(id: string) {
    const c = choices.find(x => x.id === id)
    if (!c || c.locked) return
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (fits(id)) next.add(id)
      return next
    })
  }

  function freeColour(): string {
    const used = new Set(teamsOnSheet.map(t => t.color))
    return PRESET_COLORS.find(c => !used.has(c)) ?? PRESET_COLORS[teamsOnSheet.length % PRESET_COLORS.length]
  }

  async function save() {
    setSaving(true)
    setError(null)
    const before = team ? membersOf(team.id) : []
    const { add, remove } = pickPlan(before, after)
    // Who the moved players are leaving, for their old teams' names after.
    const leaving = new Map<string, string[]>()
    for (const id of moves) {
      const was = teamOfPlayer.get(id)!
      leaving.set(was, [...(leaving.get(was) ?? []), id])
    }

    const target = team ?? await createTeam(tripId, sheet.id, madeTeamName(after.map(id => nameOf.get(id) ?? '')), freeColour())
    if (!target) {
      setSaving(false)
      setError(`Could not make the ${sheet.noun.one} — try again`)
      return
    }
    // Those on the tee time already are in by the sheet's rule, not by
    // whoever made the team, so nobody but the organiser and themselves can
    // take them out again — they carry nobody, as the organiser's do.
    const byRule = new Set(choices.filter(c => c.locked && c.id !== meId && at?.mates.includes(c.id)).map(c => c.id))
    const failure = await moveMembers({
      tripId, sheet: sheet.id, teamId: target.id, add: add.filter(id => !byRule.has(id)), remove,
      // The organiser's placings carry nobody; a player's carry them — and
      // neither names the column before migration 066 is in.
      addedBy: addedRecorded ? (organiser ? null : meId) : undefined,
    }) ?? await moveMembers({
      tripId, sheet: sheet.id, teamId: target.id, add: add.filter(id => byRule.has(id)), remove: [],
      addedBy: addedRecorded ? null : undefined,
    })
    if (failure) {
      console.error('Team picker save failed:', failure)
      if (!team) await deleteTeam({ tripId, sheet: sheet.id, teamId: target.id, memberIds: [] })
      setSaving(false)
      setError(`Could not save the ${sheet.noun.one} — try again`)
      return
    }
    if (team) {
      await refreshTeamName({
        tripId, team, before: before.map(id => nameOf.get(id) ?? ''), after: after.map(id => nameOf.get(id) ?? ''),
      })
    }
    // A team the organiser moved its last player out of goes; the rest are renamed.
    for (const [oldId, gone] of leaving) {
      const old = teamsOnSheet.find(t => t.id === oldId)
      if (!old) continue
      const was = membersOf(oldId)
      const left = was.filter(id => !gone.includes(id))
      if (left.length === 0) await deleteTeam({ tripId, sheet: sheet.id, teamId: oldId, memberIds: [] })
      else await refreshTeamName({ tripId, team: old, before: was.map(id => nameOf.get(id) ?? ''), after: left.map(id => nameOf.get(id) ?? '') })
    }
    // Back to the sheet with the team to put on the time — the sheet books
    // it, with its own checks, and says so in the slot if it no longer fits.
    router.push(teeTime ? `${backHref}&place=${teeTime.slot}&team=${target.id}` : backHref)
    router.refresh()
  }

  // One player for a tee time is not a team: they go on alone, as "Just
  // me" on the sheet does, and anybody joining the time later finds them
  // there to make a team with.
  const alone = !!teeTime && !team && picked.size === 1
  function goAlone() {
    if (!teeTime || picked.size !== 1) return
    const [only] = [...picked]
    router.push(`${backHref}&place=${teeTime.slot}&player=${only}`)
  }

  async function removeTeam() {
    if (!team) return
    setAskDelete(false)
    setSaving(true)
    const ok = await deleteTeam({ tripId, sheet: sheet.id, teamId: team.id, memberIds: membersOf(team.id) })
    if (!ok) {
      setSaving(false)
      setError(`Could not take the ${sheet.noun.one} apart — try again`)
      return
    }
    router.push(backHref)
    router.refresh()
  }

  if (!allowed) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10">
        <p className="t-h2 text-ink mb-2">{team ? teamName(team.id) : `A new ${sheet.noun.one}`}</p>
        <p className="text-ink/65 text-sm leading-relaxed mb-6">
          {team
            ? membersOf(team.id).map(id => nameOf.get(id)).filter(Boolean).join(' · ') || 'Nobody yet.'
            : sheet.selfPick && !meId
              ? 'Claim your spot on the players screen first, then you can start one.'
              : `Only the organiser picks the ${sheet.noun.many} for this leaderboard.`}
        </p>
        {passcodeHash && !organiser && (
          <InlineUnlock
            tripCode={tripCode}
            passcodeHash={passcodeHash}
            onUnlocked={() => setUnlocked(true)}
            prompt={isTrip ? 'Lead player? Enter the passcode to change teams.' : 'Organiser? Enter your PIN to change teams.'}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <WizardShell
        step={step}
        titles={TITLES}
        intro={at ? `For ${at.label} · ${sheet.boardTitles}` : sheet.boardTitles}
        onBack={() => (step === 1 ? router.push(backHref) : setStep(1))}
        aboveTabBar
        footer={
          <>
            {error && <p className="text-rust-deep text-sm mb-3 text-center leading-snug">{error}</p>}
            {step === 1 && alone ? (
              <button type="button" onClick={goAlone} disabled={!!issue} className={buttonClass('primary')}>
                {organiser ? 'Put them on alone' : 'Go on my own'}
              </button>
            ) : step === 1 ? (
              <button type="button" onClick={() => setStep(2)} disabled={!!issue} className={buttonClass('primary')}>
                Continue
              </button>
            ) : (
              <button type="button" onClick={save} disabled={!!issue || saving} className={buttonClass('primary')}>
                {saving ? 'Saving…' : joiningTeam ? `Join the ${sheet.noun.one}` : team ? 'Save changes' : `Make the ${sheet.noun.one}`}
              </button>
            )}
          </>
        }
      >
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <p className="t-body text-ink/80">
              {cap !== null ? `${picked.size} of ${cap} picked.` : `${picked.size} picked.`}
              {at
                ? ` They all go on at ${at.label}.${cap !== null && picked.size < cap ? ' Not everyone yet? The team can be filled later.' : ''}`
                : !organiser && !addedRecorded && ' For now you can put only yourself in — your partners join themselves.'}
            </p>
            {choices.length > 10 && (
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Find a player…"
                aria-label="Find a player"
                className={FIELD}
              />
            )}
            <ul className="flex flex-col gap-2">
              {shown.map(c => {
                const on = picked.has(c.id)
                const blocked = c.locked || (!on && !fits(c.id))
                const note = c.locked
                  ? (c.id === meId ? 'You' : at?.mates.includes(c.id) ? `On ${at.label} already` : 'Added by someone else')
                  : at?.onSlot.includes(c.id) ? `On ${at.label} already`
                  : c.otherTeamId && !on ? `In ${teamName(c.otherTeamId)}`
                  : c.otherTeamId && on ? `Moves from ${teamName(c.otherTeamId)}`
                  : null
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      disabled={blocked}
                      aria-pressed={on}
                      className={`${optionClass(on, 'row')} disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <span className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center ${
                        on ? 'bg-accent-deep border-accent-deep text-white' : 'border-line-strong'
                      }`} aria-hidden="true">
                        {on && <IconCheck size={14} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[17px] font-medium leading-snug text-ink truncate">{c.name}</span>
                        {note && <span className="block t-cap text-ink/65 mt-0.5">{note}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
              {shown.length === 0 && (
                <li className="t-cap text-ink/65 py-2">Nobody to add — everyone is in a {sheet.noun.one}.</li>
              )}
              {at && !organiser && choices.length === 1 && (
                <li className="t-cap text-ink/65 py-2 leading-snug">
                  {!at.bookerRecorded || !addedRecorded
                    ? 'For now you can put only yourself on — your partners book themselves.'
                    : 'Everyone else is on a time or in a team already.'}
                </li>
              )}
            </ul>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className={`p-5 ${cardClass()}`}>
              <p className="t-cap text-ink/65">This {sheet.noun.one} reads</p>
              <p className="t-h2 text-ink mt-1">{readsAs || '—'}</p>
              <p className="t-cap text-ink/65 mt-2 leading-snug">
                {after.map(id => nameOf.get(id)).filter(Boolean).join(' · ')}
              </p>
            </div>
            <p className="t-body text-ink/80 leading-snug">
              {at
                ? `They go on at ${at.label} together, and play as one.`
                : sheet.together
                ? `They play together — the tee sheet books them onto one time, as one.`
                : `They can go out at different times — every card counts for the ${sheet.noun.one}.`}
            </p>
            {moves.length > 0 && (
              <p className="t-body text-ink/80 leading-snug">
                {moves.map(id => `${nameOf.get(id)} moves from ${teamName(teamOfPlayer.get(id)!)}`).join('. ')}.
              </p>
            )}
            {organiser && team && (
              <button type="button" onClick={() => setAskDelete(true)} disabled={saving} className={`${buttonClass('quiet', false)} self-start`}>
                Take this {sheet.noun.one} apart
              </button>
            )}
          </div>
        )}
      </WizardShell>

      {askDelete && createPortal(
        <>
          {/* The scrim's warm near-black constant, as every sheet's. */}
          <div
            className="fixed inset-0 z-50 page-enter"
            style={{ backgroundColor: 'rgba(20, 15, 11, 0.55)' }}
            onClick={() => setAskDelete(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Take this ${sheet.noun.one} apart`}
              className={`w-full max-w-md mx-auto sheet-up ${cardClass()}`}
            >
              <div className="px-5 py-4 border-b border-line">
                <h2 className="t-card text-ink">Take {team ? teamName(team.id) : `this ${sheet.noun.one}`} apart?</h2>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                <p className="t-body text-ink/80 leading-snug">
                  Its players stay in the event, in no {sheet.noun.one}. Their scores are kept.
                </p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setAskDelete(false)} className={`${buttonClass('secondary', false)} flex-1`}>
                    Keep it
                  </button>
                  <button type="button" onClick={removeTeam} className={`${buttonClass('danger', false)} flex-1`}>
                    Take it apart
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
