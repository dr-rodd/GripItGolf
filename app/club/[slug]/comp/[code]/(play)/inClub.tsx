import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import TripHeader from '@/app/components/TripHeader'
import { clubCompRoot } from '@/lib/tripPaths'
import { NoBar } from '../../../ClubBarContext'
import CompDoor from '../CompDoor'
import { readCompGate } from '../read'

export const playMetadata: Metadata = { robots: { index: false, follow: false } }

/**
 * One of the event's own screens drawn inside its club (D284): through the
 * competition's members-only door first, then the screen, handed the club
 * root (`clubCompRoot`) so every link it builds stays inside the club.
 */
export async function inClub<P extends object>(
  params: Promise<{ slug: string; code: string } & P>,
  draw: (eventParams: Promise<{ root: string; tripCode: string } & P>) => ReactNode,
): Promise<ReactNode> {
  const { slug, code, ...rest } = await params
  const gate = await readCompGate(slug, code)
  if (gate.door) {
    return (
      <main data-club style={gate.clubFace.style as React.CSSProperties} className="min-h-dvh paper">
        <NoBar />
        <TripHeader backTo={`/club/${slug}`} />
        <div className="w-full max-w-md mx-auto px-4 pb-10">
          <CompDoor code={gate.code} clubName={gate.clubFace.name} here={gate.here} matchPlay={gate.kind === 'matchplay'} />
        </div>
      </main>
    )
  }
  return draw(Promise.resolve({ ...(rest as unknown as P), root: clubCompRoot(slug), tripCode: gate.code }))
}
