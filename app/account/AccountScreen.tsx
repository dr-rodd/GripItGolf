'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import BackButton from '@/app/components/BackButton'
import { FIELD, FIELD_LABEL, buttonClass } from '@/app/components/ui'
import { ACCOUNT_WORDS, CODE_LENGTH, codeDigits, codeIssue, emailIssue } from '@/lib/account'
import {
  confirmCode, deleteAccount, forgetPending, readAccount, readPending, sendCode, signOutAccount,
  watchAccount, type Pending,
} from '@/lib/accountClient'

type View =
  | { kind: 'loading' }
  | { kind: 'signedIn'; email: string }
  | { kind: 'email' }
  | { kind: 'code'; pending: Pending }
  | { kind: 'deleted' }

/**
 * One screen for the whole of it: the email, then the code in the same
 * place, then who this phone is signed in as. No link in any email — the
 * code is typed here, so a home-screen app never leaves its own window.
 */
export default function AccountScreen() {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = useCallback(async () => {
    const account = await readAccount()
    if (account) { setView({ kind: 'signedIn', email: account.email }); return }
    setView(v => {
      if (v.kind === 'deleted' || v.kind === 'code') return v
      const pending = readPending()
      return pending ? { kind: 'code', pending } : { kind: 'email' }
    })
  }, [])

  useEffect(() => {
    void refresh()
    return watchAccount(() => { void refresh() })
  }, [refresh])

  async function askForCode(e?: React.FormEvent) {
    e?.preventDefault()
    const target = view.kind === 'code' ? view.pending.email : email
    const issue = emailIssue(target)
    if (issue) { setError(issue); return }
    setBusy(true)
    setError('')
    const r = await sendCode(target)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setCode('')
    setView({ kind: 'code', pending: r.pending })
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    if (view.kind !== 'code') return
    const issue = codeIssue(code)
    if (issue) { setError(issue); return }
    setBusy(true)
    setError('')
    const r = await confirmCode(view.pending, codeDigits(code))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setCode('')
    await refresh()
  }

  async function signOut() {
    setBusy(true)
    const r = await signOutAccount()
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setError('')
    setView({ kind: 'email' })
  }

  async function remove() {
    setBusy(true)
    const r = await deleteAccount()
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setError('')
    setConfirmDelete(false)
    setView({ kind: 'deleted' })
  }

  function startAgain() {
    forgetPending()
    setCode('')
    setError('')
    setView({ kind: 'email' })
  }

  const errorLine = error && <p className="t-cap text-rust-deep mt-2" role="alert">{error}</p>

  return (
    <main className="min-h-dvh paper flex flex-col">
      <div className="w-full max-w-md mx-auto px-4 pt-2">
        <BackButton href="/" label="Home" />
      </div>

      <div className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-10" aria-busy={view.kind === 'loading'}>
        <h1 className="t-h1 text-ink">Your account</h1>
        <p className="text-ink/65 text-sm mt-1">{ACCOUNT_WORDS.never}</p>

        {view.kind === 'email' && (
          <form onSubmit={askForCode} className="mt-8">
            <p className="text-ink/80 text-[15px] leading-relaxed mb-6">
              {ACCOUNT_WORDS.why} We email you a code to sign in — there is no password.
            </p>
            <label htmlFor="account-email" className={FIELD_LABEL}>Email</label>
            <input
              id="account-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              className={FIELD}
            />
            {errorLine}
            <button type="submit" disabled={busy || !email.trim()} className={`${buttonClass('primary')} mt-6`}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </form>
        )}

        {view.kind === 'code' && (
          <form onSubmit={signIn} className="mt-8">
            <p className="text-ink/80 text-[15px] leading-relaxed mb-6">{ACCOUNT_WORDS.sent(view.pending.email)}</p>
            <label htmlFor="account-code" className={FIELD_LABEL}>Code</label>
            <input
              id="account-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={e => { setCode(codeDigits(e.target.value)); setError('') }}
              className={`${FIELD} field-code`}
            />
            {errorLine}
            <button type="submit" disabled={busy || codeDigits(code).length !== CODE_LENGTH} className={`${buttonClass('primary')} mt-6`}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="flex flex-wrap gap-x-4 mt-4">
              <button type="button" onClick={() => void askForCode()} disabled={busy} className={buttonClass('quiet', false)}>
                Send a new code
              </button>
              <button type="button" onClick={startAgain} disabled={busy} className={buttonClass('quiet', false)}>
                Use a different email
              </button>
            </div>
          </form>
        )}

        {view.kind === 'signedIn' && (
          <div className="mt-8">
            <p className="t-label text-ink/80">Signed in as</p>
            <p className="text-ink text-[17px] mt-1 break-all">{view.email}</p>
            <p className="text-ink/65 text-sm mt-4 leading-relaxed">
              The events this phone has entered stay with your account. Sign in on another phone with
              the same email to have them there too.
            </p>
            {errorLine}
            <button type="button" onClick={signOut} disabled={busy} className={`${buttonClass('secondary')} mt-8`}>
              Sign out
            </button>

            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className={`${buttonClass('quiet', false)} mt-6`}>
                Delete my account
              </button>
            ) : (
              <div className="mt-6">
                <p className="text-ink/80 text-sm leading-relaxed">
                  This deletes your account and its email address. Your names and scores stay with the
                  events they were played in, and this phone can still join, play and score as any
                  phone can.
                </p>
                <button type="button" onClick={remove} disabled={busy} className={`${buttonClass('danger')} mt-4`}>
                  {busy ? 'Deleting…' : 'Delete my account'}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} className={`${buttonClass('quiet', false)} mt-2`}>
                  Keep my account
                </button>
              </div>
            )}
          </div>
        )}

        {view.kind === 'deleted' && (
          <div className="mt-8">
            <p className="text-ink/80 text-[15px] leading-relaxed">{ACCOUNT_WORDS.deleted}</p>
            <button type="button" onClick={() => setView({ kind: 'email' })} className={`${buttonClass('quiet', false)} mt-4`}>
              Sign in again
            </button>
          </div>
        )}

        <p className="t-cap text-ink/65 mt-12">
          How we hold your email: the <Link href="/privacy" className="text-accent-deep hover:text-accent">privacy notice</Link>.
        </p>
      </div>
    </main>
  )
}
