import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import TabBar from '@/app/components/TabBar'
import EnsureMember from '@/app/components/EnsureMember'
import { fourthTab, isEvent } from '@/lib/eventHub'
import { isRunChallenge } from '@/lib/runChallenge'
import { entryAllowed, entryCookie } from '@/lib/publicPin'
import { isTripRoot, tripBase } from '@/lib/tripPaths'
import { fetchEntryLock, fetchIsKnockout, fetchTabExtras, fetchTripKind } from './kind'
import { AddressFix, TripBaseProvider } from './TripBase'

/**
 * Everything under `/trip/[tripCode]`, with the bottom bar around it.
 *
 * The bar used to be the last line of all ten pages. Ten copies was the
 * smaller half of the problem: a component rendered *by* a page unmounts
 * when that page does, so tapping a tab tore the bar off the screen and drew
 * a new one once the next page was ready. On a slow query that is the bar
 * disappearing for a second or two, on the one screen element that is meant
 * to be nailed down. Rendered here it is drawn once and never again, and a
 * navigation swaps only what is above it.
 *
 * That is also what lets `loading.tsx` be worth having. A loading file
 * replaces the page, not the layout, so the skeleton appears *inside* the
 * chrome rather than instead of it.
 *
 * It fetches exactly one thing, and the budget for that was argued over:
 * this layout used to fetch nothing at all, so that no tab prefetch paid
 * for it. What the bar draws now depends on the trip's kind — an event
 * hides Trip Setup from the field — and the layout is the only place that
 * knows before the bar first paints. The query is one indexed column, it
 * runs in parallel with the page's own queries on the render they share,
 * and the layout persists across tab navigations, so a tab press inside
 * the trip never re-pays it. Nothing heavier belongs here.
 *
 * The same answer sends a Green Dot Run challenge home to `/run/[code]`.
 * Every way into an event — the landing page's code box, `/join`, the bare
 * short link, an old shared link — arrives here first, so this is the one
 * place that has to know; and no golf screen ever renders for a run
 * challenge, whichever page under `/trip/` was asked for.
 *
 * **And it is the door of an event with a public PIN** (lib/publicPin.ts,
 * migration 060): a second one-column read, alongside the kind, and a
 * phone that has not entered the event is sent to `/enter/[code]` before
 * anything under it renders. A redirect rather than a gate drawn in place
 * of `children`, because a layout renders beside its page, not before it —
 * drawing a gate here would still send the page underneath it.
 *
 * **A third read says whether the event is match play**, whose middle tab
 * is the Bracket rather than the Leaderboard (Ross, 26 Oct 2026) — the
 * setup's one `format` key, in parallel with the other two.
 *
 * **And a fourth says what the fourth tab is** — on an event, Tee times
 * while a round starts from a tee sheet, else Stats while the event
 * records them; on a trip, Stats unless Tee times has taken its place
 * (lib/eventHub.ts `fourthTab`): the stats flag and the rounds' start
 * formats in one request, in parallel with the rest. A screen that changes
 * either refreshes the router, so the bar follows.
 */

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ root: string; tripCode: string }>
}) {
  const { root, tripCode } = await params
  // /golf/trip/… and /golf/event/… are the only pages under /golf/ with a
  // code in them (lib/tripPaths.ts); /golf/anything-else/… is no page.
  if (!isTripRoot(root)) notFound()
  const [kind, lock, knockout, extras, jar] = await Promise.all([
    fetchTripKind(tripCode), fetchEntryLock(tripCode), fetchIsKnockout(tripCode), fetchTabExtras(tripCode), cookies(),
  ])
  if (isRunChallenge(kind)) redirect(`/run/${tripCode}`)
  if (!entryAllowed(lock, jar.get(entryCookie(tripCode))?.value)) redirect(`/enter/${tripCode}`)

  // An event lives at /golf/event/, a trip at /golf/trip/ (Ross, 8 Nov
  // 2026). Both addresses are this page, so one opened at the other —
  // an event's old /trip/ link sent on by next.config.ts — works as it is,
  // and `AddressFix` puts the address bar right in place, no redirect and
  // nothing in front of the request.
  const base = tripBase(tripCode, kind)

  return (
    <TripBaseProvider base={base}>
      <AddressFix base={base} />
      {/* After the public PIN door above, so only a phone let in is entered. */}
      <EnsureMember tripCode={tripCode} />
      {children}
      <TabBar
        tripCode={tripCode}
        base={base}
        isEvent={isEvent(kind)}
        bracket={isEvent(kind) && knockout}
        fourth={fourthTab(isEvent(kind), extras)}
      />
    </TripBaseProvider>
  )
}
