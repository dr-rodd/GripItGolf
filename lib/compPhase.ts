// Where a club competition stands (D169–D172; Ross, 16 Nov 2026) — the one
// copy. Pure: handed the facts, it answers the phase, which sections of the
// competition page are live (D181), and the line each says before it is.
//
//   Scheduled         before the tee sheet opens for booking
//   Booking open      from the sheet's opening until the first tee time
//   In play           from the first tee time, or the first card started,
//                     until scoring closes
//   Awaiting sign-off scoring closed: every booked player's card signed
//                     (co-signed, from stage (d3)) or a No return (d4)
//   Certified         certified by an owner or admin (d4)
//
// A card nobody signs keeps the competition In play — its admins see the
// cards still open and sign, void or mark No return (d4). That is the rule
// as written: scoring closes only when every booked player is accounted for.

export type CompPhase = 'announced' | 'booking' | 'in_play' | 'awaiting' | 'certified' | MatchPlayOnlyPhase

/**
 * A club match play's own phases (Ross, 17 Nov 2026; lib/clubMatchPlay.ts):
 * entries open, waiting for the draw, waiting for its qualifier, and
 * finished. Once drawn it is In play, like any competition. Never reached by
 * `compPhase`, which reads a stroke competition's one round.
 */
export type MatchPlayOnlyPhase = 'entries' | 'draw_pending' | 'qualifier' | 'finished'

export interface CompFacts {
  /** When booking opens (an instant, ms) — null when it is open from the start. */
  bookingOpensAt: number | null
  /** The first tee time (an instant, ms), or null while the sheet has none. */
  firstTeeAt: number | null
  /** Players booked on the sheet. */
  booked: number
  /** Of them, those whose card is signed or who are marked No return. */
  finished: number
  /** Whether any card has been started. */
  cardsStarted: boolean
  /** When it was certified, or null. */
  certifiedAt: string | null
}

export function compPhase(f: CompFacts, now: number): CompPhase {
  if (f.certifiedAt) return 'certified'
  const playing = f.cardsStarted || (f.firstTeeAt !== null && now >= f.firstTeeAt)
  if (playing) return f.booked > 0 && f.finished >= f.booked ? 'awaiting' : 'in_play'
  if (f.bookingOpensAt === null || now >= f.bookingOpensAt) return 'booking'
  return 'announced'
}

/** The phase as the competition page's one line and Comps' rows say it. */
export const PHASE_WORDS: Record<CompPhase, string> = {
  announced: 'Scheduled',
  booking: 'Booking open',
  in_play: 'In play',
  awaiting: 'Awaiting sign-off',
  certified: 'Certified',
  entries: 'Entries open',
  draw_pending: 'Waiting for the draw',
  qualifier: 'Qualifier to come',
  finished: 'Finished',
}

export type CompSection = 'tee' | 'scoring' | 'board'

/**
 * Which of the bar's three sections are live (D181): the tee sheet from
 * booking, scoring and the leaderboard from play. A section not yet live is
 * still in the bar, as one line saying when it starts.
 */
export function sectionLive(section: CompSection, phase: CompPhase): boolean {
  if (section === 'tee') return phase === 'booking' || phase === 'in_play' || phase === 'awaiting' || phase === 'certified'
  return phase === 'in_play' || phase === 'awaiting' || phase === 'certified'
}

/**
 * The line a section not yet live says — when it starts, Irish time. `at`
 * is the instant it starts (booking's opening, or the first tee time).
 */
export function sectionWaitLine(section: CompSection, at: number | null): string {
  const when = at === null ? null : new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  }).format(new Date(at))
  if (section === 'tee') return when ? `Booking opens ${when}.` : 'Booking opens soon.'
  if (section === 'scoring') return when ? `Scoring opens with the first tee time, ${when}.` : 'Scoring opens with the first tee time.'
  return when ? `The leaderboard goes live with the first tee time, ${when}.` : 'The leaderboard goes live with the first tee time.'
}

/** "Thu 19 Nov, 7:00 pm", Irish time — the Summary's short way of saying when. */
export function shortWhen(at: number): string {
  const parts = new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Dublin', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(new Date(at))
  const part = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}, ${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`
}

/**
 * The Summary's supporting line for a phase (D186), the same for everybody —
 * what is personal (your tee time) the page adds once it knows who you are.
 * `firstTee` is the first tee time as a clock ("9:00 am").
 */
export function summaryLine(phase: CompPhase, f: { bookingOpensAt: number | null; firstTee: string | null }): string {
  switch (phase) {
    case 'announced': return f.bookingOpensAt === null ? 'Booking opens soon' : `Booking opens ${shortWhen(f.bookingOpensAt)}`
    case 'booking': return f.firstTee ? `Booking is open. First tee time ${f.firstTee}` : 'Booking is open'
    case 'in_play': return 'Cards are out on the course'
    case 'awaiting': return 'Provisional: every card is in, waiting for the club to certify'
    case 'certified': return 'The result is final'
    case 'entries': return 'Entries are open'
    case 'draw_pending': return 'Entries are closed — the draw is to come'
    case 'qualifier': return 'The field comes from the qualifier'
    case 'finished': return 'The final is played'
  }
}

/** Whether the Summary shows the top three (D186): while there are cards to rank. */
export function showsTopThree(phase: CompPhase): boolean {
  return phase === 'in_play' || phase === 'awaiting' || phase === 'certified'
}
