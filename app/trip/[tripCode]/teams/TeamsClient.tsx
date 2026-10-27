'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import { boardNames } from '@/lib/displayNames'
import { partnershipName } from '@/lib/partnerships'
import {
  type PickerSheet, type PickerMember, type PickerViewer,
  mayPick, mayAddOthers, hasRoom,
} from '@/lib/teamPicker'
import InlineUnlock from '@/app/components/InlineUnlock'
import { ListGroup, ListRow, SectionHeader, buttonClass, cardClass } from '@/app/components/ui'
import { type TeamRow, moveMembers, refreshTeamName, deleteTeam } from './teamWrites'

/**
 * The teams page — every leaderboard's teams, one list a sheet, for
 * everybody (Ross, 27 Oct 2026). The organiser changes any of them through
 * the team picker; a player, where the field picks its own, starts a team,
 * joins one with room, changes their own and leaves it. Anybody else looks:
 * the teams are on the leaderboard anyway.
 *
 * Teams and partnerships are listed the same way — the line under a list
 * says whether its teams go out together (lib/partnerships.ts). Tags are
 * not here; they have their own portal.
 */
export default function TeamsClient({
  tripId, tripCode, isTrip, passcodeHash, sheets, teams: initialTeams,
  memberships: initialMemberships, players, meId, addedRecorded,
}: {
  tripId: string
  tripCode: string
  /** A trip's teams are the group's — everybody is the organiser here. */
  isTrip: boolean
  passcodeHash: string | null
  sheets: PickerSheet[]
  teams: TeamRow[]
  memberships: PickerMember[]
  players: { id: string; name: string }[]
  /** This phone's claimed player, or null. */
  meId: string | null
  /** Who added whom is recorded (migration 066). */
  addedRecorded: boolean
}) {
  const router = useRouter()
  // The organiser's PIN unlock, read after mount — sessionStorage does not
  // exist on the server, and a render that reads it would tear hydration.
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  const organiser = isTrip || unlocked || !isLocked(passcodeHash)

  const [teams, setTeams] = useState(initialTeams)
  const [memberships, setMemberships] = useState(initialMemberships)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ sheet: string; message: string } | null>(null)

  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const shortOf = useMemo(() => boardNames(players), [players])

  const membersOn = (sheet: string, teamId: string) =>
    memberships.filter(m => m.team_set === sheet && m.team_id === teamId).map(m => m.player_id)

  /** What a team is called on screen — a pair is "Ross & Dave". */
  const shown = (team: TeamRow, ids: string[]) =>
    partnershipName(team, ids.map(id => ({ id, name: nameOf.get(id) ?? '' })), shortOf)

  const pickHref = (sheet: string, teamId?: string) =>
    `/trip/${tripCode}/teams/pick?sheet=${encodeURIComponent(sheet)}${teamId ? `&team=${teamId}` : ''}`

  /** This phone's player into a team with room — themselves, and only themselves. */
  async function join(sheet: PickerSheet, team: TeamRow) {
    if (!meId || busy) return
    setBusy(true)
    setError(null)
    const before = membersOn(sheet.id, team.id)
    const failure = await moveMembers({
      tripId, sheet: sheet.id, teamId: team.id, add: [meId], remove: [],
      addedBy: addedRecorded ? meId : undefined,
    })
    if (failure) {
      setError({ sheet: sheet.id, message: `Could not join — try again` })
      setBusy(false)
      return
    }
    const name = await refreshTeamName({
      tripId, team, before: before.map(id => nameOf.get(id) ?? ''),
      after: [...before, meId].map(id => nameOf.get(id) ?? ''),
    })
    setMemberships(prev => [
      ...prev.filter(m => !(m.team_set === sheet.id && m.player_id === meId)),
      { team_id: team.id, team_set: sheet.id, player_id: meId, added_by: addedRecorded ? meId : null },
    ])
    setTeams(prev => prev.map(t => (t.id === team.id ? { ...t, name } : t)))
    setBusy(false)
    router.refresh()
  }

  /** This phone's player out of their team; the team goes with its last player. */
  async function leave(sheet: PickerSheet, team: TeamRow) {
    if (!meId || busy) return
    setBusy(true)
    setError(null)
    const before = membersOn(sheet.id, team.id)
    const after = before.filter(id => id !== meId)
    const failure = await moveMembers({
      tripId, sheet: sheet.id, teamId: team.id, add: [], remove: [meId], addedBy: undefined,
    })
    if (failure) {
      setError({ sheet: sheet.id, message: 'Could not leave — try again' })
      setBusy(false)
      return
    }
    if (after.length === 0) {
      await deleteTeam({ tripId, sheet: sheet.id, teamId: team.id, memberIds: [] })
      setTeams(prev => prev.filter(t => t.id !== team.id))
    } else {
      const name = await refreshTeamName({
        tripId, team, before: before.map(id => nameOf.get(id) ?? ''), after: after.map(id => nameOf.get(id) ?? ''),
      })
      setTeams(prev => prev.map(t => (t.id === team.id ? { ...t, name } : t)))
    }
    setMemberships(prev => prev.filter(m => !(m.team_set === sheet.id && m.player_id === meId)))
    setBusy(false)
    router.refresh()
  }

  if (sheets.length === 0) {
    return (
      <div className={`p-5 ${cardClass()}`}>
        <p className="text-ink text-sm font-medium">No leaderboard plays in teams yet.</p>
        <p className="t-cap text-ink/65 mt-1 leading-snug">
          {isTrip
            ? 'Add a team leaderboard in Trip Setup and its teams are picked here.'
            : 'Add a team leaderboard in the organiser area and its teams are picked here.'}
        </p>
      </div>
    )
  }

  const anyPick = sheets.some(s => mayPick({ organiser, meId, selfPick: s.selfPick, addedRecorded }))

  return (
    <div className="flex flex-col gap-10">
      {sheets.map(sheet => {
        const viewer: PickerViewer = { organiser, meId, selfPick: sheet.selfPick, addedRecorded }
        const onSheet = teams.filter(t => (t.team_set ?? 'main') === sheet.id)
        const myTeam = meId
          ? onSheet.find(t => membersOn(sheet.id, t.id).includes(meId)) ?? null
          : null
        const teamed = new Set(memberships.filter(m => m.team_set === sheet.id).map(m => m.player_id))
        const loose = players.filter(p => !teamed.has(p.id))
        const playerMayPick = !organiser && sheet.selfPick

        return (
          <section key={sheet.id}>
            {/* Headed by the leaderboard it is played on — the page itself
                is already called Teams. */}
            <SectionHeader className="mb-2">
              {sheet.boardTitles}
            </SectionHeader>
            <p className="t-cap text-ink/65 mb-4 leading-snug">
              {sheet.together
                ? `Each ${sheet.noun.one} plays together and books its tee time as one.`
                : `Teammates can go out at different times — every card counts for the ${sheet.noun.one}.`}
              {sheet.cap !== null && ` ${sheet.noun.Many} of ${sheet.cap}.`}
            </p>

            {/* The player's own team, on top, with the way to change it. */}
            {playerMayPick && myTeam && (
              <div className={`p-4 mb-4 ${cardClass('chosen')}`}>
                <p className="t-cap text-accent-deep">Your {sheet.noun.one}</p>
                <p className="t-card text-ink mt-0.5">{shown(myTeam, membersOn(sheet.id, myTeam.id))}</p>
                <div className="flex gap-2 mt-3">
                  <Link href={pickHref(sheet.id, myTeam.id)} className={buttonClass('secondary', false, true)}>
                    {mayAddOthers(viewer) && hasRoom(membersOn(sheet.id, myTeam.id).length, sheet.cap)
                      ? 'Add a partner'
                      : 'See your team'}
                  </Link>
                  <button
                    type="button"
                    onClick={() => leave(sheet, myTeam)}
                    disabled={busy}
                    className={buttonClass('quiet', false, true)}
                  >
                    Leave
                  </button>
                </div>
              </div>
            )}

            {onSheet.length > 0 ? (
              <ListGroup>
                {onSheet.map(team => {
                  const ids = membersOn(sheet.id, team.id)
                  const room = sheet.cap === null ? null : Math.max(0, sheet.cap - ids.length)
                  const label = (
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} aria-hidden="true" />
                      <span className="truncate">{shown(team, ids)}</span>
                    </span>
                  )
                  const hint = [
                    ids.map(id => nameOf.get(id)).filter(Boolean).join(' · ') || 'Nobody yet',
                    room !== null && room > 0 ? `${room} spot${room === 1 ? '' : 's'} open` : null,
                    room === 0 ? 'full' : null,
                  ].filter(Boolean).join(' — ')
                  if (organiser) {
                    return <ListRow key={team.id} label={label} hint={hint} href={pickHref(sheet.id, team.id)} />
                  }
                  const mayJoin = playerMayPick && !!meId && !myTeam && hasRoom(ids.length, sheet.cap)
                  return (
                    <ListRow
                      key={team.id}
                      label={label}
                      hint={hint}
                      trailing={mayJoin ? (
                        <button
                          type="button"
                          onClick={() => join(sheet, team)}
                          disabled={busy}
                          className={buttonClass('primary', false, true)}
                        >
                          Join
                        </button>
                      ) : undefined}
                    />
                  )
                })}
              </ListGroup>
            ) : (
              <p className="t-cap text-ink/65 py-2">No {sheet.noun.many} yet.</p>
            )}

            {/* A new team: the organiser's, or a player's own while they have none. */}
            {(organiser || (playerMayPick && !!meId && !myTeam)) && (
              <Link
                href={pickHref(sheet.id)}
                className="mt-3 w-full py-4 border border-dashed border-line-strong rounded-xl text-ink/65 text-sm hover:text-ink/80 transition-colors flex items-center justify-center"
              >
                {organiser ? `+ New ${sheet.noun.one}` : `+ Start a ${sheet.noun.one}`}
              </Link>
            )}

            {playerMayPick && !meId && (
              <div className={`p-4 mt-3 ${cardClass()}`}>
                <p className="text-ink text-sm font-medium">First, say who you are.</p>
                <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
                  Claim your spot on the players screen, then pick your {sheet.noun.one}.
                </p>
                <Link
                  href={`/trip/${tripCode}/players`}
                  className="inline-block mt-3 t-label text-accent-deep hover:text-accent transition-colors"
                >
                  Claim your spot →
                </Link>
              </div>
            )}

            {loose.length > 0 && onSheet.length > 0 && (
              <p className="t-cap text-ink/65 mt-3 leading-snug">
                Not in a {sheet.noun.one} yet: {loose.map(p => p.name).join(' · ')}
              </p>
            )}

            {error?.sheet === sheet.id && (
              <p className="text-rust-deep text-sm mt-3 leading-snug">{error.message}</p>
            )}
          </section>
        )
      })}

      {/* The organiser's other way in: the drag screen, kept while the
          picker proves itself (Ross, 27 Oct 2026 — quicker for a small
          event, no use for a large one). */}
      {organiser && (
        <Link
          href={`/trip/${tripCode}/teams?view=drag`}
          className="t-cap text-ink/65 hover:text-ink/80 transition-colors self-center"
        >
          Drag and drop instead
        </Link>
      )}

      {!organiser && passcodeHash && (
        <InlineUnlock
          tripCode={tripCode}
          passcodeHash={passcodeHash}
          onUnlocked={() => setUnlocked(true)}
          prompt={anyPick ? 'Organiser? Enter your PIN to change any team.' : 'Organiser? Enter your PIN to pick the teams.'}
        />
      )}
    </div>
  )
}
