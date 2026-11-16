'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass, cardClass } from '@/app/components/ui'
import { askCertify, type CertifyAnswer, type CertifyPlayer } from '@/lib/accountClient'
import { indexLabel } from '@/lib/handicapIndex'

const STATE_WORDS: Record<CertifyPlayer['state'], string> = {
  none: 'No card',
  on_course: 'On the course',
  waiting: 'To be signed',
  final: 'Signed',
  no_return: 'No return',
}

const SOURCE_WORDS: Record<string, string> = {
  me: 'on Me', list: 'on the club’s list', start_sheet: 'on the card', link: 'linking', unlink: 'leaving the list',
}

const clock = (iso: string) => new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const when = (iso: string) => new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

/**
 * Running a competition's results (stage (d4)) — the club's owners and
 * admins only; anybody else is answered no and sees nothing. Each booked
 * player: mark a player with no card No return (and take it off again), or
 * void a card still being scored. Once everyone is accounted for — a card
 * signed by both, or No return — the handicap indexes changed on the day,
 * then **Certify the results**. Certified: **Reopen**.
 */
export default function CompAdmin({ code }: { code: string }) {
  const router = useRouter()
  const [state, setState] = useState<CertifyAnswer | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await askCertify('state', { code })
    if (r.ok) setState(r)
    else if (r.status === 503) setState({ ready: false })
    else setState(null)
  }, [code])
  useEffect(() => { void load() }, [load])

  async function act(key: string, action: Parameters<typeof askCertify>[0], body: Record<string, unknown> = {}) {
    setBusy(key); setError(''); setConfirm(null)
    const r = await askCertify(action, { code, ...body })
    setBusy(null)
    if (!r.ok) { setError(r.error); return }
    await load()
    router.refresh()
  }

  if (!state) return null
  if (state.ready === false) {
    return (
      <section className={`${cardClass()} p-4 mt-6`}>
        <h2 className="t-card text-ink">Results</h2>
        <p className="t-cap text-ink/65 mt-1">Certifying is not set up yet — the cards are safe as they are.</p>
      </section>
    )
  }
  const players = state.players ?? []
  return (
    <section className={`${cardClass()} p-4 mt-6`}>
      <h2 className="t-card text-ink">Results</h2>
      <p className="t-cap text-ink/65 mt-1">For the club’s admins: every booked player needs a signed card or a No return before the results are certified.</p>
      {players.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {players.map(p => (
            <li key={p.playerId} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[15px] text-ink truncate">{p.name}</span>
                  <span className="block t-cap text-ink/65">{STATE_WORDS[p.state]}</span>
                </span>
                {!state.certifiedAt && p.state === 'none' && (
                  <button type="button" disabled={busy !== null} onClick={() => void act(p.playerId, 'no_return', { playerId: p.playerId })}
                    className={buttonClass('quiet', false)}>No return</button>
                )}
                {!state.certifiedAt && p.state === 'no_return' && (
                  <button type="button" disabled={busy !== null} onClick={() => void act(p.playerId, 'undo_no_return', { playerId: p.playerId })}
                    className={buttonClass('quiet', false)}>Take it off</button>
                )}
                {!state.certifiedAt && p.state === 'on_course' && p.liveRoundId && confirm !== p.playerId && (
                  <button type="button" disabled={busy !== null} onClick={() => setConfirm(p.playerId)} className={buttonClass('quiet', false)}>Void the card</button>
                )}
              </div>
              {confirm === p.playerId && p.liveRoundId && (
                <div className="mt-2">
                  <p className="t-cap text-ink/80">
                    Every score on the card is deleted{p.cardmates.length ? ` — for ${[p.name, ...p.cardmates].join(', ')}` : ''}. They can start again, or be marked No return.
                  </p>
                  <div className="flex gap-3 mt-2">
                    <button type="button" disabled={busy !== null} onClick={() => void act(p.playerId, 'void', { liveRoundId: p.liveRoundId })}
                      className={buttonClass('primary', false)}>{busy === p.playerId ? 'Voiding…' : 'Void it'}</button>
                    <button type="button" onClick={() => setConfirm(null)} className={buttonClass('quiet', false)}>Cancel</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="t-cap text-rust-deep mt-2" role="alert">{error}</p>}

      {state.certifiedAt ? (
        <div className="mt-4">
          <p className="t-label text-ink">Certified {when(state.certifiedAt)}</p>
          {confirm !== 'reopen' ? (
            <button type="button" disabled={busy !== null} onClick={() => setConfirm('reopen')} className={`${buttonClass('quiet', false)} mt-2`}>Reopen</button>
          ) : (
            <div className="mt-2">
              <p className="t-cap text-ink/80">The results go back to provisional, the cards can be changed again, and the round leaves everybody’s season until it is certified again.</p>
              <div className="flex gap-3 mt-2">
                <button type="button" disabled={busy !== null} onClick={() => void act('reopen', 'reopen')} className={buttonClass('primary', false)}>
                  {busy === 'reopen' ? 'Reopening…' : 'Reopen the results'}
                </button>
                <button type="button" onClick={() => setConfirm(null)} className={buttonClass('quiet', false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : state.mayCertify ? (
        <div className="mt-4">
          <h3 className="t-label text-ink">Handicap indexes changed on the day</h3>
          {(state.changes ?? []).length === 0 ? (
            <p className="t-cap text-ink/65 mt-1">None — every player kept the index they had.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {(state.changes ?? []).map((c, i) => (
                <li key={i} className="t-cap text-ink/80">
                  <span className="text-ink font-medium">{c.name}</span>{' '}
                  <span className="t-data">{c.oldIndex === null ? '—' : indexLabel(c.oldIndex)} → {c.newIndex === null ? '—' : indexLabel(c.newIndex)}</span>
                  {' · '}{clock(c.at)} by {c.by}{SOURCE_WORDS[c.source] ? `, ${SOURCE_WORDS[c.source]}` : ''}
                </li>
              ))}
            </ul>
          )}
          <button type="button" disabled={busy !== null} onClick={() => void act('certify', 'certify')} className={`${buttonClass('primary')} mt-4`}>
            {busy === 'certify' ? 'Certifying…' : 'Certify the results'}
          </button>
        </div>
      ) : (
        <p className="t-cap text-ink/65 mt-3">Certify the results once every card is signed or marked No return.</p>
      )}
    </section>
  )
}
