// Entering a club match play (stage 2; Ross, 17 Nov 2026; D264–D271).
//
// A member on the club's list enters themselves on the competition's
// Summary until entries close; their player is made from their place on the
// list (`players.club_member_id`, one per event), with the one handicap
// index (D179) — the draw seeds on it and the match page reads it. Every
// player needs their own account (D94's exception), plays here (D209) and
// may enter by the competition's rules (`entryRefusal`, judged on the day
// entries close). They take themselves out until entries close; only the
// Clubhouse takes anybody else out, until the draw (Ross, 18 Nov 2026 —
// not the Officers), from the office (`office.state`, `office.withdraw`, `keep_calendar`, logged). Singles only
// for now: a pair enters together in stage 4.
//
// Every answer to a member on the list carries the members-only door's
// cookie (D164), as booking does. Handed its store, so `test:clubs` runs it.

import { labelNeedsIndex } from '@/lib/clubMembership'
import { isAccount, type AuthUser } from '@/lib/account'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { STAFF_NAME } from '@/lib/clubhouse'
import { irishToday } from '@/lib/clubs'
import { entryRefusal, readAgeDate, refusalWords, type Category } from '@/lib/clubMembership'
import {
  enterIssue, entryDay, isPairsMatchPlay, joinIssue, matchPlayPhase, mayTakeOutOfPair, overCap, pairOf, pairOfRow,
  partnerName, withdrawEntryIssue, type PairEntry,
} from '@/lib/clubMatchPlay'
import { madeTeamName } from '@/lib/teamPicker'
import type { ActivityEntry, MemberRecord } from './club'
import type { MatchPlayComp } from './matchPlayStore'

export interface Entrant { playerId: string; rowId: string | null; name: string }

export interface MatchPlayEntryStore {
  userFromToken(token: string): Promise<AuthUser | null>
  matchPlay(code: string): Promise<MatchPlayComp | null>
  /** This account's place on the club's list — linked, not taken off. */
  myRow(clubId: string, userId: string): Promise<MemberRecord | null>
  rowsByIds(clubId: string, ids: string[]): Promise<MemberRecord[]>
  /** The one handicap index for a row (D179). */
  indexOf(row: MemberRecord): Promise<number | null>
  /** The field in the order it entered. */
  entrants(tripId: string): Promise<Entrant[]>
  /** 'clash' when this row already has a player in the event. */
  insertPlayer(row: { trip_id: string; name: string; handicap: number | null; club_member_id: string; claimed: boolean; gender: 'M' | 'F' }): Promise<string | 'clash'>
  deletePlayer(tripId: string, playerId: string): Promise<void>
  linkAccount(userId: string, tripId: string, playerId: string): Promise<void>
  /** The members-only door's cookie value, or null when guests may watch. */
  doorToken(publicHash: string | null, code: string): string | null
  memberships?(clubId: string): Promise<{ categories: Category[]; ageDate: string }>
  logActivity?(entries: ActivityEntry[]): Promise<void>
  isStaff?(userId: string): Promise<boolean>
  /** Stage 4 — a pairs match play's pairs, in the order they entered, each with who put whom in. */
  pairs?(tripId: string): Promise<PairEntry[]>
  makePair?(tripId: string, name: string, members: { playerId: string; addedBy: string | null }[]): Promise<string>
  addToPair?(tripId: string, teamId: string, playerId: string, addedBy: string | null): Promise<void>
  renamePair?(tripId: string, teamId: string, name: string): Promise<void>
  deletePair?(tripId: string, teamId: string): Promise<void>
  /** Names on the list matching what was typed — never numbers or emails (the booking's own). */
  searchRows?(clubId: string, q: string, limit: number): Promise<({ id: string; name: string; linked: boolean } & Pick<MemberRecord, 'gender' | 'birthDate' | 'categoryId'>)[]>
}

