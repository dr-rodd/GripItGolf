import { notFound, redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'

export const dynamic = 'force-dynamic'

/**
 * The short link: greendot.live/GX7K2P.
 *
 * A code is the whole address of an event, so the address bar should accept
 * one bare. This route catches anything the real pages don't claim — Next
 * always resolves a static route (/golf, /join, /dashboard…) before a
 * dynamic sibling, so nothing that exists can be shadowed by it, now or
 * when the next sport gets a doorway. That is also why this is a route and
 * not a config redirect: a config redirect runs *before* the filesystem,
 * and "tennis" is six letters.
 *
 * Anything code-shaped is looked up (case-insensitively — a typed URL is
 * usually lowercase) and sent on to the trip hub, which stays the one
 * canonical address: shared links and the QR keep their /trip/ form, where
 * the invite unfurl metadata lives. Anything else is a plain 404.
 */
export default async function ShortCodePage({ params }: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  // Only a code is worth a database trip. A stray path lands here too —
  // this segment is the root's catch-all — and gets its 404 straight away.
  if (!/^[A-Za-z0-9]{6}$/.test(code)) notFound()

  const tripCode = code.toUpperCase()
  const { data } = await supabase
    .from('trips')
    .select('trip_code')
    .eq('trip_code', tripCode)
    .single()

  if (data) redirect(`/trip/${data.trip_code}`)

  // Code-shaped but nobody's: the same calm answer the join box gives,
  // because a mistyped character is the likely story.
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6">
      <p className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3">
        Event not found
      </p>
      <p className="text-ink/65 text-sm mb-8">
        Nothing answers to {tripCode} — check the code and try again.
      </p>
      <BackButton href="/" label="Home" />
    </main>
  )
}
