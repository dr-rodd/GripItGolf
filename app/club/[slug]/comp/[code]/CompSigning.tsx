'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ButtonLink, buttonClass, cardClass } from '@/app/components/ui'
import { askBooking, askSign, peekKept, type BookingAnswer, type CardToSign } from '@/lib/accountClient'

/**
 * Who plays (Ross, 16 Nov 2026): every member may watch a club's
 * competition, and only the players on its tee sheet — and the club's
 * admins — open the card to score. Asked of the server, which knows who is
 * booked.
 */
export function CompPlay({ code, href, closed = false }: { code: string; href: string; closed?: boolean }) {
  const [may, setMay] = useState<boolean | null>(() => {
    const r = peekKept<{ ok: true } & BookingAnswer>('booking', code)
    return r ? !!r.booked || !!r.admin : null
  })
  useEffect(() => {
    let live = true
    askBooking('state', { code }).then(r => { if (live) setMay(r.ok ? !!r.booked || !!r.admin : false) })
    return () => { live = false }
  }, [code])
  if (closed) return <p className="text-ink/80 text-[15px] leading-relaxed mt-2">The results are certified — every card is closed.</p>
  if (may === null) return null
  return may ? (
    <>
      <p className="text-ink/80 text-[15px] leading-relaxed mt-2">
        The players on the tee sheet score each other’s cards. Start your group’s card, or carry on with it.
      </p>
      <ButtonLink href={href} className="mt-4">Open the card</ButtonLink>
    </>
  ) : (
    <p className="text-ink/80 text-[15px] leading-relaxed mt-2">Only the players on the tee sheet score. Follow the cards on the leaderboard.</p>
  )
}

/**
 * Cards to sign (D177, stage (d3)): a competition card is final only with
 * its player's approval, on their own account, and its marker's signature.
 * Listed here are this account's own cards, those it was chosen to mark —
 * and, for the club's owners and admins, every card still waiting, which
 * they may sign as marker (D178). Each can be sent back while it waits.
 */
export function CardsToSign({ code, onlyWaiting = false }: { code: string; onlyWaiting?: boolean }) {
  const router = useRouter()
  const [items, setItems] = useState<CardToSign[] | null>(() => peekKept<{ ok: true; items: CardToSign[] }>('sign', code)?.items ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await askSign('list', { code })
    setItems(r.ok ? r.items : [])
  }, [code])
  useEffect(() => { void load() }, [load])

  async function act(item: CardToSign, action: 'approve' | 'mark' | 'send_back') {
    setBusy(item.playerId); setError(null)
    const r = await askSign(action, { code, playerId: item.playerId })
    setBusy(null)
    if (!r.ok) { setError({ id: item.playerId, text: r.error }); return }
    await load()
    router.refresh()
  }

  const shown = (items ?? []).filter(i => !onlyWaiting || i.canApprove || i.canMark)
  if (!items || shown.length === 0) return null
  return (
    <section className="mt-6">
      <h2 className="t-h2 text-ink">Cards to sign</h2>
      <p className="t-cap text-ink/65 mt-1">A card is final once its player approves it on their own account and its marker signs it.</p>
      <ul className="mt-3 space-y-3">
        {shown.map(item => {
          const gross = item.card.reduce((t, h) => t + (h.gross ?? 0), 0)
          const points = item.card.reduce((t, h) => t + (h.points ?? 0), 0)
          const waitingOn = [
            !item.approved ? (item.mine ? 'your approval' : `${item.name}’s approval`) : null,
            !item.marked ? (item.markerName ? `${item.markerName} to mark it` : 'a marker') : null,
          ].filter(Boolean).join(' and ')
          return (
            <li key={item.playerId} className={`${cardClass()} p-4`}>
              <button type="button" onClick={() => setOpen(o => (o === item.playerId ? null : item.playerId))}
                aria-expanded={open === item.playerId} className="w-full text-left press">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="t-card text-ink">{item.mine ? 'Your card' : item.name}</span>
                  <span className="t-data text-[17px] text-ink">{gross} · {points} pts</span>
                </span>
                <span className="block t-cap text-ink/65 mt-1">
                  {item.approved && item.marked
                    ? `Signed${item.markedAs === 'admin' ? ' — marked by the club’s admins' : item.markerName ? ` — marked by ${item.markerName}` : ''}`
                    : `Waiting for ${waitingOn}`}
                </span>
              </button>
              {open === item.playerId && <CardHoles card={item.card} />}
              {error?.id === item.playerId && <p className="t-cap text-rust-deep mt-2" role="alert">{error.text}</p>}
              {(item.canApprove || item.canMark || item.canSendBack) && (
                <div className="flex flex-wrap gap-3 mt-3">
                  {item.canApprove && (
                    <button type="button" disabled={busy !== null} onClick={() => void act(item, 'approve')} className={buttonClass('primary', false)}>
                      {busy === item.playerId ? 'Signing…' : 'Approve my card'}
                    </button>
                  )}
                  {item.canMark && (
                    <button type="button" disabled={busy !== null} onClick={() => void act(item, 'mark')} className={buttonClass('primary', false)}>
                      {busy === item.playerId ? 'Signing…' : 'Sign as marker'}
                    </button>
                  )}
                  {item.canSendBack && (
                    <button type="button" disabled={busy !== null} onClick={() => void act(item, 'send_back')} className={buttonClass('quiet', false)}>
                      Send it back
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The card hole by hole, front and back nine, as it was signed. */
function CardHoles({ card }: { card: CardToSign['card'] }) {
  const nines = [card.filter(h => h.number <= 9), card.filter(h => h.number > 9)].filter(n => n.length > 0)
  return (
    <div className="mt-3 space-y-2 overflow-x-auto">
      {nines.map((nine, i) => (
        <table key={i} className="w-full text-center t-data text-[14px] tabular-nums">
          <thead>
            <tr className="text-ink/65">
              <th className="text-left font-normal t-cap pr-2">Hole</th>
              {nine.map(h => <th key={h.number} className="font-normal">{h.number}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="text-ink/65">
              <td className="text-left t-cap pr-2">Par</td>
              {nine.map(h => <td key={h.number}>{h.par}</td>)}
            </tr>
            <tr className="text-ink">
              <td className="text-left t-cap pr-2">Score</td>
              {nine.map(h => <td key={h.number}>{h.noReturn ? 'NR' : h.gross ?? '—'}</td>)}
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  )
}
