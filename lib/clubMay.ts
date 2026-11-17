// What a club's people may do — the only copy (D208, D219, D220; Ross,
// 16 Nov 2026). Nothing checks a role inline after this: a server route
// asks `clubMay`, a screen is handed the answer (or asks `clubMay` itself
// only to decide what to draw — the server asks again).
//
// The club owns what is put on the platform. Its people hold **credentials**,
// ticks on their row of the club's list, independent of each other:
//
// * **Plays here** — a golfer at the club: in its fields, boards and stats
//   (D209). Off for back-office staff who do not play.
// * **Officer** — edit access in the members app, on the phone: New
//   competition, Manage competition, tee times, No return, sign or void a
//   card, Certify, Reopen, calling a competition off. The organiser of the
//   club's events.
// * **Clubhouse** — admin access to the Clubhouse, the desktop office: the
//   list, the club's look, and granting Plays here and Officer. Held with or
//   without Officer.
// * **Owner** — whoever set the club up on the platform (Green Dot, or the
//   club itself until then). Holds Officer and Clubhouse always — never
//   Plays here by force, an owner may not play — and alone gives Clubhouse
//   and makes owners. A club always keeps one.
//
// **Green Dot staff** (D222, stage (k1)) may do everything Clubhouse and
// Owner may, at any club; they are never the club's Officers.
//
// Stored on `club_members` (migration 092): `plays_here`, `officer`,
// `clubhouse`, and `role`, which keeps `owner` and mirrors the rest for the
// code before 092 (`storedRole`). Before 092 the ticks are read off the
// role (`credentialsOf`): owners and admins Officer and Clubhouse, everyone
// Plays here.

import type { ClubRole } from './clubs'

export interface Credentials {
  owner: boolean
  playsHere: boolean
  officer: boolean
  clubhouse: boolean
}

export type CredentialKey = keyof Credentials

/** A row as stored: the role always, the ticks once migration 092 is in. */
export interface StoredCredentials {
  role: ClubRole
  playsHere?: boolean | null
  officer?: boolean | null
  clubhouse?: boolean | null
}

/** The roles that meant Officer and Clubhouse before 092 — the stores' fallback read, and nothing else. */
export const LEGACY_RUNNING_ROLES: readonly ClubRole[] = ['owner', 'admin']

/** A row's credentials. An owner holds Officer and Clubhouse whatever is stored. */
export function credentialsOf(r: StoredCredentials): Credentials {
  const owner = r.role === 'owner'
  const legacy = LEGACY_RUNNING_ROLES.includes(r.role)
  return {
    owner,
    playsHere: r.playsHere ?? true,
    officer: owner || (r.officer ?? legacy),
    clubhouse: owner || (r.clubhouse ?? legacy),
  }
}

/**
 * The role kept beside the ticks for the code before 092, so a rollback
 * fails safe: `admin` only while both Officer and Clubhouse are held.
 */
export function storedRole(c: Credentials): ClubRole {
  return c.owner ? 'owner' : c.officer && c.clubhouse ? 'admin' : 'member'
}

/** Credentials after a change: Owner brings Officer and Clubhouse with it. */
export function withChange(c: Credentials, change: Partial<Credentials>): Credentials {
  const next = { ...c, ...change }
  return next.owner ? { ...next, officer: true, clubhouse: true } : next
}

/** Who is asking: their row on this club's list (null when not on it, or taken off), and whether they are Green Dot staff. */
export interface Asker {
  row: Credentials | null
  staff?: boolean
}

export type ClubAct =
  /** The members home and everything a member reads. */
  | 'see_members_home'
  /** Be in a field, on a board, in a stat (D209). */
  | 'play'
  /** Officer: competitions and the club's events, on the phone. */
  | 'run_events'
  /** Clubhouse: the office itself. */
  | 'open_clubhouse'
  /**
   * Clubhouse: the club's calendar in the office — its events, presets,
   * competitions made and changed there, a calendar imported (Ross, 17 Nov
   * 2026: Clubhouse is its own level of admin; an Officer's golf editing is
   * the members app's).
   */
  | 'keep_calendar'
  /**
   * Clubhouse: the casual tee sheet in full — book, move and take off
   * anybody, its settings, which memberships book (Ross, 17 Nov 2026). A
   * member books their own through `play`.
   */
  | 'keep_tee_sheet'
  /** The list: add, paste, change a row, take off, put back, email a code, download. */
  | 'keep_list'
  /** The club's look and its home course. */
  | 'set_look'
  | 'grant_plays_here'
  | 'grant_officer'
  | 'grant_clubhouse'
  | 'grant_owner'

