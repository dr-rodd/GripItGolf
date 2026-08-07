'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'

/**
 * The code a shared link carries, if any.
 *
 * Read through useSyncExternalStore rather than in an effect: the server has
 * no URL to read, so it renders empty and the browser fills it in on
 * hydration without a mismatch and without a second render pass. Taking it
 * from searchParams on the server instead would make this route dynamic, and
 * a dynamic route cannot be prefetched whole — which is the gap this was all
 * about.
 */
const subscribe = () => () => {}
const readFromUrl = () => new URLSearchParams(window.location.search).get('code') ?? ''
const readOnServer = () => ''

export default function JoinForm() {
  const linkCode = useSyncExternalStore(subscribe, readFromUrl, readOnServer)
  // Null until somebody types: until then the link's code is what shows.
  const [typed, setTyped] = useState<string | null>(null)
  const code = typed ?? linkCode.toUpperCase().slice(0, 6)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data } = await supabase
      .from('trips')
      .select('trip_code')
      .eq('trip_code', code.toUpperCase().trim())
      .single()

    if (!data) {
      setLoading(false)
      setError('Trip not found — check your code and try again')
      return
    }

    router.push(`/trip/${data.trip_code}`)
  }

  return (
    <main className="min-h-dvh bg-cream">

      {/* The mark, exactly where it arrives from the landing page — and the
          way back there, so this screen needs no back button of its own. */}
      <TripHeader backTo="/" />

      {/* The fade starts below the header. The mark has just travelled into
          that bar from the landing page and is in exactly the same place
          here — fading it in would blink it out and back for no reason. */}
      <div className="flex flex-col items-center justify-center px-6 py-12 page-enter">
        <div className="w-full max-w-xs">

        <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink mb-2">
          Join a Trip
        </h1>
        <p className="text-ink/65 text-sm mb-8">
          Enter the 6-character code from your lead player.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="GX7K2P"
            className="w-full py-4 px-5 bg-surface border border-bark/12 rounded-xl text-ink text-xl tracking-[0.4em] uppercase text-center placeholder:text-ink/50 placeholder:tracking-[0.4em] focus:outline-none focus:border-accent/60 transition-colors"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          {error && (
            <p className="text-accent text-sm text-center leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || code.trim().length < 6}
            className="w-full py-5 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Checking…' : 'Join Trip'}
          </button>
        </form>

        </div>
      </div>
    </main>
  )
}
