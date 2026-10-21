// Arranging a knockout match — the only copy of the rules (docs/event-use-
// cases.md, story 2). Corporate match play is played wherever one of the
// players is a member, so a match's course is chosen when it is arranged,
// and only then are the shots known: each player's tee gives a course
// handicap, the match play allowance comes off that, and the shots are the
// difference from the lowest in the match. Also who may see a player's
// contact details, and who may award a walkover. Pure. No I/O.

import { exactCourseHandicap, type TeeRating } from './courseHandicap'
import { allowedHandicap } from './handicapAllowance'
import { shotsReceived } from './handicap'
import { normaliseEmail } from './email'
import { isMine, isPlayable, type PortalMatch } from './knockoutPortal'

// ─── Tees ──────────────────────────────────────────────────────

/** Which tee each player plays off — `matchplay_matches.tees` (migration 057). */
export type MatchTees = Record<string, string>

/** The stored object, tidied: string to string, nothing else. Never null. */
export function parseMatchTees(raw: unknown): MatchTees {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: MatchTees = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k && typeof v === 'string' && v) out[k] = v
  }
  return out
}

/** The tees with one player's set, or taken off with null. */
export function withTee(tees: MatchTees, playerId: string, teeId: string | null): MatchTees {
  const next = { ...tees }
  if (teeId) next[playerId] = teeId
  else delete next[playerId]
  return next
}

// ─── Shots ─────────────────────────────────────────────────────

export type MatchPlayer = {
  playerId: string
  /** Their handicap index; null while pending. */
  index: number | null
  /** The tee they play off in this match, once chosen. */
  tee: TeeRating | null
}

export type MatchStroke = {
  playerId: string
  /** The course handicap off their tee, whole. */
  courseHandicap: number
  /** After the match's allowance. */
  playing: number
  /** Shots received in the match: the difference from the lowest. */
  receives: number
}

/**
 * Every player's shots in this match, or null until every player has a
 * handicap and a tee — a shot count with one of them guessed would be the
 * wrong number written where the group will trust it.
 *
 * Match play gives the difference: the lowest playing handicap plays off
 * scratch and everybody else receives what they are above it. The
 * allowance (the matchplay board's own — 100% for singles unless the
 * organiser said otherwise, 90% is usual for a fourball) comes off the
 * unrounded course handicap first, as every allowance on the platform does.
 */
export function matchStrokes(players: readonly MatchPlayer[], allowance: number): MatchStroke[] | null {
  if (players.length < 2) return null
  if (players.some(p => p.index === null || p.tee === null)) return null
  const rows = players.map(p => {
    const exact = exactCourseHandicap(p.index as number, p.tee as TeeRating)
    return { playerId: p.playerId, courseHandicap: Math.round(exact), playing: allowedHandicap(exact, allowance) }
  })
  const lowest = Math.min(...rows.map(r => r.playing))
  return rows.map(r => ({ ...r, receives: r.playing - lowest }))
}

export type StrokeHole = { holeNumber: number; strokeIndex: number; strokeIndexLadies?: number | null }

/**
 * The holes a player receives a shot on — two on the hardest once they
 * receive more than eighteen — by the stroke index they play (the ladies'
 * where a woman has one). Through `shotsReceived`, the one copy.
 */
export function shotHoles(receives: number, holes: readonly StrokeHole[], gender: string): { holeNumber: number; shots: number }[] {
  if (receives <= 0) return []
  return holes
    .map(h => {
      const si = gender === 'F' && h.strokeIndexLadies ? h.strokeIndexLadies : h.strokeIndex
      return { holeNumber: h.holeNumber, shots: shotsReceived(receives, si) }
    })
    .filter(h => h.shots > 0)
    .sort((a, b) => a.holeNumber - b.holeNumber)
}

/** "Gets 4 shots", "Gets 1 shot", "Plays off scratch". */
export function describeReceives(receives: number): string {
  if (receives <= 0) return 'Plays off scratch'
  return `Gets ${receives} ${receives === 1 ? 'shot' : 'shots'}`
}

// ─── Contact details ───────────────────────────────────────────

/** Who sees a player's contact details: the field, or their opponent only. */
export type ContactVisibility = 'public' | 'opponent'

export const CONTACT_VISIBILITIES: { key: ContactVisibility; label: string; hint: string }[] = [
  { key: 'opponent', label: 'My opponent', hint: 'Only the player you are drawn against sees them.' },
  { key: 'public', label: 'Everyone in the event', hint: 'Anybody in the event can see them on your matches.' },
]

export type PlayerContact = { phone: string | null; email: string | null; visibility: ContactVisibility }

export const MAX_PHONE = 32

/**
 * What a player typed, as stored — or the reason it will not be. Both are
 * optional; a phone number is digits with the usual punctuation and at
 * least six digits, an email what lib/email.ts calls one.
 */
export function normaliseContact(raw: {
  phone?: unknown; email?: unknown; visibility?: unknown
}): PlayerContact | { issue: string } {
  const visibility: ContactVisibility = raw.visibility === 'public' ? 'public' : 'opponent'
  const phoneIn = typeof raw.phone === 'string' ? raw.phone.trim().replace(/\s+/g, ' ') : ''
  const emailIn = typeof raw.email === 'string' ? raw.email.trim() : ''
  if (phoneIn) {
    if (phoneIn.length > MAX_PHONE || !/^\+?[\d ()-]+$/.test(phoneIn)
        || (phoneIn.match(/\d/g) ?? []).length < 6) {
      return { issue: 'That does not look like a phone number.' }
    }
  }
  const email = emailIn ? normaliseEmail(emailIn) : null
  if (emailIn && !email) return { issue: 'That does not look like an email address.' }
  return { phone: phoneIn || null, email, visibility }
}

/**
 * May this viewer see these contact details? Their own, always. Otherwise
 * the field when the player said public, and only their opponent when they
 * said opponent. A soft gate like everything on Green Dot — the server
 * decides it, the browser never holds a number it may not show.
 */
export function contactShown(
  contact: Pick<PlayerContact, 'visibility'>, viewer: { isSelf: boolean; isOpponent: boolean },
): boolean {
  if (viewer.isSelf) return true
  return contact.visibility === 'public' || viewer.isOpponent
}

// ─── Walkover ──────────────────────────────────────────────────

/** What a walkover is written as in the bracket's margin. */
export const WALKOVER = 'W/O'

/**
 * Who this viewer may award the match to as a walkover. A player in the
 * match may concede it — to the other side, only while it is open. The
 * organiser (the admin PIN) may award it to either side, decided or not,
 * because changing a result is theirs. Nothing on a bye, or while a side is
 * still to be decided.
 */
export function walkoverChoices(
  m: PortalMatch, viewerEntrant: string | null, organiser: boolean,
): string[] {
  if (!isPlayable(m) || !m.sideA || !m.sideB) return []
  if (organiser) return [m.sideA, m.sideB]
  if (m.winner !== null || !viewerEntrant || !isMine(m, viewerEntrant)) return []
  return [m.sideA === viewerEntrant ? m.sideB : m.sideA]
}
