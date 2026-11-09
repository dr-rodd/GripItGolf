'use client'

/**
 * A Matches session's matches, laid out as its tee sheet or its order of
 * play (Ross, 9 Nov 2026, D40–D41; lib/sessions.ts the rules,
 * lib/sessionMatchStore.ts the one writer).
 *
 * **Each row is one match**: the time in the gutter (or "Match 1" without
 * tee times), the left tag's side on the left, "vs", the right tag's on the
 * right. With exactly two tags a header names them in their colours and
 * stays put while the matches scroll. A pair's seats are stacked on its own
 * side as one block — the tee sheet's ticket turned upright. A seat on the
 * left takes only the left tag's players and the right only the right's
 * (`matchSidesIssue`, the tag gate per side); nobody plays twice in a
 * session. A refused write says so in the row it was refused in.
 *
 * The organiser (the PIN this phone holds, or an event without one) sets
 * anybody; a player, where the field books its own tee times, puts
 * themselves on their own side and takes only themselves off. A match with a
 * score keeps its players; with a result, it shows it in the side colours.
 *
 * On a tee sheet the time being set is **frozen on every other phone** for
 * the two minutes, counted down for the booker — the tee sheet's own lock
 * (lib/teeFreeze.ts, `useTeeFreeze`). The write itself is still a
 * compare-and-set, so presence is never trusted as a lock.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import {
  type MatchFormat, type SessionMatchResult, matchLine, matchSidesIssue, sideSize, nextSlot,
} from '@/lib/sessions'
import { setMatchSide, removeMatch } from '@/lib/sessionMatchStore'
import { sideColours } from '@/lib/matchSides'
import { formatHandicap } from '@/lib/handicap'
import { boardNames } from '@/lib/displayNames'
import InlineUnlock from '@/app/components/InlineUnlock'
import { buttonClass, cardClass, FIELD, LiveDot } from '@/app/components/ui'
import { useTripBase } from '../TripBase'
import { useTeeFreeze } from '../teesheet/useTeeFreeze'
import { frozenSlots, lockClock } from '@/lib/teeFreeze'

type Player = { id: string; name: string; handicap: number | null }
type Tag = { id: string; name: string; color: string }

export default function MatchesSheet({
  tripId, tripCode, roundId, title, format, matches: saved, clocks, players, tags, tagOfPlayer,
  myId, passcodeHash, playersPick, opensLabel = null, isTrip = false,
}: {
  /** A trip's: its passcode and lead player, never a PIN and organiser. */
  isTrip?: boolean
  /** A tee sheet not open to the field yet: when it opens. The organiser sees it and may set matches early. */
  opensLabel?: string | null
  tripId: string
  tripCode: string
  roundId: string
  /** "Friday fourball" — the session's name. */
  title: string
  format: MatchFormat
  matches: SessionMatchResult[]
  /** A tee time per row on a tee sheet; absent is the order of play. */
  clocks?: string[]
  players: Player[]
  /** The event's tags, in order; exactly two gives the header and a tag a side. */
  tags: Tag[]
  /** Player id → their tag id. */
  tagOfPlayer: Record<string, string>
  myId: string | null
  passcodeHash: string | null
  /** Whether a player may put themselves on a side (`edit_tee_sheet`). */
  playersPick: boolean
}) {
  const router = useRouter()
  const tripHome = useTripBase(tripCode)
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }, [tripCode])
  const organiser = unlocked || !isLocked(passcodeHash)
  const size = sideSize(format)
  const twoTags = tags.length === 2 ? tags : null
  const tagged = tags.length > 0
  const tagOf = (pid: string) => tagOfPlayer[pid] ?? null

  // A pick shows in its seat the moment it is made (Ross, 9 Nov 2026: the
  // player was not put in until the next time had been picked — the sheet
  // waited for the save and a full refresh). Held here until the refreshed
  // sheet says the same, and taken back if the save is refused.
  const [pending, setPending] = useState<Record<number, { sideA: string[]; sideB: string[] }>>({})
  useEffect(() => {
    setPending(prev => {
      const keep = Object.entries(prev).filter(([slot, p]) => {
        const m = saved.find(x => x.slot === Number(slot))
        const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, k) => id === b[k])
        return !(m ? same(m.sideA, p.sideA) && same(m.sideB, p.sideB) : p.sideA.length + p.sideB.length === 0)
      })
      return keep.length === Object.keys(prev).length ? prev : Object.fromEntries(keep)
    })
  }, [saved])
  const matches = useMemo(() => {
    const out = saved.map(m => (pending[m.slot] ? { ...m, ...pending[m.slot] } : m))
    for (const [slot, p] of Object.entries(pending)) {
      if (!saved.some(m => m.slot === Number(slot))) {
        out.push({ id: `pending-${slot}`, roundId, slot: Number(slot), sideA: p.sideA, sideB: p.sideB, result: null })
      }
    }
    return out.filter(m => m.sideA.length + m.sideB.length > 0 || saved.some(x => x.slot === m.slot && (x.result || x.live)))
  }, [saved, pending, roundId])

  // Rows: the tee sheet's times, else every match set and one more.
  const [extraRows, setExtraRows] = useState(0)
  const rowCount = clocks?.length ?? Math.max(nextSlot(matches) + extraRows, matches.length ? Math.max(...matches.map(m => m.slot)) + 1 : 1)
  const bySlot = useMemo(() => new Map(matches.map(m => [m.slot, m])), [matches])
  const [picking, setPicking] = useState<{ slot: number; side: 'a' | 'b' } | null>(null)
  const [query, setQuery] = useState('')
  const [rowError, setRowError] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)

  // The tee sheet's freeze: the time this phone is setting is locked on every
  // other phone; another's lifting means the sheet reads itself again.
  const freeze = useTeeFreeze(
    tripId, !!clocks,
    () => router.refresh(),
    slot => { setPicking(null); setRowError(e => ({ ...e, [slot]: 'Locked by another user' })) },
  )
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!freeze.held) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [freeze.held])
  const frozen = clocks ? frozenSlots(freeze.freezes, roundId, freeze.key, now) : new Set<number>()
  // Two minutes up: the booking closes and the time unlocks — never mid-save.
  const msLeft = freeze.held ? freeze.held.until - now : null
  useEffect(() => {
    if (msLeft !== null && msLeft <= 0 && !busy) { setPicking(null); freeze.release() }
  }, [msLeft, busy, freeze])
  const open = (slot: number, side: 'a' | 'b') => {
    setPicking({ slot, side }); setQuery('')
    if (clocks) freeze.hold(roundId, slot, true)
  }
  const close = () => { setPicking(null); setQuery(''); freeze.release() }

  const nameOf = (pid: string) => players.find(p => p.id === pid)?.name ?? 'A player'
  // What a seat prints: the board's short name — first name, the surname
  // only where two clash (lib/displayNames.ts).
  const shortOf = useMemo(() => boardNames(players.map(p => ({ id: p.id, name: p.name, nickname: null }))), [players])
  const hcpOf = (pid: string) => {
    const h = players.find(p => p.id === pid)?.handicap
    return h == null ? 'HCP pending' : `HCP ${formatHandicap(h)}`
  }
  const sideTag = (side: 'a' | 'b'): Tag | null => (twoTags ? (side === 'a' ? twoTags[0] : twoTags[1]) : null)

  /** Whether this phone may put somebody on this side of this match. */
  const mayAdd = (m: SessionMatchResult | undefined, side: 'a' | 'b') => {
    if (m && frozen.has(m.slot)) return false
    if (m?.result || m?.live) return organiser
    if (organiser) return true
    if (!playersPick || !myId) return false
    // A player puts themselves in, once, on their own tag's side.
    if (matches.some(x => x.sideA.includes(myId) || x.sideB.includes(myId))) return false
    const t = sideTag(side)
    return !t || tagOf(myId) === t.id
  }
  const mayRemove = (m: SessionMatchResult, pid: string) =>
    !frozen.has(m.slot) && (organiser || (!m.result && !m.live && playersPick && pid === myId))

  async function write(slot: number, side: 'a' | 'b', next: string[]) {
    setBusy(true)
    setRowError(e => ({ ...e, [slot]: '' }))
    // In the seat at once; the picker shuts with it.
    const m = bySlot.get(slot)
    setPending(prev => ({ ...prev, [slot]: {
      sideA: side === 'a' ? next : m?.sideA ?? [],
      sideB: side === 'b' ? next : m?.sideB ?? [],
    } }))
    setPicking(null)
    setQuery('')
    if (clocks && !freeze.held) freeze.hold(roundId, slot)
    const res = await setMatchSide(supabase, { tripId, roundId, slot, side, next, organiser, teeSheet: !!clocks })
    setBusy(false)
    if (!res.ok) {
      // Refused: the seat goes back to what the sheet holds, and says why there.
      setPending(prev => { const { [slot]: _gone, ...rest } = prev; void _gone; return rest })
      setRowError(e => ({ ...e, [slot]: res.reason }))
    }
    close()
    router.refresh()
  }

  function choose(slot: number, side: 'a' | 'b', pid: string) {
    const m = bySlot.get(slot)
    const sideA = side === 'a' ? [...(m?.sideA ?? []), pid] : m?.sideA ?? []
    const sideB = side === 'b' ? [...(m?.sideB ?? []), pid] : m?.sideB ?? []
    const others = matches.filter(x => x.slot !== slot)
    const issue = matchSidesIssue(format, sideA, sideB, others, tagged ? tagOf : null)
    if (issue) { setRowError(e => ({ ...e, [slot]: issue })); return }
    void write(slot, side, side === 'a' ? sideA : sideB)
  }

  /** Who the picker offers: nobody already playing this session, on the side's tag. */
  const offered = (side: 'a' | 'b') => {
    const playing = new Set(matches.flatMap(m => [...m.sideA, ...m.sideB]))
    const t = sideTag(side)
    return players
      .filter(p => !playing.has(p.id))
      .filter(p => !t || tagOf(p.id) === t.id)
      .filter(p => organiser || p.id === myId)
      .filter(p => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()))
  }

  const seatColumn = (slot: number, side: 'a' | 'b') => {
    const m = bySlot.get(slot)
    const ids = side === 'a' ? m?.sideA ?? [] : m?.sideB ?? []
    const t = sideTag(side)
    const edge = t ? t.color : 'var(--color-line-strong)'
    const seats = Array.from({ length: size }, (_, i) => ids[i] ?? null)
    return (
      // A pair's seats are one block, stacked: the ticket turned upright.
      <div className={`rounded-tile border overflow-hidden ${ids.length ? 'bg-surface' : ''}`}
        style={{ borderColor: ids.length ? edge : 'var(--color-line-strong)', borderStyle: ids.length ? 'solid' : 'dashed' }}>
        {seats.map((pid, i) => (
          <div key={i} className={`min-h-14 px-2.5 py-1.5 flex items-center gap-2 ${i > 0 ? 'border-t border-line' : ''} ${pid && pid === myId ? 'bg-accent-tint' : ''}`}>
            {pid ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif font-semibold text-[15px] leading-tight text-ink truncate">{shortOf.get(pid) ?? nameOf(pid)}</span>
                  <span className="block t-cap text-ink/65">{hcpOf(pid)}</span>
                </span>
                {m && mayRemove(m, pid) && (
                  <button type="button" disabled={busy} aria-label={`Take ${nameOf(pid)} off`}
                    className="-m-1 p-1 text-ink/65 t-label"
                    onClick={() => void write(slot, side, ids.filter(x => x !== pid))}>✕</button>
                )}
              </>
            ) : mayAdd(m, side) ? (
              <button type="button" disabled={busy} className="w-full h-full t-label text-accent-deep text-left"
                onClick={() => open(slot, side)}>
                + {organiser ? 'Add' : 'Join'}
              </button>
            ) : (
              <span className="t-cap text-ink/65">Open</span>
            )}
          </div>
        ))}
      </div>
    )
  }

  const lineOf = (m: SessionMatchResult) => {
    const names = {
      a: sideTag('a')?.name ?? m.sideA.map(id => nameOf(id).split(' ')[0]).join(' & '),
      b: sideTag('b')?.name ?? m.sideB.map(id => nameOf(id).split(' ')[0]).join(' & '),
    }
    return matchLine(m, names)
  }
  const colours = sideColours(twoTags?.[0].color, twoTags?.[1].color)

  return (
    <section className="mb-8">
      <h2 className="t-h2 text-ink mb-1">{title}</h2>
      <p className="t-cap text-ink/65 mb-3">
        {clocks ? 'Each tee time is one match.' : 'The order of play — each row is one match.'}
        {size > 1 ? ' Two players a side.' : ' One player a side.'}
      </p>

      {opensLabel && !organiser && (
        <p className={`p-4 text-ink/65 text-sm ${cardClass('flat')}`}>Opens {opensLabel}.</p>
      )}

      {!organiser && passcodeHash && (
        <div className="mb-3">
          <InlineUnlock tripCode={tripCode} passcodeHash={passcodeHash} onUnlocked={() => setUnlocked(true)}
            {...(isTrip ? { prompt: 'Lead player? Enter the passcode to edit.' } : {})} />
        </div>
      )}

      {!(opensLabel && !organiser) && <>
      {/* The two tags, one each side, staying put while the matches scroll. */}
      {twoTags && (
        <div className="sticky top-[52px] z-10 paper border-b border-line -mx-4 px-4 py-2 mb-2 grid grid-cols-[3.5rem_1fr_2rem_1fr] items-center gap-2">
          <span aria-hidden="true" />
          <p className="t-card truncate" style={{ color: twoTags[0].color }}>{twoTags[0].name}</p>
          <span aria-hidden="true" />
          <p className="t-card truncate text-right" style={{ color: twoTags[1].color }}>{twoTags[1].name}</p>
        </div>
      )}

      <ol className="divide-y divide-line">
        {Array.from({ length: rowCount }, (_, slot) => {
          const m = bySlot.get(slot)
          const winner = m?.result === 'a' ? colours.A : m?.result === 'b' ? colours.B : null
          return (
            <li key={slot} className={`py-3 ${frozen.has(slot) ? 'opacity-60' : ''}`}>
              <div className="grid grid-cols-[3.5rem_1fr_2rem_1fr] items-center gap-2">
                <p className="t-data text-ink/80 tabular-nums self-start pt-3">
                  {clocks ? clocks[slot] : `Match ${slot + 1}`}
                </p>
                {seatColumn(slot, 'a')}
                <p className="t-label text-ink/65 text-center">vs</p>
                {seatColumn(slot, 'b')}
              </div>

              {frozen.has(slot) && <p className="t-cap text-ink/65 mt-2 pl-[4rem]">Locked by another user</p>}

              {picking?.slot === slot && (
                <div className={`mt-2 p-3 ${cardClass('flat')}`}>
                  {msLeft !== null && clocks && (
                    <p className="t-cap text-ink/65 mb-2 tabular-nums">Time to complete booking · {lockClock(msLeft)}</p>
                  )}
                  <input type="search" className={FIELD} placeholder="Search players" value={query}
                    onChange={e => setQuery(e.target.value)} aria-label="Search players" />
                  <ul className="mt-2 max-h-60 overflow-y-auto">
                    {offered(picking.side).map(p => (
                      <li key={p.id}>
                        <button type="button" disabled={busy} className="w-full text-left py-2 t-label text-ink"
                          onClick={() => choose(slot, picking.side, p.id)}>
                          {p.name} <span className="t-cap text-ink/65">{hcpOf(p.id)}</span>
                        </button>
                      </li>
                    ))}
                    {offered(picking.side).length === 0 && (
                      <li className="t-cap text-ink/65 py-2">
                        {sideTag(picking.side) ? `Nobody from ${sideTag(picking.side)!.name} is free.` : 'Nobody is free.'}
                      </li>
                    )}
                  </ul>
                  <button type="button" className={`${buttonClass('quiet', false, true)} mt-1`} onClick={close}>Cancel</button>
                </div>
              )}

              {rowError[slot] && <p className="t-cap text-rust-deep mt-2">{rowError[slot]}</p>}

              {m && m.sideA.length === size && m.sideB.length === size && (
                <div className="mt-2 flex items-center justify-between gap-2 pl-[4rem]">
                  <p className="t-label flex items-center gap-1.5">
                    {m.live && !m.result && <LiveDot />}
                    {winner
                      ? <span className="px-2 py-0.5 rounded-full" style={{ background: winner.fill, color: winner.on }}>{lineOf(m)}</span>
                      : <span className={m.live ? 'text-accent-deep' : 'text-ink/65'}>{lineOf(m)}</span>}
                  </p>
                  <Link href={`${tripHome}/session/${roundId}/match/${slot}/card`} className="t-label text-accent-deep">
                    {m.result ? 'Card' : m.live ? 'Score' : 'Start'} →
                  </Link>
                </div>
              )}
              {m && organiser && !m.result && !m.live && m.sideA.length + m.sideB.length > 0 && (
                <div className="pl-[4rem] mt-1">
                  <button type="button" className="t-cap text-ink/65 underline" disabled={busy}
                    onClick={async () => {
                      const res = await removeMatch(supabase, { tripId, roundId, slot, organiser, teeSheet: !!clocks })
                      if (!res.ok) setRowError(e => ({ ...e, [slot]: res.reason }))
                      router.refresh()
                    }}>
                    Clear this match
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {!clocks && organiser && (
        <button type="button" className={`${buttonClass('secondary')} mt-3`} onClick={() => setExtraRows(n => n + 1)}>
          + Add a match
        </button>
      )}
      </>}
    </section>
  )
}
