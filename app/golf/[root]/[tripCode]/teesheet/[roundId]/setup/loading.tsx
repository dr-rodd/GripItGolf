/**
 * The tee sheet wizard, answering the tap at once — the loading.tsx rule:
 * the header, the progress and the question's line are certain; the step
 * itself is not promised.
 */
export default function Loading() {
  return (
    <main className="min-h-dvh paper has-tabbar">
      <div className="h-[57px] border-b border-line" />
      <div className="max-w-lg mx-auto px-4 pt-4 flex gap-1.5">
        {[0, 1, 2].map(i => <div key={i} className="h-1 flex-1 rounded-full bg-tint" />)}
      </div>
      <div className="max-w-lg mx-auto px-4 pt-[4.5rem]">
        <div className="h-9 w-64 rounded-lg bg-tint animate-pulse" />
      </div>
    </main>
  )
}
