// The service-role store behind /api/club (./club.ts). Every club table is
// closed to phones (migration 086); only this reaches them.

import { matchPlayKeyDates, matchPlayPhase, overdueMatches, readClubMatchPlay } from '@/lib/clubMatchPlay'
import { readMyClubMatches, readPairPartners } from './matchPlayStore'
import { readClubDraw } from './matchPlayDraw'
import { randomBytes } from 'crypto'
import { Resend } from 'resend'
import { handicapStore } from '../handicaps/store'
import type { createAdminClient } from '@/lib/supabase-admin'
import { SITE } from '@/config/site'
import { parseClubAccess, type ClubEvent, type ClubRole, type ListRow } from '@/lib/clubs'
import { compPhase, type CompPhase } from '@/lib/compPhase'
import { teeInstant } from '@/lib/clubComp'
import { opensAt, parseTeeRules, sheetCapacity, teeClocks } from '@/lib/teeSheet'
import { deleteNote, readClubHidden, readMemberHiddenOf, readNotes, saveNote, writeClubHidden } from './notesStore'
import { deletePreset, readPresets, savePreset } from './presetsStore'
import type { SeasonRow } from '@/lib/cardSummary'
import type { AttemptWindow } from '@/lib/membership'
import { asUser, userFromClaims } from '../account/store'
import { readSeason } from '../stats/season'
import type { ClubRecord, ClubStore, MemberRecord } from './club'
import type { ListQuery, PageRecord } from './clubhouse'
import { SORT_COLUMN, type ListCounts, type SeasonEvent } from '@/lib/clubhouse'
import { readAllRows } from '@/lib/allRows'
import { LEGACY_RUNNING_ROLES } from '@/lib/clubMay'
import { TicksNotReady, asRow, isMissingColumn, missingSet, peopleMissing, peopleOn, rowCols, ticksMissing, ticksOn, withTicks, type RowRow } from './rows'
import { birthRange, cleanDays, entryLine, readEntryRules, type Category, type RowExtras } from '@/lib/clubMembership'

export { asRow, rowCols, withTicks, isMissingColumn, TicksNotReady, type RowRow }

type Db = ReturnType<typeof createAdminClient>

const CLUB_COLS = 'id, slug, name, verified_at, refused_at, colour, crest_path'
const SEND_TIMEOUT_MS = 8000

type ClubRow = { id: string; slug: string; name: string; verified_at: string | null; refused_at: string | null; colour?: string | null; crest_path?: string | null }
const asClub = (c: ClubRow): ClubRecord => ({
  id: c.id, slug: c.slug, name: c.name, verifiedAt: c.verified_at, refusedAt: c.refused_at,
  colour: c.colour ?? null, crestPath: c.crest_path ?? null,
})

/**
 * The art paths (migration 087) laid onto clubs read without them, in a
 * query of their own: before 087 there are none, and nothing else changes.
 */
async function withArt(db: Db, clubs: ClubRecord[]): Promise<ClubRecord[]> {
  if (clubs.length === 0) return clubs
  const { data, error } = await db.from('clubs').select('id, art_path, art_dark_path').in('id', clubs.map(c => c.id))
  if (error) return clubs
  const art = new Map(((data ?? []) as { id: string; art_path: string | null; art_dark_path: string | null }[]).map(r => [r.id, r]))
  return clubs.map(c => ({ ...c, artPath: art.get(c.id)?.art_path ?? null, artDarkPath: art.get(c.id)?.art_dark_path ?? null }))
}
/** Where a code's email points people: greendot.live, or the preview's own. */
export function siteOrigin(): string {
  const preview = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
  return preview ? `https://${process.env.VERCEL_URL}` : 'https://greendot.live'
}

/**
 * Every event under a club (086's `trip_private.club_id`), with who changes
 * it. The club page and the members home both read through this.
 */
export async function readClubEvents(db: Db, clubId: string): Promise<ClubEvent[]> {
  const { data: priv, error } = await db.from('trip_private').select('trip_id, club_access').eq('club_id', clubId)
  if (error || !priv?.length) return []
  const access = new Map((priv as { trip_id: string; club_access: string | null }[]).map(p => [p.trip_id, parseClubAccess(p.club_access)]))
  const ids = [...access.keys()]
  const [{ data: trips, error: e }, comps] = await Promise.all([
    db.from('trips').select('id, trip_code, name, kind, start_date, end_date').in('id', ids),
    // Stage (d2): which are competitions, and members only (089 — fail-soft).
    db.from('trips').select('id, competition, public_passcode_hash, bracket_setup').in('id', ids).eq('competition', 'club'),
  ])
  if (e) throw e
  const compRows = (comps.error ? [] : comps.data ?? []) as { id: string; public_passcode_hash: string | null; bracket_setup?: unknown }[]
  const phases = compRows.length ? await competitionPhases(db, compRows.map(c => c.id)) : new Map<string, CompPhase>()
  const compOf = new Map(compRows.map(c => [c.id, { phase: phases.get(c.id) ?? 'announced', membersOnly: !!c.public_passcode_hash, ...(readClubMatchPlay(c.bracket_setup) ? { matchPlay: true as const } : {}) }]))
  return ((trips ?? []) as { id: string; trip_code: string; name: string; kind: string | null; start_date: string | null; end_date: string | null }[])
    .map(t => ({
      code: t.trip_code, name: t.name,
      kind: t.kind === 'tournament' || t.kind === 'run' ? t.kind : 'trip',
      startDate: t.start_date, endDate: t.end_date, access: access.get(t.id) ?? null,
      ...(compOf.has(t.id) ? { competition: compOf.get(t.id)! } : {}),
    }))
}

