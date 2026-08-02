// The header's measurements.
//
// Deliberately not in TripHeader.tsx, which is a client component. A value
// exported from a `'use client'` module and imported by a server component
// does not arrive as the number — it arrives as a client reference, and
// dropping one into a template literal writes a stub function into the
// markup. TypeScript sees a number throughout and the build says nothing;
// the only sign is a style attribute full of nonsense in the rendered page.
//
// The landing page reads HERO_SPACE to stand the mark in, so the numbers
// live here where both sides can read them.

import { STACKED_BOX } from './wordmarkMorph'

/** Header height. The leaderboard's own sticky row sits directly below it. */
export const HEADER_H = 52

/** Width of the mark at each end of the journey. */
export const HERO_W = 196
// Slightly larger than the mark first shipped at — the header bar itself
// (HEADER_H) is the right height, but the mark sat small inside it, leaving
// more air above and below than the bar's own height explains.
export const LINE_W = 132

/** How far below the header the mark stands at rest. */
export const HERO_TOP = 58

/** The mark's resting distance from the left edge once it has landed. */
export const LINE_INSET = 6

/** The height of the mark at rest, from the artwork's own proportions. */
export const HERO_H = (STACKED_BOX[3] / STACKED_BOX[2]) * HERO_W

/** The room the mark occupies below the header before it moves. */
export const HERO_SPACE = HERO_TOP + HERO_H + 20
