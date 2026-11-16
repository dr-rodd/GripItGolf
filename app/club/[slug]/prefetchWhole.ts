import type { useRouter } from 'next/navigation'

type Router = ReturnType<typeof useRouter>

/**
 * A club page fetched whole ahead of the tap (D198, Ross, 16 Nov 2026:
 * preload, then be snappy) — the page and its data, not only its frame, so
 * the tap shows it at once. Next keeps it a few minutes; the page then asks
 * again behind what is on screen (`RefreshBehind`). Only ever a handful of a
 * club's own competition pages, never an event page (D92 stands for boards).
 */
export function prefetchWhole(router: Router, href: string) {
  try {
    router.prefetch(href, { kind: 'full' } as unknown as Parameters<Router['prefetch']>[1])
  } catch { /* a prefetch is only ever a head start */ }
}
