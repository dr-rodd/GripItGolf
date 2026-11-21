'use client'

import { homeHref, myPageHref } from '@/lib/tierHint'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BackButton from '@/app/components/BackButton'
import { IconEye, IconEyeOff } from '@/app/components/icons'
import { ButtonLink, FIELD, FIELD_LABEL, Segmented, buttonClass, iconButtonClass } from '@/app/components/ui'
import {
  ACCOUNT_WORDS, CODE_LENGTH, PASSWORD_MIN, codeDigits, safeNext, codeIssue, emailIssue, passwordConfirmIssue, passwordIssue,
  usernameIssue,
} from '@/lib/account'
import {
  accountStatus, checkUsername, confirmCode, deleteAccount, forgetPending, passwordOwed, readAccount, readPending,
  saveUsername, savePassword, sendCode, sendForgotCode, signIn, signOutAccount, takeWhyOut, watchAccount,
  type Pending, type UsernameCheck,
} from '@/lib/accountClient'

type View =
  | { kind: 'loading' }
  | { kind: 'signIn' }
  | { kind: 'join' }
  | { kind: 'forgot' }
  | { kind: 'code'; pending: Pending }
  | { kind: 'setup'; needUsername: boolean; needPassword: boolean }
  | { kind: 'signedIn'; username: string | null; email: string }
  | { kind: 'deleted' }

const TITLES: Record<View['kind'], string> = {
  loading: 'Green Dot members',
  signIn: 'Sign in',
  join: 'Join Green Dot',
  forgot: 'Forgot password',
  code: 'Check your email',
  setup: 'Finish joining',
  signedIn: 'You’re a Green Dot member',
  deleted: 'Account deleted',
}

/**
 * Green Dot members (D128–D133), one screen: sign in with a username or an
 * email and a password; join with an email and a code, then a username and a
 * password; Forgot password by a code. Any account short of a username or a
 * password is asked for what it lacks before it is done. No link in any
 * email — the code is typed here, so a home-screen app never leaves its own
 * window.
 */