export interface EntryBody {
  ok: true
  myRowId?: string
  myPlayerId?: string | null
  /** An Officer: takes anybody out until the draw. */
  admin?: boolean
  /** Why this account may not enter by the rules, if it may not. */
  myRefusal?: string
  /** Why nobody more can enter now, if so. */
  closed?: string
  /** Why this account cannot take itself out now, if it is in and cannot. */
  stuck?: string
  entrants: { rowId: string | null; name: string }[]
  cap: number | null
  phase: string
  /** Stage 4, a pairs match play: the pairs in the order they entered. */
  pairs?: { teamId: string; members: { rowId: string | null; name: string }[] }[]
  /** This account's side in the draw — its pair's team, or its player on singles. */
  mySide?: string | null
  /** The partner's name, while this account is in a pair with one. */
  partner?: string | null
  /** The partner's list row, when this account put them in and may take them out. */
  partnerRowId?: string | null
  /** Whether this account may join a pair still looking for a partner. */
  mayJoin?: boolean
  /** `names`: the list matching what was typed, each with why they cannot partner you, if not. */
  names?: { id: string; name: string; why?: string }[]
}

export type EntryOutcome =
  | { status: 200; body: EntryBody; door: { code: string; value: string } | null }
  | { status: 400 | 401 | 403 | 404 | 409 | 503; body: { ok: false; error: string } }

