// The header's measurements.
//
// Deliberately not in TripHeader.tsx, which is a client component. A value
// exported from a `'use client'` module and imported by a server component
// does not arrive as the number — it arrives as a client reference, and
// dropping one into a template literal writes a stub function into the
// markup. TypeScript sees a number throughout and the build says nothing;
// the only sign is a style attribute full of nonsense in the rendered page.
//
// The landing page is a server component and needs TRAVEL to size itself, so
// the numbers live here where both sides can read them.

import { STACKED_BOX } from './wordmarkMorph'

/** Header height. The leaderboard's own sticky row sits directly below it. */
export const HEADER_H = 52

/** Width of the mark at each end of the journey. */
export const HERO_W = 196
export const LINE_W = 118

/** How far below the header the mark stands at rest. */
export const HERO_TOP = 58

/** The mark's resting distance from the left edge once it has landed. */
export const LINE_INSET = 6

/** The height of the mark at rest, from the artwork's own proportions. */
export const HERO_H = (STACKED_BOX[3] / STACKED_BOX[2]) * HERO_W

/** The room the mark occupies below the header before it moves. */
export const HERO_SPACE = HERO_TOP + HERO_H + 20

/**
 * The scroll the whole sequence takes.
 *
 * Deliberately longer than the space the mark occupies. They used to be the
 * same number, which left the page's catch-up crammed into whatever scroll
 * was left after the mark had landed — the content shot up two or three
 * times faster than the finger moving it. Giving the sequence more room lets
 * the collapse finish unhurried and the page follow at a readable speed.
 */
export const TRAVEL = Math.round(HERO_SPACE * 1.5)

/**
 * How far through the scroll the page starts catching up.
 *
 * Before this the content is completely still — the scroll moves the logo and
 * nothing else. After it the gap the mark leaves closes and the page comes up
 * to meet the header.
 *
 * Set to overlap the tail of the sequence rather than to follow it. The words
 * are in place by now and only the emerald dot is still sliding, so the page
 * rising alongside it reads as everything resolving together. Waiting for the
 * very last movement left a stretch where nothing happened at all.
 */
export const RELEASE_AT = 0.60
