// How far down the screen the scoring shell's chrome ends.
//
// Three things inside the scoring flow need this number: the sticky
// sub-headers on the summary and edit screens, the live board's column
// headings, and the score-entry card, which has to reach from here down to
// the Next button fixed at the bottom of the viewport.
//
// It is not a constant, which is what every previous attempt got wrong:
//
//   • On a trip route the scoring shell sits under the site-wide TripHeader
//     (52px). On the legacy /scoring/[slug] route it does not.
//   • The shell's own header grows while a round is in play — a hole-progress
//     row and a Live Leaderboard banner appear — so it is 77px on the
//     dashboard and the live board, and around 185px during score entry.
//
// Any single hardcoded value is therefore right on one screen and wrong on
// the rest: 52 left the column headings clinging 25px early, and 77 left the
// score-entry card 148px taller than the space it actually had, pushing it
// down behind the Next button. So CourseDashboardClient measures its own
// header, adds the offset it was told to stick at, and publishes the total as
// a CSS custom property on its root. Everything below reads it from there and
// stays correct as the header changes shape between views.

/** The custom property CourseDashboardClient publishes on its root element. */
export const CHROME_VAR = "--scoring-chrome"

/**
 * The fallback: the shell's title row on its own, with nothing above it.
 *
 * Used by the legacy `/scoring` route (ScoringClient), which renders
 * LiveScoringFlow without CourseDashboardClient around it and so never
 * publishes the property. That route's own header is shorter than this
 * (py-2, not py-4), so the fallback is not exact there — it is the number
 * that route was already using before the property existed, kept as-is so
 * this change leaves that screen exactly where it was.
 */
export const LEGACY_CHROME = 77

/** Ready to drop into `top` or a `calc()`, with the fallback built in. */
export const CHROME = `var(${CHROME_VAR}, ${LEGACY_CHROME}px)`
