'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FIELD, buttonClass } from '@/app/components/ui'

/** The front page's code box (D147): checked by the server, then off to the event by its short link. */
export default function CodeBox() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (checking) return
    setError('')
    setChecking(true)
    const entered = code.toUpperCase().trim()
    try {
      const res = await fetch(`/api/event/find?code=${encodeURIComponent(entered)}`, { cache: 'no-store' })
      if (res.status !== 200 && res.status !== 404) throw new Error(`find ${res.status}`)
      const data = await res.json() as { code: string | null }
      if (!data.code) { setError('Event not found — check the code and try again'); setChecking(false); return }
      router.push(`/${data.code}`)
    } catch {
      setError('Could not check the code — try again')
      setChecking(false)
    }
  }

  return (
    <form onSubmit={join} className="w-full flex flex-col gap-3 mt-6">
      <input
        type="text" value={code}
        onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
        maxLength={6} placeholder="EVENT CODE" aria-label="Event code"
        className={`${FIELD} field-code`} autoComplete="off" autoCorrect="off" spellCheck={false}
      />
      {error && <p className="text-rust-deep text-sm text-center leading-snug" role="alert">{error}</p>}
      <button type="submit" disabled={checking || code.trim().length < 6} className={buttonClass('primary')}>
        {checking ? 'Checking…' : 'Join event'}
      </button>
    </form>
  )
}
