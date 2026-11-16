// A club competition's cards, signed on the server (stage (d3); D176–D178 as
// amended by Ross, 16 Nov 2026).
//
// A card in the app is a group's; **a signature is a player's**. Whoever
// finalises the group (a player on the tee sheet, or the club's owners and
// admins) does so in one tap, as on any event — but here the server writes
// the `scores` (migration 090: phones no longer may on a competition), and
// each player's card is then **final only with two signatures from two
// different accounts**:
//
//   * the player's **approval**, on their own account — given by the
//     finalise itself when the player finalised, else later (a member who
//     forgot their phone approves when they can);
//   * a **marker**'s, a member on the club's list chosen at the finalise —
//     the group's other players first — given by the finalise itself when
//     the finaliser chose themselves, else later from Cards to sign. An
//     owner or admin may sign as marker on any card (D178), never their own.
//
// Until both are in, the card is on the board "to be signed"; either signer,
// or an admin, may **send it back** — its `scores` taken off and the card
// opened again for its player — and the finalise afterwards writes it
// afresh, leaving any player already signed alone. One row a player a
// finalise in `card_signatures`, a card sent back keeping its closed row.
//
// The commit's rule is `lib/cardCommit.ts`, the phone's own. Handed its
// store, so `test:clubs` runs it on a stand-in; ./store.ts is the
// service-role store.

import { isAccount, type AuthUser } from '@/lib/account'
import { cardScoreRows, type CommitHole, type CommitScoreRow } from '@/lib/cardCommit'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { anyScored, mergeSaved, type SavedScore } from '@/lib/liveScores'
import type { MemberRecord } from '../club/club'
import type { Booked, CompPlayer, CompRecord } from '../club/booking'

export interface SignPlayer extends CompPlayer { name: string; gender: string }

export interface Signature {
  id: string
  playerId: string
  liveRoundId: string | null
  finalisedBy: string | null
  finalisedAt: string
  approvedBy: string | null
  approvedAt: string | null
  markerMemberId: string | null
  markedBy: string | null
  markedAt: string | null
  markedAs: 'marker' | 'admin' | null
}

export interface NewSignature {
  trip_id: string
  round_id: string
  player_id: string
  live_round_id: string
  finalised_by: string
  finalised_at: string
  approved_by: string | null
  approved_at: string | null
  marker_member_id: string
  marked_by: string | null
  marked_at: string | null
  marked_as: 'marker' | null
}

export interface LiveCard { id: string; roundId: string; status: string; playerIds: string[] }

export interface CardHole { number: number; par: number; gross: number | null; noReturn: boolean; points: number | null }

export interface SignStore {
  userFromToken(token: string): Promise<AuthUser | null>
  competition(code: string): Promise<CompRecord | null>
  myRow(clubId: string, userId: string): Promise<MemberRecord | null>
  rowsByIds(clubId: string, ids: string[]): Promise<MemberRecord[]>
  players(tripId: string): Promise<SignPlayer[]>
  bookings(roundId: string): Promise<Booked[]>
  liveCard(id: string): Promise<LiveCard | null>
  /** The round's open signatures (not sent back) — null before migration 090. */
  signatures(roundId: string): Promise<Signature[] | null>
  holes(roundId: string): Promise<CommitHole[]>
  playingHcps(roundId: string, playerIds: string[]): Promise<Map<string, number>>
  liveScores(roundId: string, playerIds: string[]): Promise<SavedScore[]>
  upsertScores(rows: CommitScoreRow[]): Promise<void>
  markCommitted(roundId: string, playerIds: string[], committed: boolean): Promise<void>
  /** 'clash' when one of them already has an open signature (two phones at once). */
  insertSignatures(rows: NewSignature[]): Promise<'ok' | 'clash'>
  updateSignature(id: string, patch: Record<string, string | null>): Promise<void>
  finaliseCard(liveRoundId: string, at: string): Promise<void>
  reopenCard(liveRoundId: string): Promise<void>
  deleteScores(roundId: string, playerId: string): Promise<void>
  /** A player's card as signed: hole by hole, from `scores`. */
  card(roundId: string, playerId: string): Promise<CardHole[]>
  /** Stage (d4): whether the round is certified, and who is No return — `ready: false` before 091. */
  roundLock?(roundId: string): Promise<{ ready: boolean; certifiedAt: string | null; noReturns: string[] }>
}

