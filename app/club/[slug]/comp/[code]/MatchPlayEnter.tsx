'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, cardClass } from '@/app/components/ui'
import { askMatchPlay, type MatchPlayEntryAnswer } from '@/lib/accountClient'

/**
 * A club match play's one action on its Summary (stage 2; Ross, 17 Nov
 * 2026): **Enter** for a member who may, **Withdraw** for one who is in, or
 * the reason neither is offered — in the competition's own words — and the
 * field so far, the club's Officers able to take anybody out until the draw.
 * Asked after the page paints: the server cannot see who is holding the
 * phone. Once entries have closed and the draw is due, the page asks for it
 * to be made (the platform's draw job, once — `makeDueDraw`), so nobody waits
 * for the night's run.
 */
export default function MatchPlayEnter({ code, drawDue }: { code: string; drawDue: boolean }) {
  const router = useRouter()
  const [me, setMe] = useState<MatchPlayEntryAnswer | null>(null)
  const [outside, setOutside] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const asked = useRef(false)

  useEffect(() => {
    let live = true
    askMatchPlay('state', { code }).then(r => {
      if (!live) return
      if (r.ok) setMe(r)
      else setOutside(r.error)
    })
    return () => { live = false }
  }, [code])

  // The draw goes live when it is due — asked once from here, made once on the server.
  useEffect(() => {
    if (!drawDue || asked.current) return
    asked.current = true
    void fetch('/api/match/draw-due', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tripCode: code }) })
      .then(r => r.json()).then((b: { made?: boolean }) => { if (b?.made) router.refresh() }).catch(() => undefined)
  }, [drawDue, code, router])

  async function act(action: 'enter' | 'withdraw', memberId?: string) {
    setBusy(true); setError('')
    const r = await askMatchPlay(action, { code, ...(memberId ? { memberId } : {}) })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setMe(r)
    router.refresh()
  }

  if (outside) return <p className="t-cap text-ink/65 mt-3">{outside}</p>
  if (!me) return <div aria-hidden="true" className="min-h-14 mt-4" />

  const mine = !!me.myPlayerId
  const shown = me.phase === 'entries' || me.phase === 'draw_pending'
  return (
    <>
      {mine && <p className="text-ink text-[15px] font-semibold mt-3">You’re in.</p>}
      {mine && me.stuck && <p className="t-cap text-ink/65 mt-1">{me.stuck}</p>}
      {mine && !me.stuck && (
        <Button variant="secondary" className="mt-4" disabled={busy} onClick={() => void act('withdraw')}>{busy ? 'Taking you out…' : 'Withdraw'}</Button>
      )}
      {!mine && me.myRefusal && <p className="t-cap text-ink/80 mt-3">{me.myRefusal}</p>}
      {!mine && !me.myRefusal && me.closed && <p className="t-cap text-ink/80 mt-3">{me.closed}</p>}
      {!mine && !me.myRefusal && !me.closed && (
        <Button className="mt-4" disabled={busy} onClick={() => void act('enter')}>{busy ? 'Entering…' : 'Enter'}</Button>
      )}
      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}

      {shown && me.entrants.length > 0 && (
        <div className="mt-5">
          <p className="t-label text-ink">Entered{me.cap ? ` · ${me.entrants.length} of ${me.cap}` : ` · ${me.entrants.length}`}</p>
          <ul className={`${cardClass('flat')} mt-2 divide-y divide-line`}>
            {me.entrants.map(e => (
              <li key={e.rowId ?? e.name} className="flex items-center gap-3 px-3 py-2">
                <span className={`flex-1 min-w-0 truncate text-[15px] ${e.rowId === me.myRowId ? 'text-ink font-semibold' : 'text-ink'}`}>{e.name}</span>
                {me.admin && e.rowId && e.rowId !== me.myRowId && (
                  <button type="button" disabled={busy} onClick={() => void act('withdraw', e.rowId!)} className="t-label text-ink/80 px-2 min-h-11 press">Take out</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