export default function AccountScreen() {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [email, setEmail] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [check, setCheck] = useState<UsernameCheck | null>(null)
  const [error, setError] = useState('')
  const [reauth, setReauth] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [emailTaken, setEmailTaken] = useState(false)
  // Sent back here from the Clubhouse: says why, once (Ross, 17 Nov 2026).
  const [sentBack, setSentBack] = useState<string | null>(null)

  // Where to go once signed in (`?next=`, D135 — the create wizard that sent
  // this phone here), and whether to open on Join. Read after mount: the
  // page is static.
  const router = useRouter()
  const [next, setNext] = useState<string | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setNext(safeNext(q.get('next')))
    setSentBack(takeWhyOut())
    if (q.get('join') === '1') setView(v => (v.kind === 'loading' || v.kind === 'signIn' ? { kind: 'join' } : v))
  }, [])
  // Signed in just now (not already, on arrival): on to where it was sent
  // from, else the member's own home (D148). Already signed in, this page is
  // the account's settings, reached from Me.
  // MO1, M3–M4 (D280): back, and Your page, go to a club member's own club — never /home.
  const [back, setBack] = useState('/')
  const [mine, setMine] = useState('/home')
  useEffect(() => { setBack(homeHref()); setMine(myPageHref()) }, [view.kind])
  const firstView = useRef<View['kind'] | null>(null)
  useEffect(() => {
    if (view.kind === 'loading') return
    if (firstView.current === null) firstView.current = view.kind
    if (view.kind !== 'signedIn') return
    if (next) router.replace(next)
    else if (firstView.current !== 'signedIn') router.replace('/home')
  }, [view.kind, next, router])

  const refresh = useCallback(async () => {
    const account = await readAccount()
    if (account) {
      const status = await accountStatus()
      // The username table not reachable: still signed in, said by email.
      if (!status) { setView({ kind: 'signedIn', username: null, email: account.email }); return }
      const needUsername = !status.username
      const needPassword = !status.hasPassword || passwordOwed()
      setView(needUsername || needPassword
        ? { kind: 'setup', needUsername, needPassword }
        : { kind: 'signedIn', username: status.username, email: account.email })
      return
    }
    setView(v => {
      if (v.kind === 'deleted' || v.kind === 'code' || v.kind === 'join' || v.kind === 'forgot') return v
      const pending = readPending()
      return pending ? { kind: 'code', pending } : { kind: 'signIn' }
    })
  }, [])

  useEffect(() => {
    void refresh()
    return watchAccount(() => { void refresh() })
  }, [refresh])

  // Is the username free? Asked a moment after typing stops.
  const asked = useRef(0)
  useEffect(() => {
    const wanted = view.kind === 'setup' ? view.needUsername : renaming
    if (!wanted || !username.trim()) { setCheck(null); return }
    const local = usernameIssue(username)
    if (local) { setCheck({ invalid: local }); return }
    const n = ++asked.current
    const t = window.setTimeout(() => {
      checkUsername(username).then(r => { if (n === asked.current) setCheck(r) })
    }, 400)
    return () => window.clearTimeout(t)
  }, [username, view, renaming])

  const go = (next: View) => { setError(''); setEmailTaken(false); setReauth(false); setPassword(''); setAgain(''); setCode(''); setView(next) }

  async function submitSignIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const r = await signIn(identifier, password)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setPassword('')
    await refresh()
  }

  async function askForCode(e?: React.FormEvent) {
    e?.preventDefault()
    const forgot = view.kind === 'forgot' || (view.kind === 'code' && view.pending.purpose === 'forgot')
    const target = view.kind === 'code' ? view.pending.email : email
    const issue = emailIssue(target)
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const r = forgot ? await sendForgotCode(target) : await sendCode(target)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setCode('')
    setView({ kind: 'code', pending: r.pending })
  }

  // Joining: the email and a password typed twice first, then the code
  // that confirms the email (Ross, 15 Nov 2026). The password waits in this
  // screen's memory — never stored — and is saved the moment the code is right.
  async function submitJoin(e: React.FormEvent) {
    e.preventDefault()
    const issue = emailIssue(email) ?? passwordIssue(password) ?? passwordConfirmIssue(password, again)
    if (issue) { setError(issue); return }
    setBusy(true); setError(''); setEmailTaken(false)
    const r = await sendCode(email)
    setBusy(false)
    if (!r.ok) { setError(r.error); setEmailTaken(r.exists === true); return }
    setCode('')
    setView({ kind: 'code', pending: r.pending })
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    if (view.kind !== 'code') return
    const issue = codeIssue(code)
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const r = await confirmCode(view.pending, codeDigits(code))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setCode('')
    // The password chosen when joining is saved now the email is confirmed;
    // if the page was reloaded meanwhile it is simply asked for again.
    if (view.pending.purpose === 'join' && view.pending.mode === 'upgrade' && password && !passwordIssue(password)) {
      await savePassword(password)
    }
    setPassword(''); setAgain('')
    await refresh()
  }

  async function submitSetup(e: React.FormEvent) {
    e.preventDefault()
    if (view.kind !== 'setup') return
    if (view.needUsername) {
      const issue = usernameIssue(username)
      if (issue) { setError(issue); return }
    }
    if (view.needPassword) {
      const issue = passwordIssue(password) ?? passwordConfirmIssue(password, again)
      if (issue) { setError(issue); return }
    }
    setBusy(true); setError(''); setReauth(false)
    if (view.needUsername) {
      const u = await saveUsername(username)
      if (!u.ok) { setBusy(false); setError(u.error); return }
      setView({ ...view, needUsername: false })
    }
    if (view.needPassword) {
      const p = await savePassword(password)
      if (!p.ok) {
        setBusy(false)
        setError(p.error)
        setReauth('reauth' in p)
        return
      }
    }
    setBusy(false)
    setPassword('')
    setAgain('')
    await refresh()
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault()
    const issue = usernameIssue(username)
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const r = await saveUsername(username)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setRenaming(false)
    await refresh()
  }

  async function signOut() {
    setBusy(true)
    const r = await signOutAccount()
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    // Signed out, the front page comes back (D147).
    router.replace('/')
  }

  async function remove() {
    setBusy(true)
    const r = await deleteAccount()
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setConfirmDelete(false)
    go({ kind: 'deleted' })
  }

  function startAgain() {
    forgetPending()
    go({ kind: 'join' })
  }

  const errorLine = error && <p className="t-cap text-rust-deep mt-2" role="alert">{error}</p>
  const checkLine = check && (
    <p className={`t-cap mt-2 ${check === 'free' ? 'text-accent-deep' : check === 'failed' ? 'text-ink/65' : 'text-rust-deep'}`} aria-live="polite">
      {check === 'free' ? 'That username is free.'
        : check === 'taken' ? 'That username isn’t available.'
        : check === 'failed' ? 'Could not check that username just now.'
        : check.invalid}
    </p>
  )
  const showTabs = view.kind === 'signIn' || view.kind === 'join'

  return (
    <main className="min-h-dvh paper flex flex-col">
      <div className="w-full max-w-md mx-auto px-4 pt-2">
        <BackButton href={back} label="Home" />
      </div>

      <div className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-10" aria-busy={view.kind === 'loading'}>
        <h1 className="t-h1 text-ink">{TITLES[view.kind]}</h1>
        <p className="text-ink/65 text-sm mt-1">{ACCOUNT_WORDS.never}</p>

        {showTabs && (
          <Segmented
            className="mt-6"
            label="Sign in or join"
            value={view.kind}
            onChange={k => go({ kind: k })}
            options={[{ value: 'signIn', label: 'Sign in' }, { value: 'join', label: 'Join' }] as const}
          />
        )}

        {view.kind === 'signIn' && (
          <form onSubmit={submitSignIn} className="mt-6">
            <label htmlFor="account-identifier" className={FIELD_LABEL}>Username or email</label>
            <input
              id="account-identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={e => { setIdentifier(e.target.value); setError('') }}
              className={FIELD}
            />
            <PasswordField id="account-password" label="Password" value={password} autoComplete="current-password"
              onChange={v => { setPassword(v); setError('') }} />
            <button type="button" onClick={() => { setEmail(identifier.includes('@') ? identifier.trim() : ''); go({ kind: 'forgot' }) }}
              className={`${buttonClass('quiet', false)} mt-1`}>
              Forgot password?
            </button>
            {errorLine}
            {sentBack && <p className="t-cap text-ink/80 mt-2 break-words">You were sent back here from {sentBack}.</p>}
            <button type="submit" disabled={busy || !identifier.trim() || !password} className={`${buttonClass('primary')} mt-6`}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {view.kind === 'join' && (
          <form onSubmit={submitJoin} className="mt-6">
            <p className="text-ink/80 text-[15px] leading-relaxed mb-6">
              {ACCOUNT_WORDS.why} Choose a password, then we email you a code to confirm your email address.
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
              onChange={e => { setEmail(e.target.value); setError(''); setEmailTaken(false) }}
              className={FIELD}
            />
            <PasswordField id="account-join-password" label="Password" value={password} autoComplete="new-password"
              onChange={v => { setPassword(v); setError('') }} />
            <p className="t-cap text-ink/65 mt-2">At least {PASSWORD_MIN} characters.</p>
            <PasswordField id="account-join-confirm" label="Confirm password" value={again} autoComplete="new-password"
              onChange={v => { setAgain(v); setError('') }} />
            {errorLine}
            {emailTaken && (
              <div className="flex flex-wrap gap-x-4 mt-2">
                <button type="button" onClick={() => go({ kind: 'forgot' })} className={buttonClass('secondary', false)}>
                  Forgot password?
                </button>
                <button type="button" onClick={() => { setIdentifier(email.trim()); go({ kind: 'signIn' }) }}
                  className={buttonClass('quiet', false)}>
                  Sign in
                </button>
              </div>
            )}
            <button type="submit" disabled={busy || !email.trim() || !password || !again} className={`${buttonClass('primary')} mt-6`}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </form>
        )}

        {view.kind === 'forgot' && (
          <form onSubmit={askForCode} className="mt-6">
            <p className="text-ink/80 text-[15px] leading-relaxed mb-6">
              We email you a code, then you choose a new password.
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
            <button type="button" onClick={() => go({ kind: 'signIn' })} className={`${buttonClass('quiet', false)} mt-2`}>
              Back to sign in
            </button>
          </form>
        )}

        {view.kind === 'code' && (
          <form onSubmit={submitCode} className="mt-8">
            <p className="text-ink/80 text-[15px] leading-relaxed mb-6">
              {ACCOUNT_WORDS.sent(view.pending.email)}
              {view.pending.purpose === 'join' && ' Typing it confirms your email, then you choose a username.'}
            </p>
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
              {busy ? 'Checking…' : 'Continue'}
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

        {view.kind === 'setup' && (
          <form onSubmit={submitSetup} className="mt-8">
            <p className="text-ink/80 text-[15px] leading-relaxed mb-6">
              {view.needUsername && view.needPassword ? 'Choose a username and a password. You sign in with either your username or your email.'
                : view.needUsername ? 'Choose a username. You sign in with either your username or your email.'
                : 'Choose a password.'}
            </p>
            {view.needUsername && (
              <>
                <label htmlFor="account-username" className={FIELD_LABEL}>Username</label>
                <input
                  id="account-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError('') }}
                  className={FIELD}
                />
                <p className="t-cap text-ink/65 mt-2">3 to 20 letters, numbers, dots or underscores. Nobody else sees it yet.</p>
                {checkLine}
              </>
            )}
            {view.needPassword && (
              <>
                <PasswordField id="account-new-password" label="Password" value={password} autoComplete="new-password"
                  onChange={v => { setPassword(v); setError('') }} />
                <p className="t-cap text-ink/65 mt-2">At least {PASSWORD_MIN} characters.</p>
                <PasswordField id="account-confirm-password" label="Confirm password" value={again} autoComplete="new-password"
                  onChange={v => { setAgain(v); setError('') }} />
              </>
            )}
            {errorLine}
            {reauth && (
              <button type="button" onClick={() => go({ kind: 'forgot' })} className={`${buttonClass('quiet', false)} mt-2`}>
                Forgot password
              </button>
            )}
            <button type="submit" disabled={busy || (view.needUsername && check === 'taken') || (view.needPassword && !again)} className={`${buttonClass('primary')} mt-6`}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}

        {view.kind === 'signedIn' && (
          <div className="mt-8">
            <p className="t-label text-ink/80">Signed in as</p>
            <p className="text-ink text-[17px] mt-1 break-all">{view.username ?? view.email}</p>

            {!renaming ? (
              <button type="button" onClick={() => { setUsername(view.username ?? ''); setRenaming(true); setError('') }}
                disabled={busy} className={`${buttonClass('quiet', false)} mt-2`}>
                Change username
              </button>
            ) : (
              <form onSubmit={submitRename} className="mt-4">
                <label htmlFor="account-rename" className={FIELD_LABEL}>New username</label>
                <input
                  id="account-rename"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError('') }}
                  className={FIELD}
                />
                {checkLine}
                <div className="flex gap-3 mt-4">
                  <button type="submit" disabled={busy || check === 'taken'} className={buttonClass('primary', false)}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setRenaming(false)} disabled={busy} className={buttonClass('quiet', false)}>
                    Keep it
                  </button>
                </div>
              </form>
            )}

            <p className="text-ink/65 text-sm mt-6 leading-relaxed">
              The events this phone has entered stay with you. Sign in on another phone to have them there too.
            </p>
            {errorLine}
            <ButtonLink href={mine} variant="secondary" className="mt-8">Your page</ButtonLink>
            <ButtonLink href="/account/clubs" variant="secondary" className="mt-3">Clubs</ButtonLink>
            <button type="button" onClick={signOut} disabled={busy} className={`${buttonClass('secondary')} mt-3`}>
              Sign out
            </button>

            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className={`${buttonClass('quiet', false)} mt-6`}>
                Delete my account
              </button>
            ) : (
              <div className="mt-6">
                <p className="text-ink/80 text-sm leading-relaxed">
                  This deletes your account, its email address and username. Your names and scores stay with the
                  events they were played in, and this phone can still join, play and score as any phone can.
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
            <button type="button" onClick={() => go({ kind: 'signIn' })} className={`${buttonClass('quiet', false)} mt-4`}>
              Sign in again
            </button>
          </div>
        )}

        <p className="t-cap text-ink/65 mt-12">
          How we hold your details: the <Link href="/privacy" className="text-accent-deep hover:text-accent">privacy notice</Link>.
        </p>
      </div>
    </main>
  )
}

/** A password box with its show/hide eye (D131). */
function PasswordField({ id, label, value, onChange, autoComplete }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="mt-5">
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={FIELD}
          // .field's own padding is unlayered and beats a utility class;
          // the eye needs the room on the right.
          style={{ paddingRight: 56 }}
        />
        <button
          type="button"
          onClick={() => setShown(s => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className={`${iconButtonClass(true)} absolute right-1 top-1/2 -translate-y-1/2`}
        >
          {shown ? <IconEyeOff size={20} /> : <IconEye size={20} />}
        </button>
      </div>
    </div>
  )
}
