'use client'

import { useState } from 'react'
import Wordmark from '@/app/components/Wordmark'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BackButton from '@/app/components/BackButton'

export default function JoinForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase())
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
    <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6 page-enter">
      <div className="w-full max-w-xs">

        {/* The mark */}
        <div className="mb-6 -ml-2">
          <Wordmark width={150} />
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink mb-2">
          Join a Trip
        </h1>
        <p className="text-ink/40 text-sm mb-8">
          Enter the 6-character code from your organiser.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="GX7K2P"
            className="w-full py-4 px-5 bg-surface border border-bark/12 rounded-xl text-ink text-xl tracking-[0.4em] uppercase text-center placeholder:text-ink/25 placeholder:tracking-[0.4em] focus:outline-none focus:border-accent/60 transition-colors"
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
            className="w-full py-5 bg-accent text-ink text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Checking…' : 'Join Trip'}
          </button>
        </form>

        <div className="mt-10">
          <BackButton href="/" label="Home" />
        </div>

      </div>
    </main>
  )
}
