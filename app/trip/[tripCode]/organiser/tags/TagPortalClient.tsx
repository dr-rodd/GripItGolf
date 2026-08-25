'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import Toggle from '@/app/components/Toggle'
import { PRESET_COLORS } from '@/lib/teamColors'
import { TAG_SET, eventTags, tagOf, untaggedIds } from '@/lib/tagBoards'
import { membersOf, type Membership } from '@/lib/teamSets'
import { setTeam, clearMirror } from '@/lib/teamMembers'
import {
  EVENT_PERMISSIONS, type EventPermissions,
} from '@/lib/eventPermissions'
import {
  type Leaderboard, boardTitle, boardRules, tagsInPlay,
} from '@/lib/leaderboards'
import LeaderboardSetup from '@/app/components/LeaderboardSetup'

/**
 * The tags portal — making tags and giving players theirs.
 *
 * Deliberately list-shaped: a tag card per tag, a tap to add or move a
 * player, an × to take one off. The drag-and-drop editor on the teams
 * screen is for arranging playing teams; tags are a census, and a census
 * is a list. Every membership write goes through `setTeam` on the tag
 * sheet — the one writer — so the `players.team_id` mirror, and with it
 * every coloured dot on the platform, follows by itself.
 *
 * Optimistic throughout, reverting on refusal — the organiser area's
 * manners. Deleting a tag asks first, like deleting anything.
 */

type Team = { id: string; name: string; color: string; team_set: string }
type Player = { id: string; name: string }

const INPUT = [
  'w-full bg-surface border border-bark/12 rounded-xl px-4 py-3',
  'text-ink placeholder:text-ink/60 text-sm',
  'focus:outline-none focus:border-accent/50 transition-colors',
].join(' ')

