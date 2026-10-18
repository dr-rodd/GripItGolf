'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TripHeader from '@/app/components/TripHeader'
import LegalLinks from '@/app/components/LegalLinks'
import { FIELD, buttonClass } from '@/app/components/ui'

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
      setError('Event not found — check your code and try again')
      return
    }

    router.push(`/trip/${data.trip_code}`)
  }

  return (
    <main className="min-h-dvh paper">

      {/* The mark, exactly where it arrives from the landing page — and the
          way back there, so this screen needs no back button of its own. */}
      <TripHeader backTo="/" />

      {/* The fade starts below the header. The mark has just travelled into
          that bar from the landing page and is in exactly the same place
          here — fading it in would blink it out and back for no reason. */}
      <div className="flex flex-col items-center justify-center px-6 py-12 page-enter">
        <div className="w-full max-w-xs">

        <h1 className="t-h1 text-ink mb-2">
          Join an Event
        </h1>
        <p className="text-ink/65 text-sm mb-8">
          Enter the 6-character code you were given.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="GX7K2P"
            className={`${FIELD} field-code`}
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
            className={buttonClass('primary')}
          >
            {loading ? 'Checking…' : 'Join event'}
          </button>
        </form>

        <LegalLinks className="mt-10" />

        </div>
      </div>
    </main>
  )
}
