import type { Metadata } from 'next'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { PageTitle } from '@/app/components/ui'
import { INTERCLUB_HUB } from '@/lib/interclub'
import Finder from './Finder'
import { readProvinces } from './source'

/**
 * Interclub (Ross, 27 Nov 2026; docs/interclub.md, stage 1): every
 * Golf Ireland inter-club competition, a province at a time, each opening
 * its draw redrawn as Green Dot draws a bracket. Public — no account, no
 * code — and regenerated at most every fifteen minutes, reading the
 * official draws on the same clock (`source.ts`).
 */

// INTERCLUB_SECONDS — Next needs the figure written here; test:interclub holds the two in step.
export const revalidate = 900

export const metadata: Metadata = {
  title: 'Interclub',
  description: 'Every inter-club draw in Ireland, live — Barton Shield, Junior Cup, Senior Cup and the rest, province by province.',
}

export default async function InterclubPage() {
  const provinces = await readProvinces()

  return (
    <main className="min-h-dvh paper">
      <TripHeader backTo="/" />
      <div className="px-4 pt-4 pb-12 page-enter">
        <div className="w-full max-w-lg mx-auto">
          <PageTitle sub="Every inter-club draw in Ireland, as it stands.">Interclub</PageTitle>

          <div className="mt-5">
            <Finder provinces={provinces} />
          </div>

          <p className="t-cap text-ink/65 text-center mt-8">
            Draws as published on Golf Ireland’s{' '}
            <a href={INTERCLUB_HUB} className="underline hover:text-ink/80" target="_blank" rel="noopener noreferrer">inter-club hub</a>
            , read every 15 minutes. Green Dot is independent of Golf Ireland.
          </p>
          <LegalLinks className="mt-4" />
        </div>
      </div>
    </main>
  )
}