type Fail = 400 | 401 | 403 | 404 | 409 | 503
const fail = (status: Fail, error: string): EntryOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export async function runMatchPlayEntry(
  input: Record<string, unknown> & { token: string | null; action: unknown },
  store: MatchPlayEntryStore,
  now: Date,
): Promise<EntryOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const mp = await store.matchPlay(str(input.code).trim().toUpperCase())
  if (!mp) return fail(404, 'No such competition.')
  const action = str(input.action)
  const me = await store.myRow(mp.clubId, user.id)

  // The Clubhouse takes an entry out (keep_calendar, D252) — staff included.
  if (action.startsWith('office.')) {
    const staff = store.isStaff ? await store.isStaff(user.id).catch(() => false) : false
    if (!clubMay('keep_calendar', { row: me ? credentialsOf(me) : null, staff })) return fail(403, 'Only someone with Clubhouse keeps the club’s competitions here.')
    if (action === 'office.state') {
      const field = await store.entrants(mp.tripId)
      const pairs = isPairsMatchPlay(mp.setup) && store.pairs ? await store.pairs(mp.tripId) : null
      return { status: 200, door: null, body: {
        ok: true, entrants: field.map(e => ({ rowId: e.rowId, name: e.name })), cap: mp.setup.maxField, phase: matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won, fielded: mp.entered > 0 }, now),
        ...(pairs ? { pairs: pairs.map(p => ({ teamId: p.teamId, members: p.members.map(x => ({ rowId: x.rowId, name: x.name })) })) } : {}),
      } }
    }
    if (action !== 'office.withdraw') return fail(400, 'Unknown request.')
    return withdraw({ store, mp, user, rowId: str(input.memberId), mine: false, admin: true, byName: me?.name ?? STAFF_NAME, byStaff: !me && staff, now, answer: null, pairs: isPairsMatchPlay(mp.setup) })
  }

  if (!me) return fail(403, 'This competition is for the club’s members. Sign in with the account on its list.')
  const admin = clubMay('run_events', { row: credentialsOf(me) })
  const tokenValue = store.doorToken(mp.publicHash, mp.code)
  const door = tokenValue ? { code: mp.code, value: tokenValue } : null

  const ms = store.memberships ? await store.memberships(mp.clubId).catch(() => ({ categories: [] as Category[], ageDate: '01-01' })) : { categories: [] as Category[], ageDate: '01-01' }
  // D288: a label's handicap band reads each person's index — only when it has one — loaded for the rows judged.
  const idx = new Map<string, number | null>()
  const loadIdx = async (rows: MemberRecord[]) => {
    if (!labelNeedsIndex(mp.entry)) return
    await Promise.all(rows.filter(r => !idx.has(r.id)).map(async r => { idx.set(r.id, await store.indexOf(r).catch(() => null)) }))
  }
  const refusalOf = (r: Pick<MemberRecord, 'gender' | 'birthDate' | 'categoryId'> & { id?: string }) => entryRefusal({
    rules: mp.entry, person: { gender: r.gender ?? null, birthDate: r.birthDate ?? null, categoryId: r.categoryId ?? null, index: r.id ? idx.get(r.id) ?? null : null },
    category: ms.categories.find(c => c.id === r.categoryId) ?? null, day: entryDay(mp.setup, irishToday(now)),
    ageDate: readAgeDate(ms.ageDate), categories: ms.categories,
  })

  const comp = mp
  const pairsMode = isPairsMatchPlay(mp.setup)
  if (pairsMode && !(store.pairs && store.makePair && store.addToPair && store.renamePair && store.deletePair)) {
    return fail(503, 'Entering as a pair isn’t set up yet.')
  }
  const readPairs = async () => (pairsMode && store.pairs ? store.pairs(mp.tripId) : [])

  const answer = async (): Promise<EntryOutcome> => {
    const [field, pairs] = await Promise.all([store.entrants(mp.tripId), readPairs()])
    const mine = field.find(e => e.rowId === me.id)?.playerId ?? null
    await loadIdx([me])
    const refused = refusalOf(me)
    const closed = enterIssue(mp.setup, { now, drawn: mp.drawn, entered: pairsMode ? pairs.length : field.length, admin: false })
    const stuck = mine ? withdrawEntryIssue(mp.setup, { now, drawn: mp.drawn, mine: true, admin: false }) : null
    const myPair = pairsMode ? pairOf(pairs, mine) : null
    const other = myPair?.members.find(x => x.rowId !== me.id) ?? null
    return {
      status: 200, door,
      body: {
        ok: true, myRowId: me.id, myPlayerId: mine, admin,
        ...(refused ? { myRefusal: refusalWords(refused) } : {}),
        ...(closed ? { closed } : {}),
        ...(stuck ? { stuck } : {}),
        entrants: field.map(e => ({ rowId: e.rowId, name: e.name })),
        cap: mp.setup.maxField,
        phase: matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won, fielded: mp.entered > 0 }, now),
        mySide: pairsMode ? myPair?.teamId ?? null : mine,
        ...(pairsMode ? {
          pairs: pairs.map(p => ({ teamId: p.teamId, members: p.members.map(x => ({ rowId: x.rowId, name: x.name })) })),
          partner: partnerName(myPair, me.id),
          partnerRowId: other && mine && other.addedBy === mine ? other.rowId : null,
          // Joining a pair one short takes no new place, so a full field still lets you in beside them.
          mayJoin: !mine && !refused && !enterIssue(mp.setup, { now, drawn: mp.drawn, entered: 0, admin: false }),
        } : {}),
      },
    }
  }

  // Somebody chosen as a partner: on the list, playing here, with their own
  // account (every player needs one), allowed in by the rules, not entered.
  const partnerIssue = async (rowId: string, pairs: PairEntry[], field: { rowId: string | null }[]): Promise<{ row: MemberRecord } | { why: string }> => {
    if (!rowId || rowId === me.id) return { why: 'Choose somebody else as your partner.' }
    const [row] = await store.rowsByIds(mp.clubId, [rowId])
    if (!row) return { why: 'That member is not on the club’s list.' }
    if (!clubMay('play', { row: credentialsOf(row) })) return { why: `${row.name}’s membership doesn’t play at the club.` }
    if (!row.userId) return { why: `${row.name} hasn’t joined Green Dot yet — every player needs their own account.` }
    await loadIdx([row])
    const refused = refusalOf(row)
    if (refused) return { why: refusalWords(refused, row.name) }
    if (field.some(e => e.rowId === row.id) || pairOfRow(pairs, row.id)) return { why: `${row.name} has already entered.` }
    return { row }
  }

  const makePlayer = async (row: MemberRecord): Promise<string | 'clash'> => store.insertPlayer({
    trip_id: mp.tripId, name: row.name, handicap: await store.indexOf(row),
    club_member_id: row.id, claimed: !!row.userId, gender: row.gender ?? 'M',
  })

  // A pair named from its players ("Ross & Dave"), kept so as they change.
  const renameFrom = async (teamId: string) => {
    const pair = (await readPairs()).find(p => p.teamId === teamId)
    if (!pair) return
    if (pair.members.length === 0) { await store.deletePair!(mp.tripId, teamId).catch(() => undefined); return }
    await store.renamePair!(mp.tripId, teamId, madeTeamName(pair.members.map(x => x.name))).catch(() => undefined)
  }

  if (action === 'state') {
    const field = await store.entrants(mp.tripId)
    const mine = field.find(e => e.rowId === me.id)?.playerId
    if (mine) await store.linkAccount(user.id, mp.tripId, mine).catch(() => undefined)
    return answer()
  }

  // Partners from the list (a pairs match play): names only, never a number or an email.
  if (action === 'names') {
    if (!pairsMode || !store.searchRows) return fail(400, 'Unknown request.')
    const q = str(input.q).trim()
    if (q.length < 2) return { status: 200, door, body: { ok: true, entrants: [], cap: mp.setup.maxField, phase: matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won, fielded: mp.entered > 0 }, now), names: [] } }
    const [rows, field, pairs] = await Promise.all([store.searchRows(mp.clubId, q.slice(0, 40), 20), store.entrants(mp.tripId), readPairs()])
    const entered = new Set(field.map(e => e.rowId))
    if (labelNeedsIndex(mp.entry)) await loadIdx(await store.rowsByIds(mp.clubId, rows.map(r => r.id)).catch(() => []))
    const names = rows.filter(r => r.id !== me.id).map(r => {
      const f = refusalOf(r)
      const why = entered.has(r.id) || pairOfRow(pairs, r.id) ? `${r.name} has already entered.`
        : !r.linked ? `${r.name} hasn’t joined Green Dot yet.`
          : f ? refusalWords(f, r.name) : null
      return { id: r.id, name: r.name, ...(why ? { why } : {}) }
    })
    return { status: 200, door, body: { ok: true, entrants: [], cap: mp.setup.maxField, phase: matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won, fielded: mp.entered > 0 }, now), names } }
  }

  if (action === 'enter' || action === 'join' || action === 'partner') {
    // D209: somebody who does not play here is in no field.
    if (action !== 'partner') {
      if (!clubMay('play', { row: credentialsOf(me) })) return fail(409, 'Your membership doesn’t play at the club — ask the office.')
      await loadIdx([me])
      const refused = refusalOf(me)
      if (refused) return fail(409, refusalWords(refused))
    }
    const [field, pairs] = await Promise.all([store.entrants(mp.tripId), readPairs()])
    const mineNow = field.find(e => e.rowId === me.id)?.playerId ?? null

    if (!pairsMode) {
      if (action !== 'enter') return fail(400, 'Unknown request.')
      if (mineNow) return answer()
      const issue = enterIssue(mp.setup, { now, drawn: mp.drawn, entered: field.length, admin: false })
      if (issue) return fail(409, issue)
      let playerId: string
      try {
        const made = await makePlayer(me)
        if (made === 'clash') return answer()
        playerId = made
      } catch (e) {
        console.error('match play entry failed:', e)
        return fail(503, 'Could not enter you — try again.')
      }
      // Two members on the last place at once: the later entry is taken back.
      const after = await store.entrants(mp.tripId)
      if (overCap(after.map(e => ({ id: e.playerId })), mp.setup.maxField).includes(playerId)) {
        await store.deletePlayer(mp.tripId, playerId).catch(() => undefined)
        return fail(409, 'Entries have just filled.')
      }
      await store.linkAccount(user.id, mp.tripId, playerId).catch(() => undefined)
      return answer()
    }

    // ── A pair ──
    if (action === 'partner') {
      const myPair = pairOf(pairs, mineNow)
      if (!mineNow || !myPair) return fail(409, 'Enter first, then add your partner.')
      if (myPair.members.length >= 2) return answer()
      // Adding to a pair takes no new place.
      const issue = enterIssue(mp.setup, { now, drawn: mp.drawn, entered: 0, admin: false })
      if (issue) return fail(409, issue)
      const pick = await partnerIssue(str(input.partnerRowId), pairs, field)
      if ('why' in pick) return fail(409, pick.why)
      return addPartner(myPair.teamId, pick.row, mineNow)
    }

    if (mineNow) return answer()

    if (action === 'join') {
      const pair = pairs.find(p => p.teamId === str(input.teamId)) ?? null
      const why = joinIssue(pair, me.id)
      if (why) return fail(409, why)
      const issue = enterIssue(mp.setup, { now, drawn: mp.drawn, entered: 0, admin: false })
      if (issue) return fail(409, issue)
      let playerId: string
      try {
        const made = await makePlayer(me)
        if (made === 'clash') return answer()
        playerId = made
        await store.addToPair!(mp.tripId, pair!.teamId, playerId, playerId)
      } catch (e) {
        console.error('match play join failed:', e)
        return fail(503, 'Could not put you in that pair — try again.')
      }
      // Two members joining the same partner at once: the later is taken back.
      const now2 = (await readPairs()).find(p => p.teamId === pair!.teamId)
      if (now2 && now2.members.length > 2 && now2.members.slice(2).some(x => x.playerId === playerId)) {
        await store.deletePlayer(mp.tripId, playerId).catch(() => undefined)
        return fail(409, 'Somebody has just joined that pair.')
      }
      await store.linkAccount(user.id, mp.tripId, playerId).catch(() => undefined)
      await renameFrom(pair!.teamId)
      return answer()
    }

    // enter — with a partner, or on your own looking for one.
    const issue = enterIssue(mp.setup, { now, drawn: mp.drawn, entered: pairs.length, admin: false })
    if (issue) return fail(409, issue)
    const partnerRowId = str(input.partnerRowId)
    let partner: MemberRecord | null = null
    if (partnerRowId) {
      const pick = await partnerIssue(partnerRowId, pairs, field)
      if ('why' in pick) return fail(409, pick.why)
      partner = pick.row
    }
    let playerId: string
    let teamId: string
    try {
      const made = await makePlayer(me)
      if (made === 'clash') return answer()
      playerId = made
      teamId = await store.makePair!(mp.tripId, madeTeamName([me.name]), [{ playerId, addedBy: playerId }])
    } catch (e) {
      console.error('match play pair entry failed:', e)
      return fail(503, 'Could not enter you — try again.')
    }
    // Two pairs on the last place at once: the later is taken back.
    const after = await readPairs()
    if (overCap(after.map(p => ({ id: p.teamId })), mp.setup.maxField).includes(teamId)) {
      await store.deletePlayer(mp.tripId, playerId).catch(() => undefined)
      await store.deletePair!(mp.tripId, teamId).catch(() => undefined)
      return fail(409, 'Entries have just filled.')
    }
    await store.linkAccount(user.id, mp.tripId, playerId).catch(() => undefined)
    if (partner) return addPartner(teamId, partner, playerId)
    return answer()
  }

  // A partner put in a pair of one, by the member already in it.
  async function addPartner(teamId: string, row: MemberRecord, by: string): Promise<EntryOutcome> {
    let partnerId: string
    try {
      const made = await makePlayer(row)
      if (made === 'clash') return fail(409, `${row.name} has just entered.`)
      partnerId = made
      await store.addToPair!(comp.tripId, teamId, partnerId, by)
    } catch (e) {
      console.error('match play partner failed:', e)
      return fail(503, 'Could not add your partner — you’re entered, looking for one. Try again.')
    }
    const pair = (await readPairs()).find(p => p.teamId === teamId)
    if (pair && pair.members.length > 2 && pair.members.slice(2).some(x => x.playerId === partnerId)) {
      await store.deletePlayer(comp.tripId, partnerId).catch(() => undefined)
      return fail(409, 'Somebody has just joined your pair.')
    }
    if (row.userId) await store.linkAccount(row.userId, comp.tripId, partnerId).catch(() => undefined)
    await renameFrom(teamId)
    return answer()
  }

  if (action === 'withdraw') {
    const rowId = str(input.memberId) || me.id
    if (pairsMode && rowId !== me.id) {
      // Your partner, only where you put them in (medium security).
      const [field, pairs] = await Promise.all([store.entrants(mp.tripId), readPairs()])
      const mine = field.find(e => e.rowId === me.id)?.playerId ?? null
      const pair = pairOf(pairs, mine)
      const them = pair?.members.find(x => x.rowId === rowId)
      if (!pair || !mine || !them || !mayTakeOutOfPair(pair, mine, them.playerId)) return fail(403, 'You can take out yourself and a partner you put in.')
      return withdraw({ store, mp, user, rowId, mine: true, admin: false, byName: me.name, byStaff: false, now, answer, pairs: pairsMode })
    }
    // Your own entry only, until entries close: taking anybody else out is the Clubhouse's (Ross, 18 Nov 2026).
    return withdraw({ store, mp, user, rowId, mine: rowId === me.id, admin: false, byName: me.name, byStaff: false, now, answer, pairs: pairsMode })
  }

  return fail(400, 'Unknown request.')
}

