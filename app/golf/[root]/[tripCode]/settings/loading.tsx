/**
 * An event's Settings tab, answering the tap at once — the loading.tsx
 * rule (see the others): the header and the first heading are certain,
 * and below them nothing is promised.
 */
export default function Loading() {
  return (
    <main className="min-h-dvh paper has-tabbar">
      <div className="h-[57px] border-b border-line" />
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="h-7 w-20 rounded-lg bg-tint animate-pulse mb-3" />
        <div className="h-24 rounded-card bg-tint animate-pulse" />
      </div>
    </main>
  )
}