export default function TagPortalClient({
  tripId, tripCode, initialTeams, players, initialMemberships, initialPermissions,
  initialBoards,
}: {
  tripId: string
  tripCode: string
  initialTeams: Team[]
  players: Player[]
  initialMemberships: Membership[]
  initialPermissions: EventPermissions
  /** What the event plays for — is anything ranking the tags yet? */
  initialBoards: Leaderboard[]
}) {
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [memberships, setMemberships] = useState<Membership[]>(initialMemberships)
  const [error, setError] = useState<string | null>(null)

  // Which tag has its colour swatches open, and which has its add-player
  // search open — one of each at a time, like the hub's sections.
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draftName, setDraftName] = useState('')

  const tags = eventTags(teams)
  const nameOf = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players])
  const colorOf = useMemo(() => new Map(teams.map(t => [t.id, t.color])), [teams])
  const untagged = untaggedIds(players.map(p => p.id), memberships)

  function fail(what: string) {
    setError(`Could not ${what} — try again`)
  }

  // ── Tags themselves ──────────────────────────────────────────

  async function addTag() {
    const name = draftName.trim()
    if (!name) return
    setError(null)
    const { data, error: err } = await supabase
      .from('teams')
      .insert({
        trip_id: tripId,
        team_set: TAG_SET,
        name,
        color: PRESET_COLORS[tags.length % PRESET_COLORS.length],
      })
      .select('id, name, color, team_set')
      .single()
    if (err || !data) return fail('add the tag')
    setTeams(prev => [...prev, data as Team])
    setDraftName('')
  }

  async function renameTag(tagId: string, name: string) {
    const trimmed = name.trim()
    const prev = teams
    const current = teams.find(t => t.id === tagId)
    if (!current || !trimmed || trimmed === current.name) return
    setTeams(ts => ts.map(t => t.id === tagId ? { ...t, name: trimmed } : t))
    setError(null)
    const { error: err } = await supabase
      .from('teams')
      .update({ name: trimmed })
      .eq('id', tagId)
      .eq('trip_id', tripId)
    if (err) { setTeams(prev); fail('rename the tag') }
  }

  async function recolorTag(tagId: string, color: string) {
    const prev = teams
    setTeams(ts => ts.map(t => t.id === tagId ? { ...t, color } : t))
    setColorFor(null)
    setError(null)
    const { error: err } = await supabase
      .from('teams')
      .update({ color })
      .eq('id', tagId)
      .eq('trip_id', tripId)
    if (err) { setTeams(prev); fail('change the colour') }
  }

  async function removeTag(tagId: string) {
    // Deliberate, never one tap — the same rule deleting anything follows.
    if (!window.confirm('Remove this tag? Its players keep their scores and simply carry no tag.')) return
    setError(null)
    const memberIds = membersOf(memberships, tagId)

    const { error: err } = await supabase
      .from('teams')
      .delete()
      .eq('id', tagId)
      .eq('trip_id', tripId)
    if (err) return fail('remove the tag')

    // The database cascades the memberships; the players.team_id mirror is
    // ours to clear, exactly as the teams editor does when teams go.
    if (memberIds.length > 0) await clearMirror(memberIds)
    setTeams(prev => prev.filter(t => t.id !== tagId))
    setMemberships(prev => prev.filter(m => m.team_id !== tagId))
  }

  // ── Who carries which tag ────────────────────────────────────

  async function assign(playerId: string, tagId: string | null) {
    const prev = memberships
    setError(null)
    setMemberships(ms => [
      ...ms.filter(m => !(m.team_set === TAG_SET && m.player_id === playerId)),
      ...(tagId ? [{ team_id: tagId, team_set: TAG_SET, player_id: playerId }] : []),
    ])
    const failure = await setTeam(tripId, playerId, TAG_SET, tagId)
    if (failure) {
      setMemberships(prev)
      fail(tagId ? 'move the player' : 'take the tag off')
    }
  }

  // ── Self-assign permission ───────────────────────────────────
  // The whole map goes each time — one setting, read whole
  // (lib/eventPermissions.ts) — with the same optimistic manners as the
  // organiser page's toggles.
  const [perms, setPerms] = useState<EventPermissions>(initialPermissions)
  const selfAssign = EVENT_PERMISSIONS.find(p => p.key === 'assign_tag')

  async function saveSelfAssign(on: boolean) {
    const prev = perms
    const next = { ...perms, assign_tag: on }
    setPerms(next)
    setError(null)
    const { error: err } = await supabase
      .from('trips')
      .update({ event_permissions: next })
      .eq('id', tripId)
    if (err) {
      setPerms(prev)
      setError(/column|schema cache/i.test(err.message ?? '')
        ? 'Could not save — a database update may not have been applied yet.'
        : 'Could not save the change — try again')
    }
  }

  // ── What the tags are played for ─────────────────────────────
  // Tags with no board ranking them are only coloured dots. The whole
  // leaderboard cascade is offered here rather than a second, smaller copy
  // of it — one form, wherever a board is made.
  const [boards, setBoards] = useState<Leaderboard[]>(initialBoards)
  const [showBoards, setShowBoards] = useState(false)
  const ranked = tagsInPlay(boards)

  async function saveBoards(next: Leaderboard[]) {
    const prev = boards
    setBoards(next)
    setError(null)
    const { error: err } = await supabase
      .from('trips')
      .update({ leaderboards: next })
      .eq('id', tripId)
    if (err) {
      setBoards(prev)
      setError('Could not save the leaderboard — try again')
    }
  }

  return (
    <main className="min-h-dvh bg-cream has-tabbar page-enter">
      <TripHeader backTo={`/trip/${tripCode}/organiser`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-1">
          Tags
        </h1>
        <p className="text-ink/65 text-sm mb-6 leading-snug">
          The event-wide sides players carry all week — their tag follows
          them whoever they play with on the day. Tags colour every player
          card and feed any leaderboard that ranks the sides.
        </p>

        {/* ── Self-assign ── */}
        {selfAssign && (
          <div className="flex items-start justify-between gap-4 bg-surface border border-bark/12 rounded-2xl p-4 mb-6">
            <div className="min-w-0">
              <p className="text-ink text-sm font-medium">{selfAssign.label}</p>
              <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{selfAssign.hint}</p>
            </div>
            <Toggle
              checked={perms.assign_tag}
              onChange={saveSelfAssign}
              label={selfAssign.label}
            />
          </div>
        )}

        {/* ── The tags ── */}
        <ul className="flex flex-col gap-3">
          {tags.map(tag => {
            const memberIds = membersOf(memberships, tag.id)
            const adding = addingFor === tag.id
            const q = query.trim().toLowerCase()
            const candidates = adding
              ? players.filter(p =>
                  !memberIds.includes(p.id) &&
                  (!q || p.name.toLowerCase().includes(q)))
              : []

            return (
              <li key={tag.id} className="bg-surface border border-bark/12 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setColorFor(colorFor === tag.id ? null : tag.id)}
                    aria-label={`Change the colour of ${tag.name}`}
                    className="w-4 h-4 rounded-full flex-shrink-0 border border-bark/12"
                    style={{ backgroundColor: tag.color }}
                  />
                  <input
                    defaultValue={tag.name}
                    onBlur={e => renameTag(tag.id, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    aria-label="Tag name"
                    className="flex-1 min-w-0 bg-transparent text-ink text-sm font-medium focus:outline-none focus:border-b focus:border-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => removeTag(tag.id)}
                    className="text-ink/65 hover:text-ink/80 transition-colors p-1 flex-shrink-0"
                    aria-label={`Remove ${tag.name}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {colorFor === tag.id && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => recolorTag(tag.id, c)}
                        aria-label={`Colour ${c}`}
                        className={`w-7 h-7 rounded-full border-2 ${
                          c === tag.color ? 'border-ink/60' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}

                {memberIds.length > 0 ? (
                  <ul className="flex flex-col gap-1 mt-3">
                    {memberIds.map(id => (
                      <li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-bark/[0.04] px-3 py-2">
                        <span className="text-ink text-sm truncate">{nameOf.get(id) ?? '—'}</span>
                        <button
                          type="button"
                          onClick={() => assign(id, null)}
                          className="text-ink/65 hover:text-ink/80 transition-colors p-0.5 flex-shrink-0"
                          aria-label={`Take ${nameOf.get(id) ?? 'this player'} off ${tag.name}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-cap text-ink/65 mt-3">Nobody yet.</p>
                )}

                {adding ? (
                  <div className="mt-3">
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Find a player…"
                      className={INPUT}
                    />
                    <ul className="flex flex-col gap-1 mt-2 max-h-56 overflow-y-auto">
                      {candidates.map(p => {
                        const currentTag = tagOf(memberships, p.id)
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => assign(p.id, tag.id)}
                              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-bark/[0.04] transition-colors"
                            >
                              <span className="text-ink text-sm truncate flex-1">{p.name}</span>
                              {currentTag && (
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: colorOf.get(currentTag) }}
                                  aria-label="Already tagged — tapping moves them"
                                />
                              )}
                            </button>
                          </li>
                        )
                      })}
                      {candidates.length === 0 && (
                        <li className="t-cap text-ink/65 px-3 py-2">Nobody to add.</li>
                      )}
                    </ul>
                    <button
                      type="button"
                      onClick={() => { setAddingFor(null); setQuery('') }}
                      className="t-cap text-ink/65 hover:text-ink/80 transition-colors mt-2"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAddingFor(tag.id); setQuery('') }}
                    className="t-cap text-accent-deep hover:text-accent transition-colors mt-3"
                  >
                    + Add players
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {/* ── A new tag ── */}
        <div className="flex gap-2 mt-4">
          <input
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTag() }}
            placeholder="Europe, The Reds, Team Murphy…"
            className={INPUT}
          />
          <button
            type="button"
            onClick={addTag}
            disabled={!draftName.trim()}
            className="flex-shrink-0 px-5 rounded-xl bg-accent-deep text-white text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {untagged.length > 0 && tags.length > 0 && (
          <p className="t-cap text-ink/65 mt-4 leading-snug">
            Still untagged: {untagged.map(id => nameOf.get(id)).filter(Boolean).join(' · ')}
          </p>
        )}

        {/* ── What the tags play for ──
            A tag with no board behind it is a coloured dot and nothing
            more. This is where it becomes a competition — the same
            cascade Trip Setup uses, never a smaller second copy of it. */}
        <section className="mt-10">
          <h2 className="t-label uppercase tracking-[0.15em] text-ink mb-1">
            What the tags play for
          </h2>
          <p className="text-ink/65 text-[13px] mb-3 leading-snug">
            {ranked
              ? 'The sides are being ranked. Everything else on the leaderboard is unchanged.'
              : 'Tags colour the player cards on their own. Add a leaderboard to rank the sides against each other.'}
          </p>

          {ranked && !showBoards && (
            <ul className="flex flex-col gap-2 mb-3">
              {boards.filter(b => b.tagMode).map(b => (
                <li key={b.id} className="bg-surface border border-bark/12 rounded-2xl p-4">
                  <p className="text-ink text-sm font-medium">{boardTitle(b)}</p>
                  <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{boardRules(b)}</p>
                </li>
              ))}
            </ul>
          )}

          {showBoards ? (
            <>
              <LeaderboardSetup
                boards={boards}
                playerCount={players.length}
                teamCount={tags.length}
                askTeeTeams
                askTags
                onChange={saveBoards}
              />
              <button
                type="button"
                onClick={() => setShowBoards(false)}
                className="t-cap text-ink/65 hover:text-ink/80 transition-colors mt-3"
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowBoards(true)}
              className="w-full py-4 border border-dashed border-bark/25 rounded-xl text-ink/65 text-sm hover:border-bark/40 hover:text-ink/80 transition-colors"
            >
              {ranked ? 'Change the leaderboards' : '+ Rank the tags'}
            </button>
          )}
        </section>

        {error && (
          <p className="text-rust-deep text-sm mt-4 leading-snug">{error}</p>
        )}
      </div>
    </main>
  )
}