/**
 * Each competition's phase for Comps (D169): from its sheet's opening, its
 * first tee time, whether a card has started, and — from stage (d3) — who
 * is booked and whose card is final: one read of the rounds, then the cards,
 * the bookings, the signatures, the No returns and the certification together (d4).
 */
async function competitionPhases(db: Db, tripIds: string[]): Promise<Map<string, CompPhase>> {
  const { data: rounds } = await db.from('rounds').select('id, trip_id, scheduled_date, tee_sheet').in('trip_id', tripIds)
  const rs = (rounds ?? []) as { id: string; trip_id: string; scheduled_date: string | null; tee_sheet?: unknown }[]
  const roundIds = rs.map(r => r.id)
  const [{ data: cards }, { data: seats }, sigs, nrs, certs] = roundIds.length
    ? await Promise.all([
        db.from('live_rounds').select('round_id').in('round_id', roundIds),
        db.from('tee_assignments').select('round_id, player_id').in('round_id', roundIds),
        db.from('card_signatures').select('round_id, player_id, approved_at, marked_at').in('round_id', roundIds).is('sent_back_at', null),
        // Stage (d4), migration 091 — each in its own query, none before it.
        db.from('round_no_returns').select('round_id, player_id').in('round_id', roundIds),
        db.from('rounds').select('id, certified_at').in('id', roundIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
  const started = new Set(((cards ?? []) as { round_id: string }[]).map(c => c.round_id))
  // Stage (d3): booked players, and those whose card is final — approved and
  // marked — so a competition reads Awaiting sign-off once all are. Before 090, none.
  const bookedOf = new Map<string, Set<string>>()
  for (const a of (seats ?? []) as { round_id: string; player_id: string }[]) {
    if (!bookedOf.has(a.round_id)) bookedOf.set(a.round_id, new Set())
    bookedOf.get(a.round_id)!.add(a.player_id)
  }
  // Accounted for: a card final, or a No return (d4).
  const doneOf = new Map<string, Set<string>>()
  const done = (round: string, player: string) => {
    if (!bookedOf.get(round)?.has(player)) return
    if (!doneOf.has(round)) doneOf.set(round, new Set())
    doneOf.get(round)!.add(player)
  }
  if (!sigs.error) {
    for (const s of (sigs.data ?? []) as { round_id: string; player_id: string; approved_at: string | null; marked_at: string | null }[]) {
      if (s.approved_at && s.marked_at) done(s.round_id, s.player_id)
    }
  }
  if (!nrs.error) for (const n of (nrs.data ?? []) as { round_id: string; player_id: string }[]) done(n.round_id, n.player_id)
  const certifiedOf = new Map(certs.error ? [] : ((certs.data ?? []) as { id: string; certified_at?: string | null }[]).map(r => [r.id, r.certified_at ?? null]))
  const now = Date.now()
  const out = new Map<string, CompPhase>()
  for (const r of rs) {
    const rules = parseTeeRules(r.tee_sheet)
    if (!rules || !r.scheduled_date) continue
    const first = teeClocks(rules)[0]
    out.set(r.trip_id, compPhase({
      bookingOpensAt: opensAt(rules, r.scheduled_date)?.getTime() ?? null,
      firstTeeAt: first ? teeInstant(r.scheduled_date, first) : null,
      booked: bookedOf.get(r.id)?.size ?? 0, finished: doneOf.get(r.id)?.size ?? 0,
      cardsStarted: started.has(r.id), certifiedAt: certifiedOf.get(r.id) ?? null,
    }, now))
  }
  // A club match play has no round (Ross, 17 Nov 2026): its phase is read
  // off its setup and its draw — drawn once a match exists, finished once
  // the Final (the match that feeds nothing) has a winner.
  const rest = tripIds.filter(id => !out.has(id))
  if (rest.length) {
    const [{ data: setups }, { data: matches }] = await Promise.all([
      db.from('trips').select('id, bracket_setup').in('id', rest),
      db.from('matchplay_matches').select('trip_id, next_match_id, winner_player_id, winner_team_id').in('trip_id', rest),
    ])
    const drawn = new Set<string>()
    const won = new Set<string>()
    for (const m of (matches ?? []) as { trip_id: string; next_match_id: string | null; winner_player_id: string | null; winner_team_id?: string | null }[]) {
      drawn.add(m.trip_id)
      if (!m.next_match_id && (m.winner_player_id || m.winner_team_id)) won.add(m.trip_id)
    }
    for (const t of (setups ?? []) as { id: string; bracket_setup: unknown }[]) {
      const mp = readClubMatchPlay(t.bracket_setup)
      if (mp) out.set(t.id, matchPlayPhase(mp, { drawn: drawn.has(t.id), won: won.has(t.id) }, new Date(now)))
    }
  }
  return out
}

/** Whether migration 093's column is in: tried, and not again for a minute after it is found missing. */
let invitedMissingAt = 0
const invitedOn = () => Date.now() - invitedMissingAt > 60_000

/**
 * A page of the Clubhouse's grid (D207): searched, filtered and ordered by
 * the database, 50 rows (or 1,000 for the download) and the count of all
 * that match — one round trip — then each row's own index and when its code
 * went, for those rows alone. Every part fail-soft before 092 and 093.
 */
export async function readListPage(db: Db, clubId: string, o: ListQuery): Promise<{ rows: PageRecord[]; total: number }> {
  const run = (ticks: boolean, invited: boolean, people: boolean) => {
    let q = db.from('club_members').select(`${rowCols(ticks, people)}${invited ? ', invited_at' : ''}`, { count: 'exact' }).eq('club_id', clubId)
    if (o.q) {
      const like = `%${o.q}%`
      q = q.or(`name.ilike.${like},email.ilike.${like},member_number.ilike.${like},gui_number.ilike.${like}`)
    }
    const live = () => q.is('removed_at', null)
    switch (o.filter) {
      case 'off': q = q.not('removed_at', 'is', null); break
      case 'joined': q = live().not('user_id', 'is', null); break
      case 'invited': q = invited ? live().is('user_id', null).not('invited_at', 'is', null) : live().is('user_id', null); break
      case 'not_invited': q = invited ? live().is('user_id', null).is('invited_at', null) : live().is('user_id', null); break
      case 'officer': q = ticks ? live().eq('officer', true) : live().in('role', LEGACY_RUNNING_ROLES); break
      case 'clubhouse': q = ticks ? live().eq('clubhouse', true) : live().in('role', LEGACY_RUNNING_ROLES); break
      default: q = live()
    }
    // Stage (m): gender, membership and age (094). Before it, asking for any
    // of them finds nobody — nobody has one yet.
    const nobody = () => q.eq('id', '00000000-0000-0000-0000-000000000000')
    if (o.gender) q = !people ? nobody() : o.gender === 'none' ? q.is('gender', null) : q.eq('gender', o.gender)
    if (o.category) q = !people ? (o.category === 'none' ? q : nobody()) : o.category === 'none' ? q.is('category_id', null) : q.eq('category_id', o.category)
    if (o.ageMin !== undefined || o.ageMax !== undefined) {
      if (!people) q = nobody()
      else {
        const { latest, earliest } = birthRange(o.ageOn, o.ageMin ?? null, o.ageMax ?? null)
        if (latest) q = q.lte('birth_date', latest)
        if (earliest) q = q.gt('birth_date', earliest)
      }
    }
    return q.order(SORT_COLUMN[o.sort], { ascending: !o.desc, nullsFirst: false }).order('id').range(o.page * o.size, o.page * o.size + o.size - 1)
  }
  // Three sets may be missing (092's ticks, 093's invited_at, 094's people): the error says which.
  let ticks = ticksOn(), invited = invitedOn(), people = peopleOn()
  let r = await run(ticks, invited, people)
  for (let i = 0; i < 3 && r.error && isMissingColumn(r.error); i++) {
    const msg = (r.error as { message?: string }).message ?? ''
    if (invited && /invited_at/.test(msg)) { invited = false; invitedMissingAt = Date.now() }
    else if (people && missingSet(r.error as { message?: string }) === 'people') { people = false; peopleMissing() }
    else if (ticks) { ticks = false; ticksMissing() }
    else break
    r = await run(ticks, invited, people)
  }
  if (r.error) throw r.error
  const raw = (r.data ?? []) as unknown as (RowRow & { invited_at?: string | null })[]
  const ids = raw.map(x => x.id)
  // The unlinked rows' own index (089), for these rows alone.
  const own = ids.length ? await db.from('club_members').select('id, handicap_index').in('id', ids).not('handicap_index', 'is', null) : { data: [], error: null }
  const ownOf = new Map((own.error ? [] : (own.data ?? []) as { id: string; handicap_index: unknown }[]).map(x => [x.id, Number(x.handicap_index)]))
  return {
    rows: raw.map(x => ({ ...asRow(x), invitedAt: x.invited_at ?? null, ownIndex: ownOf.get(x.id) ?? null })),
    total: r.count ?? raw.length,
  }
}

/** The list's counts for the Overview and the filters, all at once — head counts, no rows read. */
export async function readListCounts(db: Db, clubId: string): Promise<ListCounts> {
  const base = () => db.from('club_members').select('id', { count: 'exact', head: true }).eq('club_id', clubId)
  const live = () => base().is('removed_at', null)
  const n = async (q: PromiseLike<{ count: number | null; error: { code?: string } | null }>): Promise<number | null> => {
    const r = await q
    return r.error ? null : r.count ?? 0
  }
  const [onList, joined, invited, off, officer, clubhouse, noEmail, noGender, noCategory] = await Promise.all([
    n(live()), n(live().not('user_id', 'is', null)),
    n(live().is('user_id', null).not('invited_at', 'is', null)),
    n(base().not('removed_at', 'is', null)),
    n(live().eq('officer', true)), n(live().eq('clubhouse', true)),
    n(live().is('user_id', null).is('email', null)),
    // Stage (m), 094 — null before it.
    n(live().is('gender', null)), n(live().is('category_id', null)),
  ])
  // Before 092 the ticks are read off the role.
  const [legacyRun] = officer === null ? await Promise.all([n(live().in('role', LEGACY_RUNNING_ROLES))]) : [null]
  const on = onList ?? 0, j = joined ?? 0
  return {
    onList: on, joined: j, invited, notJoined: Math.max(0, on - j), off: off ?? 0,
    officer: officer ?? legacyRun ?? 0, clubhouse: clubhouse ?? legacyRun ?? 0, noEmail: noEmail ?? 0,
    noGender, noCategory,
  }
}

/**
 * Every event under the club with what the Clubhouse's Competitions table
 * and Calendar show (stage (k2), D214, D215): a competition's course, format,
 * phase and how many are booked of how many places. The events first, then
 * their trips' boards and rounds together, then the courses and the
 * bookings (past 1,000 rows) together.
 */
export async function readClubSeason(db: Db, clubId: string): Promise<SeasonEvent[]> {
  const events = await readClubEvents(db, clubId)
  const comps = events.filter(e => e.competition)
  const base = (e: ClubEvent): SeasonEvent => ({ code: e.code, name: e.name, kind: e.kind, type: e.competition ? 'COMP' : e.kind === 'run' ? 'SPORT' : 'GOLF', startDate: e.startDate, endDate: e.endDate, competition: null })
  if (!comps.length) return events.map(base)
  const { data: trips } = await db.from('trips').select('id, trip_code, leaderboards, bracket_setup').in('trip_code', comps.map(c => c.code))
  const tripRows = (trips ?? []) as { id: string; trip_code: string; leaderboards: unknown; bracket_setup?: unknown }[]
  // A club match play (Ross, 17 Nov 2026): no round, its own facts, and how many have entered.
  const matchPlayOf = new Map(tripRows.flatMap(t => { const m = readClubMatchPlay(t.bracket_setup); return m ? [[t.id, m] as const] : [] }))
  const entrants = matchPlayOf.size
    ? await db.from('players').select('trip_id').in('trip_id', [...matchPlayOf.keys()])
    : { data: [] }
  // A Fourball or Foursomes match play counts its pairs (stage 4) — a team each on the draw's sheet.
  const pairTrips = [...matchPlayOf].filter(([, m]) => m.format !== 'singles').map(([id]) => id)
  const pairRows = pairTrips.length
    ? await db.from('teams').select('trip_id').in('trip_id', pairTrips).eq('team_set', 'set-2')
    : { data: [] }
  const enteredOf = new Map<string, number>()
  for (const p of (entrants.data ?? []) as { trip_id: string }[]) if (!pairTrips.includes(p.trip_id)) enteredOf.set(p.trip_id, (enteredOf.get(p.trip_id) ?? 0) + 1)
  for (const t of (pairRows.data ?? []) as { trip_id: string }[]) enteredOf.set(t.trip_id, (enteredOf.get(t.trip_id) ?? 0) + 1)
  const { data: rounds } = tripRows.length ? await db.from('rounds').select('id, trip_id, course_id, tee_sheet').in('trip_id', tripRows.map(t => t.id)) : { data: [] }
  const roundRows = (rounds ?? []) as { id: string; trip_id: string; course_id: string; tee_sheet?: unknown }[]
  const [courses, seats, entries, cats] = await Promise.all([
    roundRows.length ? db.from('courses').select('id, name').in('id', [...new Set(roundRows.map(r => r.course_id))]) : Promise.resolve({ data: [] }),
    roundRows.length
      ? readAllRows<{ id: string; round_id: string }>(() => db.from('tee_assignments').select('id, round_id', { count: 'exact' }).in('round_id', roundRows.map(r => r.id)).order('id'), r => r.id)
      : Promise.resolve({ data: [], error: null }),
    // Stage (m): each competition's entry rules (094) — none before it.
    tripRows.length ? db.from('trip_private').select('trip_id, entry_rules').in('trip_id', tripRows.map(t => t.id)) : Promise.resolve({ data: [], error: null }),
    readCategories(db, clubId),
  ])
  const entryOf = new Map(entries.error ? [] : ((entries.data ?? []) as { trip_id: string; entry_rules: unknown }[]).map(x => [x.trip_id, entryLine(readEntryRules(x.entry_rules), cats)]))
  const courseName = new Map(((courses.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
  const booked = new Map<string, number>()
  for (const a of seats.data ?? []) booked.set(a.round_id, (booked.get(a.round_id) ?? 0) + 1)
  return events.map(e => {
    if (!e.competition) return base(e)
    const trip = tripRows.find(t => t.trip_code === e.code)
    const round = trip ? roundRows.find(r => r.trip_id === trip.id) : undefined
    const mp = trip ? matchPlayOf.get(trip.id) : undefined
    const board = (Array.isArray(trip?.leaderboards) ? trip!.leaderboards : []).find(b => mp ? (b as { competition?: string }).competition === 'matchplay' : (b as { clubCompetition?: boolean }).clubCompetition) as { scoring?: string; handicapAllowance?: number } | undefined
    const rules = parseTeeRules(round?.tee_sheet)
    return {
      ...base(e),
      competition: {
        phase: e.competition.phase,
        courseName: round ? courseName.get(round.course_id) ?? null : null,
        scoring: board?.scoring === 'strokes' ? 'strokes' as const : 'stableford' as const,
        allowance: typeof board?.handicapAllowance === 'number' ? board.handicapAllowance : 100,
        booked: round ? booked.get(round.id) ?? 0 : 0,
        capacity: rules ? sheetCapacity(rules) : 0,
        membersOnly: e.competition.membersOnly,
        ...(trip && entryOf.get(trip.id) ? { entry: entryOf.get(trip.id)! } : {}),
        ...(trip && mp ? { matchPlay: { format: mp.format, cap: mp.maxField, entered: enteredOf.get(trip.id) ?? 0, keyDates: matchPlayKeyDates(mp) } } : {}),
      },
    }
  })
}

/** A club's memberships in their order (094 — none before it). */
export async function readCategories(db: Db, clubId: string): Promise<Category[]> {
  const { data, error } = await db.from('club_categories').select('id, name, code, days, position').eq('club_id', clubId).order('position').order('name')
  if (error) return []
  return ((data ?? []) as { id: string; name: string; code: string; days: number[] | null }[]).map(c => ({ id: c.id, name: c.name, code: c.code, days: cleanDays(c.days ?? []) }))
}

export function clubStore(db: Db): ClubStore {
  return {
    async userFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      return error ? null : asUser(data.user)
    },
    readerFromToken: token => userFromClaims(db, token),
    async clubHome(slug, userId) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 48) return { club: null, row: null, events: [], comps: [] }
      // D195: three reads at once, each by the club's address — the club
      // with its art and home course (087, 089), this account's row, and the
      // club's events with their trips. Any of them refused (a column not
      // there yet) and the caller reads one by one as before.
      const [c, r, p] = await Promise.all([
        db.from('clubs').select(`${CLUB_COLS}, art_path, art_dark_path, home_course_id`).eq('slug', slug).maybeSingle(),
        withTicks(t => db.from('club_members').select(`${rowCols(t)}, clubs!inner(slug)`).eq('clubs.slug', slug).eq('user_id', userId).is('removed_at', null).limit(1)),
        db.from('trip_private')
          .select('trip_id, club_access, clubs!inner(slug), trips!inner(id, trip_code, name, kind, start_date, end_date, competition, public_passcode_hash, bracket_setup)')
          .eq('clubs.slug', slug),
      ])
      if (c.error || r.error || p.error) return null
      const cr = c.data as (ClubRow & { art_path: string | null; art_dark_path: string | null; home_course_id: string | null }) | null
      const club = cr ? { ...asClub(cr), artPath: cr.art_path, artDarkPath: cr.art_dark_path, homeCourseId: cr.home_course_id } : null
      const row = ((r.data ?? []) as unknown as RowRow[])[0]
      type Trip = { id: string; trip_code: string; name: string; kind: string | null; start_date: string | null; end_date: string | null; competition: string | null; public_passcode_hash: string | null; bracket_setup?: unknown }
      const privs = (p.data ?? []) as unknown as { club_access: string | null; trips: Trip | Trip[] | null }[]
      const trips = privs.flatMap(x => {
        const t = Array.isArray(x.trips) ? x.trips[0] : x.trips
        return t ? [{ t, access: parseClubAccess(x.club_access) }] : []
      })
      const events: ClubEvent[] = trips.map(({ t, access }) => ({
        code: t.trip_code, name: t.name,
        kind: t.kind === 'tournament' || t.kind === 'run' ? t.kind : 'trip',
        startDate: t.start_date, endDate: t.end_date, access,
        ...(t.competition === 'club' ? { competition: { phase: 'announced' as CompPhase, membersOnly: !!t.public_passcode_hash, ...(readClubMatchPlay(t.bracket_setup) ? { matchPlay: true as const } : {}) } } : {}),
      }))
      const comps = trips.filter(x => x.t.competition === 'club').map(x => ({ tripId: x.t.id, code: x.t.trip_code }))
      return { club, row: row ? asRow(row) : null, events, comps }
    },
    myMatches: (rowId, codes) => readMyClubMatches(db, rowId, codes),
    pairPartners: (rowId, codes) => readPairPartners(db, rowId, codes),
    async overdueCount(code, today) {
      const draw = await readClubDraw(code)
      return draw ? overdueMatches(draw.rounds, draw.view.names, today).length : 0
    },
    async compPhases(comps) {
      const byTrip = await competitionPhases(db, comps.map(c => c.tripId))
      return new Map(comps.flatMap(c => (byTrip.has(c.tripId) ? [[c.code, byTrip.get(c.tripId)!] as [string, CompPhase]] : [])))
    },
    async clubsOf(userId) {
      const { data, error } = await withTicks(t => db.from('club_members').select(rowCols(t)).eq('user_id', userId).is('removed_at', null))
      if (error) throw error
      const rows = (data ?? []) as unknown as RowRow[]
      if (rows.length === 0) return []
      const { data: clubs, error: e } = await db.from('clubs').select(CLUB_COLS).in('id', rows.map(r => r.club_id))
      if (e) throw e
      const byId = new Map((await withArt(db, ((clubs ?? []) as ClubRow[]).map(asClub))).map(c => [c.id, c]))
      return rows.filter(r => byId.has(r.club_id)).map(r => ({ club: byId.get(r.club_id)!, row: asRow(r) }))
        .sort((a, b) => a.club.name.localeCompare(b.club.name))
    },
    async slugsLike(base) {
      const { data, error } = await db.from('clubs').select('slug').like('slug', `${base}%`)
      if (error) throw error
      return ((data ?? []) as { slug: string }[]).map(r => r.slug)
    },
    async createClub(c, owner) {
      const now0 = new Date().toISOString()
      const { data, error } = await db.from('clubs')
        .insert({ slug: c.slug, name: c.name, created_by: c.createdBy, ...(c.verified ? { verified_at: now0 } : {}) }).select(CLUB_COLS).single()
      if (error || !data) throw error ?? new Error('No club came back.')
      const club = asClub(data as ClubRow)
      const now = new Date().toISOString()
      const { error: e } = await db.from('club_members').insert({
        club_id: club.id, name: owner.name, email: owner.email, role: 'owner', user_id: owner.userId, linked_at: now,
      })
      if (e) {
        await db.from('clubs').delete().eq('id', club.id)
        throw e
      }
      return club
    },
    async club(clubId) {
      const { data, error } = await db.from('clubs').select(CLUB_COLS).eq('id', clubId).maybeSingle()
      if (error) {
        if (error.code === '22P02') return null // not a uuid
        throw error
      }
      if (!data) return null
      const [club] = await withArt(db, [asClub(data as ClubRow)])
      // D161: its home course (089) and stage (m)'s age date (094), each in a
      // query of its own — none before its migration.
      const [home, age] = await Promise.all([
        db.from('clubs').select('home_course_id').eq('id', clubId).maybeSingle(),
        db.from('clubs').select('age_date').eq('id', clubId).maybeSingle(),
      ])
      return {
        ...club,
        homeCourseId: home.error ? null : (home.data as { home_course_id: string | null } | null)?.home_course_id ?? null,
        ageDate: age.error ? null : (age.data as { age_date: string | null } | null)?.age_date ?? null,
      }
    },
    async rows(clubId) {
      // A club's list can pass Supabase's 1,000-row page: read in pages.
      const out: MemberRecord[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await withTicks(t => db.from('club_members').select(rowCols(t))
          .eq('club_id', clubId).order('name').order('id').range(from, from + 999))
        if (error) throw error
        const page = (data ?? []) as unknown as RowRow[]
        out.push(...page.map(asRow))
        if (page.length < 1000) break
      }
      return out
    },
    async insertRows(clubId, rows: ListRow[], extras?: RowExtras[]) {
      let n = 0
      for (let i = 0; i < rows.length; i += 500) {
        const base = rows.slice(i, i + 500).map(r => ({
          club_id: clubId, name: r.name, member_number: r.memberNumber, gui_number: r.guiNumber, email: r.email,
        }))
        // Stage (m)'s cells go in beside them while 094 is in; before it, without.
        const full = base.map((b, j) => {
          const e = extras?.[i + j]
          return e && peopleOn()
            ? { ...b, ...(e.gender !== undefined ? { gender: e.gender } : {}), ...(e.birthDate !== undefined ? { birth_date: e.birthDate } : {}), ...(e.categoryId !== undefined ? { category_id: e.categoryId } : {}) }
            : b
        })
        let { error } = await db.from('club_members').insert(full)
        if (isMissingColumn(error) && missingSet(error) === 'people') { peopleMissing(); ({ error } = await db.from('club_members').insert(base)) }
        if (error) throw error
        n += base.length
      }
      return n
    },
    async updateRow(id, patch) {
      const { error } = await db.from('club_members').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
      if (error?.code === '23505') return 'clash'
      if (isMissingColumn(error) && ['officer', 'clubhouse', 'category_id', 'gender', 'birth_date'].some(k => k in patch)) throw new TicksNotReady()
      if (error) throw error
      return 'ok'
    },
    async logActivity(entries) {
      if (entries.length === 0) return
      for (let i = 0; i < entries.length; i += 500) {
        const { error } = await db.from('club_activity').insert(entries.slice(i, i + 500).map(e => ({
          club_id: e.clubId, by_user: e.byUser, by_name: e.byName, by_staff: e.byStaff, action: e.action,
          member_id: e.memberId, member_name: e.memberName, changes: e.changes, batch_id: e.batchId,
        })))
        // Before migration 092 there is no log: nothing is lost but the entry.
        if (error) { if (!isMissingColumn(error) && error.code !== '42P01' && error.code !== 'PGRST205') console.error('club activity not logged:', error); return }
      }
    },
    async lastInviteAt(memberId) {
      const { data, error } = await db.from('club_invites').select('created_at').eq('member_id', memberId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return (data as { created_at?: string } | null)?.created_at ?? null
    },
    async saveInvite(i) {
      const { error } = await db.from('club_invites').insert({ member_id: i.memberId, email: i.email, code_hash: i.codeHash, expires_at: i.expiresAt })
      if (error) throw error
    },
    async sendEmail(to, subject, html, text) {
      const key = process.env.RESEND_API_KEY
      if (!key) return false
      const send = new Resend(key).emails.send({ from: `Green Dot <${SITE.supportEmail}>`, to, subject, html, text })
      const result = await Promise.race([
        send,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('send timed out')), SEND_TIMEOUT_MS)),
      ])
      if (result.error) throw result.error
      return true
    },
    async inviteByHash(hash) {
      const { data, error } = await db.from('club_invites').select('id, member_id, expires_at, used_at').eq('code_hash', hash).maybeSingle()
      if (error) throw error
      const r = data as { id: string; member_id: string; expires_at: string; used_at: string | null } | null
      return r ? { id: r.id, memberId: r.member_id, expiresAt: r.expires_at, usedAt: r.used_at } : null
    },
    async useInvite(id, at) {
      const { data, error } = await db.from('club_invites').update({ used_at: at }).eq('id', id).is('used_at', null).select('id')
      if (error) throw error
      return (data ?? []).length === 1
    },
    async row(memberId) {
      const { data, error } = await withTicks(t => db.from('club_members').select(rowCols(t)).eq('id', memberId).maybeSingle())
      if (error) throw error
      return data ? asRow(data as unknown as RowRow) : null
    },
    async guiHolders(gui) {
      const { data, error } = await db.from('club_members').select('user_id').eq('gui_number', gui)
        .not('user_id', 'is', null).is('removed_at', null)
      if (error) throw error
      return [...new Set(((data ?? []) as { user_id: string }[]).map(r => r.user_id))]
    },
    async guisOf(userId) {
      const { data, error } = await db.from('club_members').select('gui_number').eq('user_id', userId)
        .not('gui_number', 'is', null).is('removed_at', null)
      if (error) throw error
      return [...new Set(((data ?? []) as { gui_number: string }[]).map(r => r.gui_number))]
    },
    async readAttempts(keys) {
      const out = new Map<string, AttemptWindow>()
      const { data, error } = await db.from('account_attempts').select('key, failures, window_started').in('key', keys)
      if (error) throw error
      for (const r of (data ?? []) as { key: string; failures: number; window_started: string }[]) {
        out.set(r.key, { failures: r.failures, windowStarted: r.window_started })
      }
      return out
    },
    async writeAttempt(key, w) {
      const { error } = await db.from('account_attempts')
        .upsert({ key, failures: w.failures, window_started: w.windowStarted }, { onConflict: 'key' })
      if (error) throw error
    },
    randomBytes: n => new Uint8Array(randomBytes(n)),
    siteOrigin,

    assetBase: () => process.env.NEXT_PUBLIC_SUPABASE_URL,
    async clubBySlug(slug) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 48) return null
      const { data, error } = await db.from('clubs').select(CLUB_COLS).eq('slug', slug).maybeSingle()
      if (error) throw error
      return data ? (await withArt(db, [asClub(data as ClubRow)]))[0] : null
    },
    handicaps: handicapStore(db),
    async courseExists(courseId) {
      const { data, error } = await db.from('courses').select('id').eq('id', courseId).is('trip_id', null).maybeSingle()
      return !error && !!data
    },
    async updateClub(clubId, patch) {
      const { error } = await db.from('clubs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', clubId)
      if (error) throw error
    },
    clubEvents: clubId => readClubEvents(db, clubId),
    async cardsToSign(clubId, rowId, known) {
      // The club's competitions, known already on the members home's way (D195).
      let comps: { id: string; trip_code: string; name: string }[]
      if (known) {
        comps = known.map(k => ({ id: k.tripId, trip_code: k.code, name: k.name ?? k.code }))
      } else {
        const { data: priv } = await db.from('trip_private').select('trip_id').eq('club_id', clubId)
        const ids = ((priv ?? []) as { trip_id: string }[]).map(p => p.trip_id)
        if (!ids.length) return []
        const { data: trips, error } = await db.from('trips').select('id, trip_code, name').in('id', ids).eq('competition', 'club')
        comps = (error ? [] : trips ?? []) as { id: string; trip_code: string; name: string }[]
      }
      if (!comps.length) return []
      const compIds = comps.map(c => c.id)
      const [sigs, mine] = await Promise.all([
        db.from('card_signatures').select('trip_id, player_id, marker_member_id, approved_at, marked_at').in('trip_id', compIds).is('sent_back_at', null),
        db.from('players').select('id').in('trip_id', compIds).eq('club_member_id', rowId),
      ])
      if (sigs.error) return []
      const myPlayers = new Set(((mine.data ?? []) as { id: string }[]).map(p => p.id))
      const count = new Map<string, number>()
      for (const s of (sigs.data ?? []) as { trip_id: string; player_id: string; marker_member_id: string | null; approved_at: string | null; marked_at: string | null }[]) {
        const waits = (s.marker_member_id === rowId && !s.marked_at) || (myPlayers.has(s.player_id) && !s.approved_at)
        if (waits) count.set(s.trip_id, (count.get(s.trip_id) ?? 0) + 1)
      }
      return comps.filter(c => count.has(c.id)).map(c => ({ code: c.trip_code, name: c.name, count: count.get(c.id) as number }))
    },
    async entries(userId, codes) {
      const { data: trips, error } = await db.from('trips').select('id, trip_code').in('trip_code', codes)
      if (error || !trips?.length) return []
      const ids = new Map((trips as { id: string; trip_code: string }[]).map(t => [t.id, t.trip_code]))
      // "You're in": a player linked to this account (D134), or — a club
      // competition's entry (D163, 089) — a player made from this account's
      // place on the list, which is right even when a partner booked them
      // before their account was linked. The second read fails soft before 089.
      const [{ data: linked }, rows] = await Promise.all([
        db.from('account_players').select('trip_id').eq('user_id', userId).in('trip_id', [...ids.keys()]),
        db.from('club_members').select('id').eq('user_id', userId).is('removed_at', null),
      ])
      const memberIds = ((rows.data ?? []) as { id: string }[]).map(r => r.id)
      const booked = memberIds.length
        ? await db.from('players').select('trip_id').in('club_member_id', memberIds).in('trip_id', [...ids.keys()])
        : { data: [], error: null }
      const tripIds = [...((linked ?? []) as { trip_id: string }[]), ...(booked.error ? [] : (booked.data ?? []) as { trip_id: string }[])].map(r => r.trip_id)
      return [...new Set(tripIds.map(id => ids.get(id)).filter((c): c is string => !!c))]
    },
    async seasonRows(userId, year) {
      return readSeason(db, userId, year)
    },
    async outsideEvents(userId, excludeCodes) {
      // D144: the events they are in and the ones they made (owned, 085 —
      // fail-soft before it), so a member's own sit in the club area too.
      const [linked, entered, owned] = await Promise.all([
        db.from('account_players').select('trip_id').eq('user_id', userId),
        db.from('trip_members').select('trip_id').eq('user_id', userId),
        db.from('trip_private').select('trip_id').eq('owner_id', userId),
      ])
      const ids = [...new Set([...(linked.data ?? []), ...(entered.data ?? []), ...(owned.data ?? [])].map(r => (r as { trip_id: string }).trip_id))]
      if (ids.length === 0) return []
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(new Date())
      const { data, error } = await db.from('trips').select('trip_code, name, kind, start_date, end_date')
        .in('id', ids).or(`end_date.gte.${today},end_date.is.null`).order('start_date', { ascending: true }).limit(20)
      if (error) return []
      return ((data ?? []) as { trip_code: string; name: string; kind: string | null; start_date: string | null; end_date: string | null }[])
        .filter(t => !excludeCodes.includes(t.trip_code))
        .map(t => ({
          code: t.trip_code, name: t.name, kind: t.kind === 'tournament' || t.kind === 'run' ? t.kind : 'trip',
          startDate: t.start_date, endDate: t.end_date, access: null,
        }))
    },
    async topScores(codes) {
      const { data: trips } = await db.from('trips').select('id, trip_code').in('trip_code', codes)
      const codeOf = new Map(((trips ?? []) as { id: string; trip_code: string }[]).map(t => [t.id, t.trip_code]))
      if (codeOf.size === 0) return {}
      const { data, error } = await db.from('card_summaries').select('trip_id, player_id, points, holes')
        .in('trip_id', [...codeOf.keys()]).eq('origin', 'club').gte('holes', 18)
      if (error || !data?.length) return {}
      const best = new Map<string, { player_id: string; points: number }>()
      for (const r of data as { trip_id: string; player_id: string; points: number }[]) {
        const b = best.get(r.trip_id)
        if (!b || r.points > b.points) best.set(r.trip_id, { player_id: r.player_id, points: r.points })
      }
      const { data: players } = await db.from('players').select('id, name').in('id', [...best.values()].map(b => b.player_id))
      const nameOf = new Map(((players ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
      const out: Record<string, { name: string; points: number }> = {}
      for (const [tripId, b] of best) out[codeOf.get(tripId)!] = { name: nameOf.get(b.player_id) ?? '', points: b.points }
      return out
    },
    // ─── Stage (k1), the Clubhouse ───────────────────────────────
    async rowOf(clubId, userId) {
      const { data, error } = await withTicks(t => db.from('club_members').select(rowCols(t))
        .eq('club_id', clubId).eq('user_id', userId).is('removed_at', null).limit(1))
      if (error) throw error
      const row = ((data ?? []) as unknown as RowRow[])[0]
      return row ? asRow(row) : null
    },
    async isStaff(userId) {
      // Before migration 093 nobody is.
      const { data, error } = await db.from('green_dot_staff').select('user_id').eq('user_id', userId).maybeSingle()
      return !error && !!data
    },
    async searchClubs(q) {
      const words = q.split(' ').filter(Boolean)
      let query = db.from('clubs').select(CLUB_COLS).not('verified_at', 'is', null)
      for (const w of words) query = query.ilike('name', `%${w}%`)
      const { data, error } = await query.order('name').limit(20)
      if (error) throw error
      return withArt(db, ((data ?? []) as ClubRow[]).map(asClub))
    },
    async listPage(clubId, o) {
      return readListPage(db, clubId, o)
    },
    async listCounts(clubId) {
      return readListCounts(db, clubId)
    },
    seasonEvents: clubId => readClubSeason(db, clubId),
    // Stage c1 (095): the club's own events, what it shows, what a member asks to see.
    notes: (clubId, opts) => readNotes(db, clubId, opts),
    saveNote: (clubId, note, by) => saveNote(db, clubId, note, by),
    deleteNote: (clubId, id) => deleteNote(db, clubId, id),
    clubHidden: clubId => readClubHidden(db, clubId),
    setClubHidden: (clubId, types) => writeClubHidden(db, clubId, types),
    memberHidden: userId => readMemberHiddenOf(db, userId),
    presets: clubId => readPresets(db, clubId),
    savePreset: (clubId, p, position) => savePreset(db, clubId, p, position),
    deletePreset: (clubId, id) => deletePreset(db, clubId, id),
    categories: clubId => readCategories(db, clubId),
    async categoryCounts(clubId) {
      const { data, error } = await db.from('club_members').select('category_id').eq('club_id', clubId).is('removed_at', null).not('category_id', 'is', null)
      const out = new Map<string, number>()
      if (error) return out
      for (const r of (data ?? []) as { category_id: string }[]) out.set(r.category_id, (out.get(r.category_id) ?? 0) + 1)
      return out
    },
    async saveCategory(clubId, c) {
      const row = { club_id: clubId, name: c.name, code: c.code, days: c.days, position: c.position, updated_at: new Date().toISOString() }
      const { data, error } = c.id
        ? await db.from('club_categories').update(row).eq('id', c.id).eq('club_id', clubId).select('id').maybeSingle()
        : await db.from('club_categories').insert(row).select('id').single()
      if (error?.code === '23505') return 'clash'
      if (error) throw error
      return (data as { id: string } | null)?.id ?? 'clash'
    },
    async deleteCategory(clubId, id) {
      const { error } = await db.from('club_categories').delete().eq('id', id).eq('club_id', clubId)
      if (error) throw error
    },
    async accountDetails(userId) {
      const { data, error } = await db.from('account_details').select('gender, birth_date').eq('user_id', userId).maybeSingle()
      if (error || !data) return null
      const d = data as { gender: 'M' | 'F' | null; birth_date: string | null }
      return { gender: d.gender, birthDate: d.birth_date }
    },
    async saveDetails(userId, patch) {
      // One value everywhere (Ross, 17 Nov 2026): the account's, then every
      // list row of theirs carrying the same copy.
      const cols: Record<string, unknown> = {}
      if (patch.gender !== undefined) cols.gender = patch.gender
      if (patch.birthDate !== undefined) cols.birth_date = patch.birthDate
      if (!Object.keys(cols).length) return
      const up = await db.from('account_details').upsert({ user_id: userId, ...cols, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (up.error) { if (isMissingColumn(up.error) || up.error.code === '42P01' || up.error.code === 'PGRST205') throw new TicksNotReady(); throw up.error }
      const rows = await db.from('club_members').update(cols).eq('user_id', userId)
      if (rows.error) throw rows.error
    },
    async markInvited(memberId, at) {
      // Before 093 there is no column: the standing simply says Not joined.
      await db.from('club_members').update({ invited_at: at }).eq('id', memberId)
    },

    async putImage(path, bytes) {
      const { error } = await db.storage.from('club-assets').upload(path, bytes, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
      if (error) throw error
    },
    async removeImage(path) {
      await db.storage.from('club-assets').remove([path])
    },
  }
}

