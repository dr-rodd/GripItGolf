'use client'

import { useActionState } from 'react'
import { login } from './actions'
import GreenDot from '@/app/components/GreenDot'

/**
 * The password form.
 *
 * Nothing is checked here — the action runs on the server, and this component
 * only ever sees whether it said yes or no. The password itself is never sent
 * to the browser to compare against.
 */
export default function AdminLogin() {
  const [state, formAction, pending] = useActionState(login, { error: null })

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a1a0e] px-6 py-16">
      <GreenDot size={16} className="mb-6" />

      <h1 className="font-[family-name:var(--font-playfair)] text-white text-2xl mb-2">
        Admin
      </h1>
      <p className="text-white/35 text-sm mb-10">Trip overview</p>

      <form action={formAction} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Password"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-center placeholder-white/25 focus:outline-none focus:border-[#C9A84C]/50 transition-colors"
        />

        {state.error && (
          <p className="text-amber-400 text-sm text-center leading-snug">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-4 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors disabled:opacity-40"
        >
          {pending ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