/** One entry taken out — yourself, or by an Officer or the office (logged). */
async function withdraw(o: {
  store: MatchPlayEntryStore; mp: MatchPlayComp; user: AuthUser; rowId: string; mine: boolean; admin: boolean
  byName: string; byStaff: boolean; now: Date; answer: (() => Promise<EntryOutcome>) | null
  /** A pairs match play: the pair is tidied after — renamed, or gone with nobody left. */
  pairs?: boolean
}): Promise<EntryOutcome> {
  const { store, mp } = o
  const field = await store.entrants(mp.tripId)
  const entry = field.find(e => e.rowId === o.rowId)
  if (!entry) return fail(404, 'That member isn’t entered.')
  const issue = withdrawEntryIssue(mp.setup, { now: o.now, drawn: mp.drawn, mine: o.mine, admin: o.admin })
  if (issue) return fail(403, issue)
  const pair = o.pairs && store.pairs ? pairOf(await store.pairs(mp.tripId), entry.playerId) : null
  try {
    await store.deletePlayer(mp.tripId, entry.playerId)
  } catch (e) {
    console.error('match play withdraw failed:', e)
    return fail(503, 'Could not take the entry out — try again.')
  }
  // The pair left behind is looking for a partner again; with nobody left, it goes.
  if (pair) {
    const left = pair.members.filter(x => x.playerId !== entry.playerId)
    if (left.length === 0) await store.deletePair?.(mp.tripId, pair.teamId).catch(() => undefined)
    else await store.renamePair?.(mp.tripId, pair.teamId, madeTeamName(left.map(x => x.name))).catch(() => undefined)
  }
  if (!o.mine && store.logActivity) {
    await store.logActivity([{
      clubId: mp.clubId, byUser: o.user.id, byName: o.byName, byStaff: o.byStaff, action: 'comp.withdraw',
      memberId: entry.rowId, memberName: entry.name, changes: { [mp.code]: ['entered', 'taken out'] }, batchId: null,
    }]).catch(e => console.error('club activity not logged:', e))
  }
  if (o.answer) return o.answer()
  const rest = field.filter(e => e.playerId !== entry.playerId)
  return {
    status: 200, door: null,
    body: { ok: true, entrants: rest.map(e => ({ rowId: e.rowId, name: e.name })), cap: mp.setup.maxField, phase: matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won, fielded: mp.entered > 0 }, o.now) },
  }
}