/** Who marks a player's card: another player in the competition, or a row of the list. */
export type MarkerAsk = { playerId?: string; memberId?: string }

export interface SignItem {
  playerId: string
  name: string
  /** Signed by both, or waiting — and on whom. */
  approved: boolean
  marked: boolean
  markerName: string | null
  markedAs: 'marker' | 'admin' | null
  mine: boolean
  canApprove: boolean
  canMark: boolean
  canSendBack: boolean
  canChangeMarker: boolean
  card: CardHole[]
}

export interface SignBody {
  ok: true
  items?: SignItem[]
  /** After a finalise: the players whose card now waits on somebody. */
  waiting?: string[]
}

type FailStatus = 400 | 401 | 403 | 404 | 409 | 503
export type SignOutcome =
  | { status: 200; body: SignBody }
  | { status: FailStatus; body: { ok: false; error: string } }

const fail = (status: FailStatus, error: string): SignOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown) => (typeof v === 'string' ? v : '')
export const NOT_READY = 'Signing cards on the server is not set up yet — the scores are safe on the card. Try again later.'

/** Whether a signature is complete: the player's approval and a marker's. */
export const signedOff = (s: Pick<Signature, 'approvedAt' | 'markedAt'>) => !!s.approvedAt && !!s.markedAt

export async function runSign(
  input: Record<string, unknown> & { token: string | null; action: unknown },
  store: SignStore,
  now: Date,
): Promise<SignOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const comp = await store.competition(str(input.code).trim().toUpperCase())
  if (!comp) return fail(404, 'No such competition.')
  const me = await store.myRow(comp.clubId, user.id)
  if (!me) return fail(403, 'This competition is for the club’s members. Sign in with the account on its list.')
  const admin = clubMay('run_events', { row: credentialsOf(me) })
  const at = now.toISOString()

  const [players, open, lock] = await Promise.all([
    store.players(comp.tripId), store.signatures(comp.roundId),
    store.roundLock ? store.roundLock(comp.roundId) : Promise.resolve({ ready: false, certifiedAt: null, noReturns: [] as string[] }),
  ])
  if (open === null) return fail(503, NOT_READY)
  // Stage (d4): a certified round's cards are closed — reopening is the admins'.
  if (lock.certifiedAt && input.action !== 'list') return fail(409, 'The results are certified — the club’s admins reopen the competition to change a card.')
  const playerById = new Map(players.map(p => [p.id, p]))
  const openFor = new Map(open.map(s => [s.playerId, s]))

  // Every list row these players and markers stand on, read once.
  const rowIds = new Set<string>()
  for (const p of players) if (p.clubMemberId) rowIds.add(p.clubMemberId)
  for (const s of open) if (s.markerMemberId) rowIds.add(s.markerMemberId)
  const extra = input.action === 'finalise' || input.action === 'marker' ? markerRowIds(input, playerById) : []
  for (const id of extra) rowIds.add(id)
  const rows = await store.rowsByIds(comp.clubId, [...rowIds])
  const rowById = new Map(rows.map(r => [r.id, r]))
  const accountOf = (playerId: string) => {
    const p = playerById.get(playerId)
    return p?.clubMemberId ? rowById.get(p.clubMemberId)?.userId ?? null : null
  }

  /** The marker asked for a player, as a linked row of the list that is not the player's own account. */
  const markerFor = (playerId: string, ask: unknown): { row: MemberRecord } | { error: string } => {
    const a = (ask && typeof ask === 'object' ? ask : {}) as MarkerAsk
    const name = playerById.get(playerId)?.name ?? 'this player'
    const rowId = a.playerId ? playerById.get(str(a.playerId))?.clubMemberId ?? null : str(a.memberId) || null
    const row = rowId ? rowById.get(rowId) : undefined
    if (!row) return { error: `Choose who marks ${name}’s card.` }
    if (!row.userId) return { error: `${row.name} needs a Green Dot account linked to the club’s list to mark a card.` }
    if (row.userId === accountOf(playerId)) return { error: `${name} can’t mark their own card — choose somebody else.` }
    return { row }
  }

  // ─── Finalise: the group's card signed and its scores written ───
  if (input.action === 'finalise') {
    const live = await store.liveCard(str(input.liveRoundId))
    if (!live || live.roundId !== comp.roundId) return fail(404, 'That card isn’t this competition’s.')
    const bookings = await store.bookings(comp.roundId)
    const myPlayer = players.find(p => p.clubMemberId === me.id)?.id ?? null
    const iAmBooked = !!myPlayer && bookings.some(b => b.playerId === myPlayer)
    if (!admin && !iAmBooked) return fail(403, 'Only the players on the tee sheet sign a card.')

    // A player already signed (or waiting) is left alone; the rest are written.
    const todo = live.playerIds.filter(id => !openFor.has(id) && playerById.has(id))
    if (todo.length === 0) {
      if (live.status !== 'finalised') await store.finaliseCard(live.id, at)
      return { status: 200, body: { ok: true, waiting: [] } }
    }
    const markers = (input.markers && typeof input.markers === 'object' ? input.markers : {}) as Record<string, unknown>
    const chosen = new Map<string, MemberRecord>()
    for (const id of todo) {
      if (lock.noReturns.includes(id)) return fail(409, `${playerById.get(id)?.name ?? 'A player'} is marked No return — the club’s admins take that off first.`)
      if (!accountOf(id)) return fail(409, `${playerById.get(id)?.name ?? 'A player'} needs a Green Dot account linked to the club’s list to sign a card.`)
      const m = markerFor(id, markers[id])
      if ('error' in m) return fail(400, m.error)
      chosen.set(id, m.row)
    }

    const [holes, hcps, saved] = await Promise.all([
      store.holes(comp.roundId), store.playingHcps(comp.roundId, todo), store.liveScores(comp.roundId, todo),
    ])
    if (holes.length === 0) return fail(409, 'This course has no scorecard yet.')
    const missing = todo.find(id => !hcps.has(id))
    if (missing) return fail(409, `${playerById.get(missing)?.name ?? 'A player'} has no handicap on this card yet — go back to the card and submit again.`)
    const card = mergeSaved({}, saved, holes.map(h => h.hole_number))
    if (!anyScored(card)) return fail(409, 'There are no scores on this card to sign. If scores were entered earlier, reopen it rather than signing an empty card.')
    const rowsOut = cardScoreRows(card, holes,
      todo.map(id => ({ id, gender: playerById.get(id)?.gender ?? 'M', playingHcp: hcps.get(id) as number })), comp.roundId)

    try {
      await store.upsertScores(rowsOut)
      await store.markCommitted(comp.roundId, todo, true)
      const out = await store.insertSignatures(todo.map(id => {
        const marker = chosen.get(id) as MemberRecord
        const player = accountOf(id) === user.id
        const marking = marker.userId === user.id
        return {
          trip_id: comp.tripId, round_id: comp.roundId, player_id: id, live_round_id: live.id,
          finalised_by: user.id, finalised_at: at,
          approved_by: player ? user.id : null, approved_at: player ? at : null,
          marker_member_id: marker.id,
          marked_by: marking ? user.id : null, marked_at: marking ? at : null, marked_as: marking ? 'marker' : null,
        }
      }))
      if (out === 'clash') return fail(409, 'This card has just been signed on another phone — look again.')
      await store.finaliseCard(live.id, at)
    } catch (e) {
      console.error('card sign failed:', e)
      return fail(503, 'Could not sign the card — try again. The scores are safe.')
    }
    // Waiting on somebody: anybody whose approval or marker is not the finaliser.
    const waiting = todo.filter(id => accountOf(id) !== user.id || chosen.get(id)?.userId !== user.id)
    return { status: 200, body: { ok: true, waiting } }
  }

  // ─── Cards to sign: this account's, or every card waiting for an admin ───
  if (input.action === 'list') {
    const items: SignItem[] = []
    for (const s of open) {
      const player = playerById.get(s.playerId)
      if (!player) continue
      const mine = accountOf(s.playerId) === user.id
      const marker = s.markerMemberId ? rowById.get(s.markerMemberId) ?? null : null
      const iMark = !!marker && marker.id === me.id
      const final = signedOff(s)
      if (!mine && !iMark && !(admin && !final)) continue
      items.push({
        playerId: s.playerId, name: player.name,
        approved: !!s.approvedAt, marked: !!s.markedAt,
        markerName: marker?.name ?? null, markedAs: s.markedAs,
        mine,
        canApprove: mine && !s.approvedAt,
        canMark: !s.markedAt && !mine && (iMark || admin),
        canSendBack: !final && (mine || iMark || admin),
        canChangeMarker: !s.markedAt && (mine || s.finalisedBy === user.id),
        card: await store.card(comp.roundId, s.playerId),
      })
    }
    // Yours first, then those waiting on you, then the rest.
    const rank = (i: SignItem) => (i.canApprove || i.canMark ? 0 : i.mine ? 1 : 2)
    items.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    return { status: 200, body: { ok: true, items } }
  }

  // ─── One player's card: approve, mark, change the marker, send it back ───
  const playerId = str(input.playerId)
  const sig = openFor.get(playerId)
  if (!sig || !playerById.has(playerId)) return fail(404, 'That card isn’t waiting to be signed.')
  const name = playerById.get(playerId)?.name ?? 'this player'
  const mine = accountOf(playerId) === user.id
  const marker = sig.markerMemberId ? rowById.get(sig.markerMemberId) ?? null : null
  const iMark = !!marker && marker.id === me.id

  try {
    if (input.action === 'approve') {
      if (!mine) return fail(403, `Only ${name} approves their own card, on their own account.`)
      if (sig.approvedAt) return { status: 200, body: { ok: true } }
      await store.updateSignature(sig.id, { approved_by: user.id, approved_at: at })
      return { status: 200, body: { ok: true } }
    }
    if (input.action === 'mark') {
      if (mine) return fail(403, 'A player never marks their own card.')
      if (!iMark && !admin) return fail(403, `${marker?.name ?? 'The chosen marker'} marks this card, or the club’s admins.`)
      if (sig.markedAt) return { status: 200, body: { ok: true } }
      await store.updateSignature(sig.id, { marked_by: user.id, marked_at: at, marked_as: iMark ? 'marker' : 'admin' })
      return { status: 200, body: { ok: true } }
    }
    if (input.action === 'marker') {
      if (sig.markedAt) return fail(409, 'This card is marked already.')
      if (!mine && sig.finalisedBy !== user.id) return fail(403, `Only ${name}, or whoever finalised the card, changes its marker.`)
      const m = markerFor(playerId, input.marker)
      if ('error' in m) return fail(400, m.error)
      const marking = m.row.userId === user.id
      await store.updateSignature(sig.id, {
        marker_member_id: m.row.id,
        ...(marking ? { marked_by: user.id, marked_at: at, marked_as: 'marker' } : {}),
      })
      return { status: 200, body: { ok: true } }
    }
    if (input.action === 'send_back') {
      if (signedOff(sig)) return fail(409, 'This card is signed by both — only reopening the competition changes it now.')
      if (!mine && !iMark && !admin) return fail(403, `Only ${name}, their marker or the club’s admins send a card back.`)
      // Closed first, so a finalise racing it writes a fresh row, never onto this one.
      await store.updateSignature(sig.id, { sent_back_by: user.id, sent_back_at: at })
      await store.deleteScores(comp.roundId, playerId)
      await store.markCommitted(comp.roundId, [playerId], false)
      if (sig.liveRoundId) await store.reopenCard(sig.liveRoundId)
      return { status: 200, body: { ok: true } }
    }
  } catch (e) {
    console.error('card signature failed:', e)
    return fail(503, 'Could not save that — try again.')
  }
  return fail(400, 'Unknown request.')
}

/** The list rows a finalise or a marker change names, so they are read with the rest. */
function markerRowIds(input: Record<string, unknown>, players: Map<string, SignPlayer>): string[] {
  const asks: unknown[] = input.action === 'marker'
    ? [input.marker]
    : Object.values(input.markers && typeof input.markers === 'object' ? input.markers as Record<string, unknown> : {})
  const out: string[] = []
  for (const a of asks) {
    if (!a || typeof a !== 'object') continue
    const m = a as MarkerAsk
    const viaPlayer = m.playerId ? players.get(str(m.playerId))?.clubMemberId : null
    const id = viaPlayer ?? (str(m.memberId) || null)
    if (id) out.push(id)
  }
  return out
}
