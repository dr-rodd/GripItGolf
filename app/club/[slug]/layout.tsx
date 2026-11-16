import { ClubBarProvider } from './ClubBarContext'
import ClubTabBar from './ClubTabBar'
import { clubLook } from './face'

/**
 * The club area's frame (D180 amended): the one footer for the club's page
 * and every competition page under it — drawn here, never by a page, so a
 * move between them is the same bar changing its set (the competition's
 * tabs sliding out of Comps) rather than a new one arriving. The trip
 * layout's lesson: a bar drawn by a page tears off the screen on every
 * navigation. Pages keep `has-tabbar`; the page is what scrolls.
 *
 * Reads only the club's colour (shared with the page within a request), so
 * the club page stays regenerated once a minute rather than per visit.
 */
export default async function ClubLayout({ children, params }: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const look = await clubLook(slug)
  return (
    <ClubBarProvider>
      {children}
      {look && (
        <div data-club style={look as React.CSSProperties}>
          <ClubTabBar slug={slug} />
        </div>
      )}
    </ClubBarProvider>
  )
}
