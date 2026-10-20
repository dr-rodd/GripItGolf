import { createAdminClient } from '@/lib/supabase-admin'
import { parseLeagueSetup } from '@/lib/leagueSetup'
import {
  clubIssue, describeLink, describeRules, golfIrelandConfig, linkReadable, readsGolfIreland,
} from '@/lib/golfIreland'
import { loadClubs, loadLinks } from '@/app/api/golf-ireland/league'
import type { LinkStatus } from './players/GolfIrelandLinkCard'
import type { LinkRequest } from './organiser/GolfIrelandRequests'

/**
 * What a golf page needs to know about a league's Golf Ireland links —
 * read on the server, on the service role, because the link tables are
 * closed to the browser. Null for anything that is not a league reading
 * Golf Ireland, and null on any failure: a page that cannot read the links
 * renders exactly as it did before they existed.
 */
export type GolfIrelandView = {
  /** Players whose link the organiser confirmed, club standing — the badge. */
  linkedIds: string[]
  /** This phone's player's own link, when there is a player. */
  mine: LinkStatus | null
  rulesLine: string
  clubNames: string[]
  connected: boolean
}

export async function golfIrelandView(
  tripId: string, bracketSetup: unknown, playerId: string | null,
): Promise<GolfIrelandView | null> {
  const setup = parseLeagueSetup(bracketSetup)
  if (!setup?.golfIreland || !readsGolfIreland(setup.scoreSource)) return null
  try {
    const admin = createAdminClient()
    const [clubs, links] = await Promise.all([
      loadClubs(admin, setup.golfIreland.clubs),
      loadLinks(admin, tripId),
    ])
    const clubOf = new Map(clubs.map(c => [c.clubId, c]))
    const own = playerId ? links.find(l => l.playerId === playerId) ?? null : null
    const ownClub = own ? clubOf.get(own.clubId) : undefined
    return {
      linkedIds: links.filter(l => linkReadable(l, clubOf.get(l.clubId))).map(l => l.playerId),
      mine: !playerId ? null : !own ? { state: 'none' } : {
        state: clubIssue(ownClub) ? 'blocked' : own.confirmedAt ? 'linked' : 'requested',
        memberName: own.memberName,
        clubName: ownClub?.name ?? '',
        text: describeLink(own, ownClub),
      },
      rulesLine: describeRules(setup.golfIreland),
      clubNames: clubs.filter(c => !clubIssue(c)).map(c => c.name),
      connected: golfIrelandConfig() !== null,
    }
  } catch (e) {
    console.error('golfIrelandView failed:', e)
    return null
  }
}

/**
 * The organiser's view: the rules, and every link in the league with the
 * player's name beside the member's — requests first, for the organiser
 * to answer. Null when not a Golf Ireland league, and on any failure.
 */
export async function golfIrelandRequests(tripId: string, bracketSetup: unknown): Promise<{
  rulesLine: string; connected: boolean; links: LinkRequest[]
} | null> {
  const setup = parseLeagueSetup(bracketSetup)
  if (!setup?.golfIreland || !readsGolfIreland(setup.scoreSource)) return null
  try {
    const admin = createAdminClient()
    const [clubs, links, players] = await Promise.all([
      loadClubs(admin, setup.golfIreland.clubs),
      loadLinks(admin, tripId),
      admin.from('players').select('id, name').eq('trip_id', tripId),
    ])
    if (players.error) throw players.error
    const nameOf = new Map((players.data ?? []).map(p => [p.id as string, p.name as string]))
    const clubName = new Map(clubs.map(c => [c.clubId, c.name]))
    return {
      rulesLine: describeRules(setup.golfIreland),
      connected: golfIrelandConfig() !== null,
      links: links
        .map(l => ({
          playerId: l.playerId,
          playerName: nameOf.get(l.playerId) ?? 'A player',
          memberName: l.memberName,
          clubName: clubName.get(l.clubId) ?? '',
          confirmed: l.confirmedAt !== null,
        }))
        .sort((a, b) => Number(a.confirmed) - Number(b.confirmed) || a.playerName.localeCompare(b.playerName)),
    }
  } catch (e) {
    console.error('golfIrelandRequests failed:', e)
    return null
  }
}

/**
 * The players carrying the mark beside their name: confirmed links whose
 * club's access stands. No query at all unless the league reads Golf
 * Ireland, so every other trip and event pays nothing for it; empty on
 * any failure, which only costs the badges.
 */
export async function golfIrelandLinkedIds(tripId: string, bracketSetup: unknown): Promise<string[]> {
  const setup = parseLeagueSetup(bracketSetup)
  if (!setup?.golfIreland || !readsGolfIreland(setup.scoreSource)) return []
  try {
    const admin = createAdminClient()
    const [clubs, links] = await Promise.all([
      loadClubs(admin, setup.golfIreland.clubs),
      loadLinks(admin, tripId),
    ])
    const clubOf = new Map(clubs.map(c => [c.clubId, c]))
    return links.filter(l => linkReadable(l, clubOf.get(l.clubId))).map(l => l.playerId)
  } catch (e) {
    console.error('golfIrelandLinkedIds failed:', e)
    return []
  }
}
