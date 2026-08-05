// The bottom bar's measurements.
//
// Its own file, and not inside TabBar.tsx, for the same reason the header's
// numbers are not inside TripHeader: TabBar is a `'use client'` module, and a
// number exported from one and imported by a server component does not arrive
// as the number — it arrives as a client reference, and dropping one into a
// template literal writes a stub function into the markup. TypeScript sees a
// number throughout and the build says nothing.
//
// `.has-tabbar` in app/globals.css is the same measurement in CSS, for the
// pages that only need padding. These two have to agree; CSS cannot import a
// TypeScript constant, so the number is written twice and this comment is the
// link between them.

/** The bar itself. The home indicator sits below it, not inside it. */
export const TABBAR_H = 64

/**
 * The room to leave for it: the bar plus whatever the phone reserves under it.
 *
 * Ready to drop into a `bottom`, a `padding-bottom` or a `calc()`.
 */
export const TABBAR_SPACE = `calc(${TABBAR_H}px + env(safe-area-inset-bottom))`
