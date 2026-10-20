'use client'

import { useState } from 'react'
import { LinkHeading, LinkedBadge } from '@/app/components/LinkMark'
import { cardClass } from '@/app/components/ui'

/**
 * Golf Ireland, from the organiser's side — on a league that reads its
 * cards. Which rounds count, and every player who has linked or asked to:
 * a request waits here for the organiser to say it is them (Confirm) or
 * not (Refuse). No card is read for a link until it is confirmed, because
 * without a Golf Ireland sign-in the organiser, who knows their members,
 * is the check (docs/golf-ireland.md).
 */

export type LinkRequest = {
  playerId: string
  playerName: string
  memberName: string
  clubName: string
  confirmed: boolean
}

const SMALL_BUTTON = 'px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40'

export default function GolfIrelandRequests({ tripCode, rulesLine, connected, initial }: {
  tripCode: string
  rulesLine: string
  connected: boolean
  initial: LinkRequest[]
}) {
  const [links, setLinks] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(l: LinkRequest, decision: 'confirm' | 'refuse') {
    if (busy) return
    if (decision === 'refuse' && !window.confirm(
      `Refuse ${l.playerName}'s link to ${l.memberName}? They can search again.`,
    )) return
    setBusy(l.playerId)
    setError(null)
    try {
      const res = await fetch('/api/golf-ireland/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode, playerId: l.playerId, decision }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) { setError(body.message ?? 'Could not save — try again'); return }
      setLinks(prev => decision === 'refuse'
        ? prev.filter(x => x.playerId !== l.playerId)
        : prev.map(x => x.playerId === l.playerId ? { ...x, confirmed: true } : x))
    } catch {
      setError('Could not reach the site — check your connection and try again')
    } finally {
      setBusy(null)
    }
  }

  const waiting = links.filter(l => !l.confirmed)
  const linked = links.filter(l => l.confirmed)

  return (
    <section className={`mt-10 p-4 ${cardClass()}`}>
      <LinkHeading>Golf Ireland</LinkHeading>
      <p className="t-cap text-ink/65 mt-3">Rounds that count: {rulesLine}</p>
      {!connected && (
        <p className="text-ink/80 text-[13px] mt-2 leading-snug">
          Golf Ireland isn&apos;t connected yet. Access has been asked for; players
          can link once it is granted.
        </p>
      )}

      {links.length === 0 ? (
        <p className="text-ink/65 text-[13px] mt-3 leading-snug">
          Nobody has linked yet. Players link from the screen where they claim
          their name.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 mt-4">
          {waiting.map(l => (
            <li key={l.playerId} className="px-4 py-3 rounded-tile border border-line">
              <p className="text-ink text-sm font-medium">{l.playerName}</p>
              <p className="t-cap text-ink/65">
                Asks to link {l.memberName}{l.clubName && `, ${l.clubName}`}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => decide(l, 'confirm')}
                  disabled={!!busy}
                  className={`${SMALL_BUTTON} border-accent-deep text-accent-deep hover:bg-accent-tint`}
                >
                  {busy === l.playerId ? '…' : 'It’s them'}
                </button>
                <button
                  type="button"
                  onClick={() => decide(l, 'refuse')}
                  disabled={!!busy}
                  className={`${SMALL_BUTTON} border-rust/40 text-rust-deep hover:bg-rust/[0.06]`}
                >
                  Refuse
                </button>
              </div>
            </li>
          ))}
          {linked.map(l => (
            <li key={l.playerId} className="flex items-center gap-2 px-4 py-3 rounded-tile border border-line">
              <LinkedBadge size={16} />
              <div className="min-w-0">
                <p className="text-ink text-sm font-medium truncate">{l.playerName}</p>
                <p className="t-cap text-ink/65 truncate">{l.memberName}{l.clubName && `, ${l.clubName}`}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-rust-deep text-sm mt-3 leading-snug">{error}</p>}
    </section>
  )
}