/** The one answer to "may this account do this, at this club". */
export function clubMay(act: ClubAct, a: Asker): boolean {
  const r = a.row
  const staff = !!a.staff
  switch (act) {
    case 'see_members_home': return !!r
    case 'play': return !!r?.playsHere
    case 'run_events': return !!r?.officer
    case 'open_clubhouse':
    case 'keep_calendar':
    case 'keep_tee_sheet':
    case 'keep_list':
    case 'set_look':
    case 'grant_plays_here':
    case 'grant_officer':
      return staff || !!r?.clubhouse
    case 'grant_clubhouse':
    case 'grant_owner':
      return staff || !!r?.owner
  }
}

const GRANT: Record<CredentialKey, ClubAct> = {
  playsHere: 'grant_plays_here',
  officer: 'grant_officer',
  clubhouse: 'grant_clubhouse',
  owner: 'grant_owner',
}

export const LAST_OWNER = 'A club always has an owner. Make somebody else an owner first.'

/**
 * Why this change to a row's credentials may not be made — or null.
 * `owners` counts the rows that are owners and not taken off, before it.
 */
export function credentialChangeIssue(
  asker: Asker,
  target: { credentials: Credentials; removed: boolean },
  change: Partial<Credentials>,
  owners: number,
): string | null {
  const now = target.credentials
  const keys = (Object.keys(change) as CredentialKey[]).filter(k => typeof change[k] === 'boolean' && change[k] !== now[k])
  for (const k of keys) {
    if (!clubMay(GRANT[k], asker)) {
      return k === 'clubhouse' || k === 'owner'
        ? 'Only an owner or Green Dot gives Clubhouse or makes an owner.'
        : 'Only someone with Clubhouse changes these ticks.'
    }
  }
  const staysOwner = change.owner ?? now.owner
  if (staysOwner && (change.officer === false || change.clubhouse === false)) {
    return 'An owner holds Officer and Clubhouse. Take Owner off first.'
  }
  if (now.owner && !target.removed && change.owner === false && owners <= 1) return LAST_OWNER
  return null
}

/** Why this row may not be taken off the list by this person — or null. */
export function removeIssue(asker: Asker, target: { credentials: Credentials; removed: boolean }, owners: number): string | null {
  if (!clubMay('keep_list', asker)) return 'Only someone with Clubhouse keeps the club’s list.'
  const c = target.credentials
  if (c.owner && !clubMay('grant_owner', asker)) return 'Only an owner or Green Dot takes an owner off the list.'
  if (c.clubhouse && !clubMay('grant_clubhouse', asker)) return 'Only an owner or Green Dot takes someone with Clubhouse off the list.'
  if (c.owner && !target.removed && owners <= 1) return LAST_OWNER
  return null
}

/** The ticks as a screen names and explains them, in their order. */
export const CREDENTIAL_WORDS: { key: CredentialKey; label: string; line: string }[] = [
  { key: 'playsHere', label: 'Plays here', line: 'In the club’s fields, boards and stats.' },
  { key: 'officer', label: 'Officer', line: 'Runs competitions on the phone: tee times, cards, results.' },
  { key: 'clubhouse', label: 'Clubhouse', line: 'Admin access to the Clubhouse: the list, the look, and giving Plays here and Officer.' },
  { key: 'owner', label: 'Owner', line: 'Holds Officer and Clubhouse. Only an owner gives Clubhouse or makes owners.' },
]

/** What a row holds, said short — never a bare "member" (D133). */
export function credentialLine(c: Credentials, clubName: string): string {
  const held = c.owner ? ['Owner'] : [c.clubhouse ? 'Clubhouse' : null, c.officer ? 'Officer' : null].filter((x): x is string => !!x)
  const base = held.length ? held.join(' · ') : `${clubName} member`
  return c.playsHere ? base : `${base} · Doesn’t play here`
}
