'use client'

import { useCallback, useEffect, useState } from 'react'
import BackButton from '@/app/components/BackButton'
import { ButtonLink, EmptyState, FIELD, FIELD_LABEL, ListGroup, ListRow, Pill, buttonClass } from '@/app/components/ui'
import { accountLink } from '@/lib/account'
import { CLUB_STATUS_WORDS, INVITE_LENGTH, inviteCodeIssue } from '@/lib/clubs'
import { SITE } from '@/config/site'
import { credentialLine } from '@/lib/clubMay'
import { askClub, readAccount, type ClubSummary } from '@/lib/accountClient'

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'failed'; error: string }
  | { kind: 'ready'; clubs: ClubSummary[] }

/**
 * Clubs (stage (c)): the clubs this Green Dot member is on the list of, and
 * joining one by the code it emailed. **Clubs are set up by Green Dot, from
 * /admin — a member can no longer set one up** (Ross, 17 Nov 2026).
 */
export default function ClubsScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [joined, setJoined] = useState('')
  const [busy, setBusy] = useState<'code' | null>(null)

  const load = useCallback(async () => {
    if (!(await readAccount())) { setState({ kind: 'signedOut' }); return }
    const r = await askClub('mine')
    setState(r.ok ? { kind: 'ready', clubs: r.clubs ?? [] } : { kind: 'failed', error: r.error })
  }, [])

  useEffect(() => { void load() }, [load])

  async function join(e: React.FormEvent) {
    e.preventDefault()
    const issue = inviteCodeIssue(code)
    if (issue) { setCodeError(issue); return }
    setBusy('code'); setCodeError(''); setJoined('')
    const r = await askClub('link', { code })
    setBusy(null)
    if (!r.ok) { setCodeError(r.error); return }
    setCode('')
    // D179: a club index that differed from the account's is said once, here.
    setJoined(`${r.club ? `You’re linked to ${r.club.name}’s list.` : 'Linked.'}${r.note ? ` ${r.note}` : ''}`)
    await load()
  }

  return (
    <main className="min-h-dvh paper flex flex-col">
      <div className="w-full max-w-md mx-auto px-4 pt-2">
        <BackButton href="/account" label="Account" />
      </div>

      <div className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-10" aria-busy={state.kind === 'loading'}>
        <h1 className="t-h1 text-ink">Clubs</h1>

        {state.kind === 'signedOut' && (
          <div className="mt-8">
            <p className="text-ink/80 text-[15px] leading-relaxed">Sign in to see your clubs, or to join yours with its code.</p>
            <ButtonLink href={accountLink('/account/clubs')} full={false} className="mt-6">Sign in</ButtonLink>
          </div>
        )}

        {state.kind === 'failed' && <p className="t-cap text-rust-deep mt-6" role="alert">{state.error}</p>}

        {state.kind === 'ready' && (
          <>
            {state.clubs.length === 0 ? (
              <EmptyState className="mt-6" message="Your clubs show here once you’ve joined one with its code." />
            ) : (
              <ListGroup className="mt-6">
                {state.clubs.map(c => (
                  <ListRow
                    key={c.id}
                    href={`/account/club?id=${encodeURIComponent(c.id)}`}
                    label={c.name}
                    hint={`${credentialLine(c.credentials, c.name)} · ${CLUB_STATUS_WORDS[c.status]}`}
                    trailing={c.status === 'verified' ? <Pill tone="win">Verified</Pill> : undefined}
                  />
                ))}
              </ListGroup>
            )}

            <section className="mt-10">
              <h2 className="t-h2 text-ink">Join your club</h2>
              <p className="text-ink/65 text-sm mt-1">
                Your club emails a code to the address on its list. Type it here to link your account.
              </p>
              <form onSubmit={join} className="mt-4">
                <label htmlFor="club-code" className={FIELD_LABEL}>Code</label>
                <input id="club-code" type="text" autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false}
                  maxLength={INVITE_LENGTH + 1} value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')); setCodeError(''); setJoined('') }}
                  className={`${FIELD} field-code`} />
                {codeError && <p className="t-cap text-rust-deep mt-2" role="alert">{codeError}</p>}
                {joined && <p className="t-cap text-accent-deep mt-2" role="status">{joined}</p>}
                <button type="submit" disabled={busy !== null || !code} className={`${buttonClass('primary')} mt-6`}>
                  {busy === 'code' ? 'Checking…' : 'Join'}
                </button>
              </form>
            </section>

            <p className="t-cap text-ink/65 mt-10">
              Is your club not on Green Dot yet? Green Dot sets clubs up — write to {SITE.supportEmail}.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
