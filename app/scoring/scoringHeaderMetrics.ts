// The legacy scoring shell's own sticky header height.
//
// CourseDashboardClient renders its own header — a 44px back button plus
// 16px of padding top and bottom plus a 1px border — rather than the
// site-wide TripHeader (see app/components/headerMetrics.ts, whose HEADER_H
// is a different number for a different header, 52px). Everything sticky or
// height-calculated inside the scoring flow measures itself against THIS
// header. Importing the site-wide HEADER_H here was the bug that sent the
// live leaderboard's column headings under the bottom third of the header
// sitting above them: 52 is less than this header's real 77, so the sticky
// row started clinging to the page 25px before the real header had scrolled
// clear of it.
//
// Not exact for every embedding — ScoringClient's own legacy dark-themed
// shell uses a shorter header (py-2, not py-4) and nothing here accounts for
// that yet. This value was measured against CourseDashboardClient, which is
// the screen every current trip actually scores through.
export const LEGACY_HEADER_H = 77
