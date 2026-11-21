/**
 * A competition page not fetched ahead (D198): under the frame the layout
 * keeps (MO3, D282) — the club's art and header never leave — only the
 * page's own part waits, a screen's worth of something, never a shape that
 * might jump. Most taps never see it (`CompAhead`, `prefetchWhole`).
 */
export default function CompLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-2/3 mt-6" />
      <div className="skeleton h-4 w-1/2 mt-3" />
      <div className="skeleton h-24 rounded-card mt-6" />
      <div className="skeleton h-24 rounded-card mt-3" />
    </div>
  )
}
