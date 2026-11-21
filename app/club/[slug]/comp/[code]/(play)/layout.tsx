import EnsureMember from '@/app/components/EnsureMember'
import { TripBaseProvider } from '@/app/golf/[root]/[tripCode]/TripBase'
import { compHome } from '@/lib/clubBar'

/**
 * The screens a club competition plays inside its club (D284, Ross, 21 Nov
 * 2026) — the card, a match and its card, the bracket, and managing it. Each
 * is the event's own screen, unchanged, drawn here under the club's footer
 * (the club layout's) instead of the event's tab bar, without the frame the
 * Summary and its sections wear, so a scorecard keeps the whole screen.
 *
 * Its browser links go to the competition's address (`TripBaseProvider`),
 * where the club mounts the same paths, and the phone is entered in the
 * event as the event's own layout does (`EnsureMember`), so scores save.
 * The members-only door is each page's (`inClub`), never this layout's: a
 * layout renders beside its page, not before it.
 */
export default async function CompPlayFrame({ children, params }: {
  children: React.ReactNode
  params: Promise<{ slug: string; code: string }>
}) {
  const { slug, code } = await params
  return (
    <TripBaseProvider base={compHome(slug, code)}>
      <EnsureMember tripCode={code.toUpperCase()} />
      {children}
    </TripBaseProvider>
  )
}
