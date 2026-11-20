'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, FIELD, FIELD_LABEL, cardClass } from '@/app/components/ui'
import { askMatchPlay, type MatchPlayEntryAnswer } from '@/lib/accountClient'

/**
 * A club match play's one action on its Summary (stage 2; Ross, 17 Nov
 * 2026): **Enter** for a member who may, **Withdraw** for one who is in, or
 * the reason neither is offered — in the competition's own words — and the
 * field so far. Taking anybody else out is the Clubhouse's alone.
 *
 * Fourball and Foursomes (stage 4): the entry is a pair. Pick a partner from
 * the club's list and **Enter with** them, or **Enter on your own** looking
 * for one; a member looking is shown in a seat with the one beside them open
 * and **Join** in it. The partner does not accept — they see "You’re in with
 * Ross". You take out yourself and a partner you put in.
 *
 * Asked after the page paints: the server cannot see who is holding the
 * phone. Once entries have closed and the draw is due, the page asks for it
 * to be made (the platform's draw job, once — `makeDueDraw`), so nobody waits
 * for the night's run.
 */
export default function MatchPlayEnter({ code, drawDue, pairs: pairsMode = false, loneNote }: {
  code: string
  drawDue: boolean
  /** A Fourball or Foursomes match play. */
  pairs?: boolean
  /** Said before the draw on a pairs match play — a pair one short is not drawn. */
  loneNote?: string
}) {
  const router = useRouter()
  const [me, setMe] = useState<MatchPlayEntryAnswer | null>(null)
  const [outside, setOutside] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
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

  async function act(action: 'enter' | 'withdraw' | 'join' | 'partner', body: Record<string, unknown> = {}, label: string = action) {
    setBusy(label); setError('')
    const r = await askMatchPlay(action, { code, ...body })
    setBusy(null)
    if (!r.ok) { setError(r.error); return }
    setMe(r)
    setPicked(null)
    router.refresh()
  }

  if (outside) return <p className="t-cap text-ink/65 mt-3">{outside}</p>
  if (!me) return <div aria-hidden="true" className="min-h-14 mt-4" />

  const mine = !!me.myPlayerId
  const shown = me.phase === 'entries' || me.phase === 'draw_pending'
  const err = error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>

  if (!pairsMode) {
    return (
      <>
        {mine && <p className="text-ink text-[15px] font-semibold mt-3">You’re in.</p>}
        {mine && me.stuck && <p className="t-cap text-ink/65 mt-1">{me.stuck}</p>}
        {mine && !me.stuck && (
          <Button variant="secondary" className="mt-4" disabled={!!busy} onClick={() => void act('withdraw')}>{busy ? 'Taking you out…' : 'Withdraw'}</Button>
        )}
        {!mine && me.myRefusal && <p className="t-cap text-ink/80 mt-3">{me.myRefusal}</p>}
        {!mine && !me.myRefusal && me.closed && <p className="t-cap text-ink/80 mt-3">{me.closed}</p>}
        {!mine && !me.myRefusal && !me.closed && (
          <Button className="mt-4" disabled={!!busy} onClick={() => void act('enter')}>{busy ? 'Entering…' : 'Enter'}</Button>
        )}
        {err}

        {shown && me.entrants.length > 0 && (
          <div className="mt-5">
            <p className="t-label text-ink">Entered{me.cap ? ` · ${me.entrants.length} of ${me.cap}` : ` · ${me.entrants.length}`}</p>
            <ul className={`${cardClass('flat')} mt-2 divide-y divide-line`}>
              {me.entrants.map(e => (
                <li key={e.rowId ?? e.name} className="flex items-center gap-3 px-3 py-2">
                  <span className={`flex-1 min-w-0 truncate text-[15px] ${e.rowId === me.myRowId ? 'text-ink font-semibold' : 'text-ink'}`}>{e.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    )
  }

  // ── A pair ──
  const pairs = me.pairs ?? []
  const canEnter = !mine && !me.myRefusal && !me.closed
  return (
    <>
      {mine && (
        <p className="text-ink text-[15px] font-semibold mt-3">
          {me.partner ? <>You’re in with <span className="t-data">{me.partner}</span>.</> : 'You’re in — looking for a partner.'}
        </p>
      )}
      {mine && !me.partner && !me.stuck && (
        <div className="mt-4">
          <PartnerSearch code={code} label="Add your partner" picked={picked} onPick={setPicked} />
          {picked && (
            <Button className="mt-3" disabled={!!busy} onClick={() => void act('partner', { partnerRowId: picked.id }, 'partner')}>
              {busy === 'partner' ? 'Adding…' : `Add ${picked.name}`}
            </Button>
          )}
          <p className="t-cap text-ink/65 mt-2">Or wait — another member may join you.</p>
        </div>
      )}
      {mine && me.stuck && <p className="t-cap text-ink/65 mt-1">{me.stuck}</p>}
      {mine && !me.stuck && (
        <div className="flex flex-wrap gap-3 mt-4">
          <Button variant="secondary" disabled={!!busy} onClick={() => void act('withdraw', {}, 'withdraw')}>{busy === 'withdraw' ? 'Taking you out…' : 'Withdraw'}</Button>
          {me.partner && me.partnerRowId && (
            <Button variant="secondary" disabled={!!busy} onClick={() => void act('withdraw', { memberId: me.partnerRowId }, 'out')}>
              {busy === 'out' ? 'Taking them out…' : `Take ${me.partner.split(' ')[0]} out`}
            </Button>
          )}
        </div>
      )}

      {!mine && me.myRefusal && <p className="t-cap text-ink/80 mt-3">{me.myRefusal}</p>}
      {!mine && !me.myRefusal && me.closed && <p className="t-cap text-ink/80 mt-3">{me.closed}</p>}
      {canEnter && (
        <div className="mt-4">
          <PartnerSearch code={code} label="Your partner" picked={picked} onPick={setPicked} />
          <div className="flex flex-col gap-3 mt-3">
            {picked && (
              <Button disabled={!!busy} onClick={() => void act('enter', { partnerRowId: picked.id }, 'with')}>
                {busy === 'with' ? 'Entering…' : `Enter with ${picked.name}`}
              </Button>
            )}
            <Button variant={picked ? 'secondary' : 'primary'} disabled={!!busy} onClick={() => void act('enter', {}, 'alone')}>
              {busy === 'alone' ? 'Entering…' : 'Enter on my own — find me a partner'}
            </Button>
          </div>
        </div>
      )}
      {err}

      {shown && pairs.length > 0 && (
        <div className="mt-5">
          <p className="t-label text-ink">Entered{me.cap ? ` · ${pairs.length} of ${me.cap} pairs` : ` · ${pairs.length} ${pairs.length === 1 ? 'pair' : 'pairs'}`}</p>
          <ul className="mt-2 space-y-2">
            {pairs.map(p => {
              const lone = p.members.length < 2
              const mineHere = p.members.some(x => x.rowId === me.myRowId)
              return (
                // A pair is one ticket, two seats across a seam; a seat still to fill is dashed (the tee sheet's look).
                <li key={p.teamId} className="grid grid-cols-2">
                  {p.members.map((x, i) => (
                    <span key={x.rowId ?? x.name}
                      className={`px-3 py-2.5 text-[15px] truncate border border-line ${x.rowId === me.myRowId ? 'bg-club-tint font-semibold' : 'bg-surface'} text-ink ${
                        lone ? 'rounded-tile' : i === 0 ? 'rounded-l-tile border-r-0' : 'rounded-r-tile border-l-line-strong'}`}>
                      <span className="t-data">{x.name}</span>
                    </span>
                  ))}
                  {lone && (
                    me.mayJoin && !mineHere ? (
                      <button type="button" disabled={!!busy} onClick={() => void act('join', { teamId: p.teamId }, `join:${p.teamId}`)}
                        className="ml-1.5 rounded-tile border border-dashed border-line-strong px-3 py-2.5 text-[15px] text-club-deep font-semibold text-left press">
                        {busy === `join:${p.teamId}` ? 'Joining…' : '+ Join'}
                      </button>
                    ) : (
                      <span className="ml-1.5 rounded-tile border border-dashed border-line px-3 py-2.5 t-cap text-ink/65">Looking for a partner</span>
                    )
                  )}
                </li>
              )
            })}
          </ul>
          {loneNote && pairs.some(p => p.members.length < 2) && <p className="t-cap text-ink/65 mt-2">{loneNote}</p>}
        </div>
      )}
    </>
  )
}

/** Somebody from the club's list as a partner — names only, each with why they can't be picked, if not. */
function PartnerSearch({ code, label, picked, onPick }: {
  code: string
  label: string
  picked: { id: string; name: string } | null
  onPick: (p: { id: string; name: string } | null) => void
}) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ id: string; name: string; why?: string }[]>([])
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setFound([]); return }
    let live = true
    setLooking(true)
    const t = setTimeout(() => {
      askMatchPlay('names', { code, q: term }).then(r => {
        if (!live) return
        setLooking(false)
        setFound(r.ok ? r.names ?? [] : [])
      })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q, code])

  if (picked) {
    return (
      <div className={`${cardClass('flat')} flex items-center gap-3 px-3 py-2.5`}>
        <span className="flex-1 min-w-0">
          <span className="block t-cap text-ink/65">{label}</span>
          <span className="block t-data text-[15px] text-ink truncate">{picked.name}</span>
        </span>
        <button type="button" onClick={() => onPick(null)} className="t-label text-club-deep press">Change</button>
      </div>
    )
  }
  return (
    <div>
      <label htmlFor={`partner-${code}`} className={FIELD_LABEL}>{label}</label>
      <input id={`partner-${code}`} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Start typing a name" className={FIELD} autoComplete="off" />
      {q.trim().length >= 2 && (
        <ul className={`${cardClass('flat')} mt-2 divide-y divide-line`}>
          {found.length === 0 && <li className="px-3 py-2.5 t-cap text-ink/65">{looking ? 'Looking…' : 'Nobody on the list by that name.'}</li>}
          {found.map(f => (
            <li key={f.id}>
              <button type="button" disabled={!!f.why} onClick={() => onPick({ id: f.id, name: f.name })}
                className="w-full text-left px-3 py-2.5 disabled:cursor-not-allowed press">
                <span className={`block t-data text-[15px] ${f.why ? 'text-ink/50' : 'text-ink'}`}>{f.name}</span>
                {f.why && <span className="block t-cap text-ink/65">{f.why}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
