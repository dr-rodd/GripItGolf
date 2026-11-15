'use client'

import { useCallback, useEffect, useState } from 'react'
import BackButton from '@/app/components/BackButton'
import { ButtonLink, EmptyState, FIELD, FIELD_LABEL, ListGroup, ListRow, Pill, buttonClass } from '@/app/components/ui'
import { MAX_PASSCODE } from '@/lib/passcode'
import { claimCodeIssue, type MyEvent } from '@/lib/account'
import { claimEvent, myEvents, readAccount, unlinkPlayer } from '@/lib/accountClient'

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'failed'; error: string }
  | { kind: 'ready'; events: MyEvent[] }

const KIND_WORD: Record<MyEvent['kind'], string> = { trip: 'Trip', tournament: 'Event', run: 'Challenge' }

/**
 * My events (stage (b1), D134): every event a Green Dot member owns, has
 * entered on a phone signed in to their account, or is linked to a player in
 * — newest first, each opening through its short link. Below it, the players
 * this account is linked to, each with Unlink, and "Add an event you run":
 * its code and organiser PIN make it this account's.
 */
export default function MyEventsScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [claimError, setClaimError] = useState('')
  const [claimed, setClaimed] = useState('')
  const [busy, setBusy] = useState(false)
  const [unlinking, setUnlinking] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!(await readAccount())) { setState({ kind: 'signedOut' }); return }
    const r = await myEvents()
    setState(r.ok ? { kind: 'ready', events: r.events } : { kind: 'failed', error: r.error })
  }, [])

  useEffect(() => { void load() }, [load])

  async function claim(e: React.FormEvent) {
    e.preventDefault()
    const issue = claimCodeIssue(code)
    if (issue) { setClaimError(issue); return }
    setBusy(true); setClaimError(''); setClaimed('')
    const r = await claimEvent(code, pin)
    setBusy(false)
    if (!r.ok) { setClaimError(r.error); setPin(''); return }
    setClaimed(code.trim().toUpperCase())
    setCode(''); setPin('')
    await load()
  }

  async function unlink(eventCode: string) {
    setUnlinking(eventCode)
    const r = await unlinkPlayer(eventCode)
    setUnlinking(null)
    if (r.ok) await load()
  }

  const linked = state.kind === 'ready' ? state.events.filter(e => e.player) : []

  return (
    <main className="min-h-dvh paper flex flex-col">
      <div className="w-full max-w-md mx-auto px-4 pt-2">
        <BackButton href="/account" label="Account" />
      </div>

      <div className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-10" aria-busy={state.kind === 'loading'}>
        <h1 className="t-h1 text-ink">My events</h1>

        {state.kind === 'signedOut' && (
          <div className="mt-8">
            <p className="text-ink/80 text-[15px] leading-relaxed">Sign in to see the events you make, run and play in.</p>
            <ButtonLink href="/account" full={false} className="mt-6">Sign in</ButtonLink>
          </div>
        )}

        {state.kind === 'failed' && (
          <p className="t-cap text-rust-deep mt-6" role="alert">{state.error}</p>
        )}

        {state.kind === 'ready' && (
          <>
            {state.events.length === 0 ? (
              <EmptyState className="mt-6"
                message="Events you make, or join on a phone signed in to your Green Dot account, show here." />
            ) : (
              <ListGroup className="mt-6">
                {state.events.map(e => (
                  <ListRow
                    key={e.code}
                    href={`/${e.code}`}
                    label={e.name}
                    hint={[KIND_WORD[e.kind], e.code, e.player ? `You’re ${e.player.name}` : null].filter(Boolean).join(' · ')}
                    trailing={e.owned ? <Pill>Yours</Pill> : undefined}
                  />
                ))}
              </ListGroup>
            )}

            {linked.length > 0 && (
              <section className="mt-10">
                <h2 className="t-h2 text-ink">Your players</h2>
                <p className="text-ink/65 text-sm mt-1">
                  Claiming your name while signed in links you to that player. Unlink one that isn’t you.
                </p>
                <ListGroup className="mt-4">
                  {linked.map(e => (
                    <ListRow
                      key={e.code}
                      label={e.player!.name}
                      hint={e.name}
                      trailing={
                        <button type="button" onClick={() => void unlink(e.code)} disabled={unlinking !== null}
                          className={buttonClass('quiet', false, true)}>
                          {unlinking === e.code ? 'Unlinking…' : 'Unlink'}
                        </button>
                      }
                    />
                  ))}
                </ListGroup>
              </section>
            )}

            <section className="mt-10">
              <h2 className="t-h2 text-ink">Add an event you run</h2>
              <p className="text-ink/65 text-sm mt-1">
                Its code and organiser PIN make it yours: its settings are then open on any phone you’re signed in on.
                An event made with your email is yours already.
              </p>
              <form onSubmit={claim} className="mt-4">
                <label htmlFor="claim-code" className={FIELD_LABEL}>Event code</label>
                <input id="claim-code" type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  maxLength={6} value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setClaimError(''); setClaimed('') }}
                  className={`${FIELD} field-code`} />
                <label htmlFor="claim-pin" className={`${FIELD_LABEL} mt-5`}>Organiser PIN</label>
                <input id="claim-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={MAX_PASSCODE}
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setClaimError(''); setClaimed('') }}
                  className={`${FIELD} field-code`} />
                {claimError && <p className="t-cap text-rust-deep mt-2" role="alert">{claimError}</p>}
                {claimed && <p className="t-cap text-accent-deep mt-2" role="status">{claimed} is yours now.</p>}
                <button type="submit" disabled={busy || code.length !== 6 || !pin} className={`${buttonClass('primary')} mt-6`}>
                  {busy ? 'Adding…' : 'Add event'}
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
