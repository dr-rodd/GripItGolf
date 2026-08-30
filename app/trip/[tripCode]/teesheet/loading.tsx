/**
 * The tee sheet's instant response — the loading.tsx rule (see the other
 * five): the tap paints now, and the skeleton promises no shape it might
 * not draw. The heading is certain; the sheet itself is not (a round, no
 * rounds, chips or none), so below the title there is only quiet.
 */
export default function Loading() {
  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <div className="h-[57px] border-b border-bark/12" />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="h-9 w-40 rounded-lg bg-bark/[0.06] animate-pulse mb-2" />
        <div className="h-4 w-64 rounded bg-bark/[0.06] animate-pulse" />
      </div>
    </main>
  )
}
