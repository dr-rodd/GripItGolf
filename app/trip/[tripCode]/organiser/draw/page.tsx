import { redirect } from 'next/navigation'

/**
 * The draw used to be its own page; it is the first step of the bracket's
 * flow now (organiser/bracket, Ross, 5 Nov 2026). Old links land there.
 */
export default async function DrawPage({ params }: { params: Promise<{ tripCode: string }> }) {
  const { tripCode } = await params
  redirect(`/trip/${tripCode}/organiser/bracket`)
}
