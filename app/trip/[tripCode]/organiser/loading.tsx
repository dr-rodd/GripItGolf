import TripHeader from '@/app/components/TripHeader'

/**
 * The organiser area, before its queries come back.
 *
 * Only the furniture that is certain: the header and the page's own name.
 * Whether the PIN gate stands in front, how many notices there are and how
 * many rounds — all of that is the data's to decide, and a skeleton that
 * guessed would be promising a shape it might not draw.
 */
export default function OrganiserLoading() {
  return (
    <div className="min-h-dvh bg-cream has-tabbar">
      <TripHeader />
      <div
        className="max-w-lg mx-auto px-4 pt-4"
        role="status"
        aria-busy="true"
        aria-label="Loading the organiser area"
      >
        <div className="skeleton h-9 w-40 rounded-lg" />
      </div>
    </div>
  )
}
