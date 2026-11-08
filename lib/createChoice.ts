/**
 * The tournament door's answers, as they ride in the address bar — the only
 * copy of which answers make sense together (Ross, 8 Nov 2026).
 *
 *   Golf tournament
 *   ├─ Standalone   → League · Match play
 *   └─ Ongoing      → Series · Continuous · Match play
 *
 * `?type=tournament&when=…&format=…`. Kept in the URL rather than in state so
 * the phone's own back gesture, and the arrow on a wizard's first step, both
 * land on the chooser the wizard came from with nothing lost.
 *
 * Anything that does not read — an unknown word, or a format the `when` does
 * not offer — falls back as far as it has to: a good `when` keeps its screen,
 * a bad one goes to the first question. Never a guess at a wizard.
 *
 * Continuous is a real answer here, but CreateFlow does not open a wizard for
 * it until it has been redefined (docs/event-use-cases.md, stage 6) — the
 * Ongoing screen shows it as coming soon.
 *
 * Pure, so a test can import it; CreateFlow is a client file.
 */

export type TournamentWhen = 'standalone' | 'ongoing'
export type TournamentFormat = 'league' | 'match_play' | 'series' | 'continuous'

export type TournamentChoice =
  | { when: null; format: null }
  | { when: TournamentWhen; format: TournamentFormat | null }

/** Which formats each `when` offers, in the order the chooser lists them. */
export const FORMATS_FOR: Record<TournamentWhen, readonly TournamentFormat[]> = {
  standalone: ['league', 'match_play'],
  ongoing: ['series', 'continuous', 'match_play'],
}

export function parseChoice(search: string): TournamentChoice {
  const q = new URLSearchParams(search)
  const when = q.get('when')
  if (when !== 'standalone' && when !== 'ongoing') return { when: null, format: null }
  const format = q.get('format')
  const offered = FORMATS_FOR[when] as readonly string[]
  return {
    when,
    format: format && offered.includes(format) ? (format as TournamentFormat) : null,
  }
}

/** The address for a choice, keeping every other query value as it was. */
export function choiceSearch(search: string, choice: TournamentChoice): string {
  const q = new URLSearchParams(search)
  q.delete('when')
  q.delete('format')
  if (choice.when) q.set('when', choice.when)
  if (choice.when && choice.format) q.set('format', choice.format)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** One step up the tree: a format back to its `when`, a `when` to the start. */
export function parentChoice(choice: TournamentChoice): TournamentChoice {
  if (choice.when && choice.format) return { when: choice.when, format: null }
  return { when: null, format: null }
}
