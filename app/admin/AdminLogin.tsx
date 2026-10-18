'use client'

import { useActionState } from 'react'
import { login } from './actions'
import Wordmark from '@/app/components/Wordmark'
import { FIELD, buttonClass } from '@/app/components/ui'

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
    <main className="min-h-dvh flex flex-col items-center justify-center paper px-6 py-16">
      <Wordmark width={150} className="mb-8" />

      <h1 className="t-h1 text-ink mb-2">
        Admin
      </h1>
      <p className="text-ink/65 text-sm mb-10">Platform overview</p>

      <form action={formAction} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Password"
          className={`${FIELD} text-center`}
        />

        {state.error && (
          <p className="text-rust-deep text-sm text-center leading-snug">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className={buttonClass('primary')}
        >
          {pending ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
