import { redirect } from 'next/navigation'

/**
 * Retired. This route was the single-trip Donegal Masters app, and it never
 * learned that trips exist: it read — and some of these screens wrote —
 * across every trip in the database at once. A void pressed here could erase
 * another trip's committed scores. The screens are unreachable from the
 * current app, so the only visitors are old bookmarks, and they land on the
 * platform's front door instead. See docs/gotchas-and-debt.md.
 */
export default function RetiredLegacyRoute() {
  redirect('/')
}
