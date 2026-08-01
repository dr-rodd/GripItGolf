'use client'

import { useActionState } from 'react'
import { login } from './actions'
import Wordmark from '@/app/components/Wordmark'

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
    <main className="min-h-dvh flex flex-col items-center justify-center bg-cream px-6 py-16">
      <Wordmark width={150} className="mb-8" />

      <h1 className="font-[family-name:var(--font-display)] text-ink text-2xl mb-2">
        Admin
      </h1>
      <p className="text-ink/65 text-sm mb-10">Trip overview</p>

      <form action={formAction} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Password"
          className="w-full bg-surface border border-bark/12 rounded-xl px-4 py-3.5 text-ink text-center placeholder:text-ink/60 focus:outline-none focus:border-accent/50 transition-colors"
        />

        {state.error && (
          <p className="text-rust-deep text-sm text-center leading-snug">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-4 bg-accent-deep text-white text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent transition-colors disabled:opacity-40"
        >
          {pending ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
