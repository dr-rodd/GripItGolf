'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TAG_SET, tagOf } from '@/lib/tagBoards'
import { membersOf, type Membership, type TeamRow } from '@/lib/teamSets'
import { setTeam } from '@/lib/teamMembers'

/**
 * Players picking their own tag — the field's side of tags.
 *
 * Shown on an event whose organiser turned `assign_tag` on: the tags are
 * theirs to make, and this is the field saving them the job of assigning
 * every one. A claimed player joins a tag or leaves it; nobody creates,
 * renames or removes one here. That is the difference between this and the
 * self-pick team join screen beside it — forming a team is making
 * something, joining a tag is only ever picking from what the organiser
 * already made.
 *
 * No size cap, deliberately. A tag is a side, not a playing group: Europe
 * against the USA is twelve a side, and `teamSizeLimit` speaks for pairs
 * draws and self-pick boards, which a tag is neither of.
 *
 * Identity is the claim cookie (lib/currentPlayer.ts): personalises, never
 * authorises, like everywhere. One tag per player is the database's own
 * rule — UNIQUE(player_id, team_set) — so joining a second leaves the
 * first by itself.
 */

type Player = { id: string; name: string }

export default function TagJoinClient({
  tripId, tripCode, tags, players, memberships: initialMemberships, viewerPlayerId,
}: {
  tripId: string
  tripCode: string
  tags: (TeamRow & { color: string })[]
  players: Player[]
  memberships: Membership[]
  /** The claimed player this device carries, or null for a stranger. */
  viewerPlayerId: string | null
}) {
  const [memberships, setMemberships] = useState<Membership[]>(initialMemberships)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const viewer = players.find(p => p.id === viewerPlayerId) ?? null
  const myTagId = viewer ? tagOf(memberships, viewer.id) : null

  async function pick(tagId: string | null) {
    if (!viewer || busy) return
    setBusy(true)
    setError(null)
    const prev = memberships
    setMemberships(ms => [
      ...ms.filter(m => !(m.team_set === TAG_SET && m.player_id === viewer.id)),
      ...(tagId ? [{ team_id: tagId, team_set: TAG_SET, player_id: viewer.id }] : []),
    ])

    const failure = await setTeam(tripId, viewer.id, TAG_SET, tagId)
    if (failure) {
      setMemberships(prev)
      setError(tagId ? 'Could not join — try again' : 'Could not leave — try again')
    }
    setBusy(false)
  }

  if (tags.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-1">Your tag</h2>
        <p className="text-ink/65 text-sm leading-snug">
          The side you play for all week — it stays with you whoever you
          are out with on the day.
        </p>
      </div>

      {!viewer && (
        <div className="bg-surface border border-bark/12 rounded-2xl p-4">
          <p className="text-ink text-sm font-medium">First, say who you are.</p>
          <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
            Claim your name on the players screen, then come back and pick
            your tag.
          </p>
          <Link
            href={`/trip/${tripCode}/players`}
            className="inline-block mt-3 t-label text-accent-deep hover:text-accent transition-colors"
          >
            Claim your name →
          </Link>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {tags.map(tag => {
          const members = membersOf(memberships, tag.id)
          const mine = tag.id === myTagId

          return (
            <li
              key={tag.id}
              className={`bg-surface border rounded-2xl p-4 ${
                mine ? 'border-accent/40' : 'border-bark/12'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-ink text-sm font-medium">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                    {mine && <span className="t-cap text-accent-deep flex-shrink-0">Your tag</span>}
                  </p>
                  <p className="t-cap text-ink/65 mt-1 leading-snug">
                    {members.length === 0
                      ? 'Nobody yet'
                      : members.map(id => nameOf.get(id)).filter(Boolean).join(' · ')}
                  </p>
                </div>

                {viewer && (
                  mine ? (
                    <button
                      type="button"
                      onClick={() => pick(null)}
                      disabled={busy}
                      className="flex-shrink-0 px-4 py-2 rounded-lg border border-bark/25 text-ink/80 text-sm hover:border-bark/40 transition-colors disabled:opacity-40"
                    >
                      Leave
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pick(tag.id)}
                      disabled={busy}
                      className="flex-shrink-0 px-4 py-2 rounded-lg bg-accent-deep text-white text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40"
                    >
                      Join
                    </button>
                  )
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {error && (
        <p className="text-rust-deep text-sm leading-snug">{error}</p>
      )}
    </div>
  )
}
