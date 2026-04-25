'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function JoinForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: trip } = await supabase
      .from('trips')
      .select('trip_code')
      .eq('trip_code', code.toUpperCase().trim())
      .single()

    if (!trip) {
      setLoading(false)
      setError('Trip not found — check your code and try again')
      return
    }

    window.location.href = `/trip/${trip.trip_code}`
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a1a0e] px-6">
      <div className="w-full max-w-xs">

        {/* Logo mark */}
        <div className="mb-8 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-[#C9A84C]" />
          <div className="w-3 h-3 rounded-full bg-[#C9A84C]" />
          <div className="w-3 h-3 rounded-full border-2 border-[#C9A84C]" />
        </div>

        <h1 className="font-[family-name:var(--font-playfair)] text-4xl text-white mb-2">
          Join a Trip
        </h1>
        <p className="text-white/40 text-sm mb-8">
          Enter the 6-character code from your organiser.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="GX7K2P"
            className="w-full py-4 px-5 bg-white/5 border border-white/15 rounded-xl text-white text-xl tracking-[0.4em] uppercase text-center placeholder:text-white/15 placeholder:tracking-[0.4em] focus:outline-none focus:border-[#C9A84C]/60 transition-colors"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          {error && (
            <p className="text-[#C9A84C] text-sm text-center leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || code.trim().length < 6}
            className="w-full py-5 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Checking…' : 'Join Trip'}
          </button>
        </form>

        <div className="mt-10">
          <Link href="/" className="text-white/25 text-xs tracking-wide hover:text-white/50 transition-colors">
            ← Back to home
          </Link>
        </div>

      </div>
    </main>
  )
}
