'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  EmptyState, FIELD, FIELD_LABEL, ListGroup, PageTitle, Pill, SectionHeader, Segmented, buttonClass, cardClass,
} from '@/app/components/ui'
import { describeShortDate } from '@/lib/itinerary'
import { tripBase } from '@/lib/tripPaths'
import { formatLine, points, type Side, type TieFormat, type TieOutcome, type TieScore } from '@/lib/interclubTie'
import { askInterclub } from '@/lib/interclubClient'

type Player = { id: string; name: string; index: number | null; side: Side }
type Match = { slot: number; a: string[]; b: string[]; result: 'a' | 'b' | 'halved' | null; margin: string | null }
type TieView = {
  code: string
  competition: { name: string; province: string; slug: string }
  names: { a: string; b: string }
  date: string | null
  format: TieFormat
  roundId: string
  playoffRoundId: string | null
  taken: { a: boolean; b: boolean }
  may: { a: boolean; b: boolean; run: boolean }
  players: Player[]
  matches: Match[]
  playoff: { a: string[]; b: string[]; result: Match['result']; margin: string | null } | null
  score: TieScore
  outcome: TieOutcome
  settled: { winner: Side; note: string | null; byName: string } | null
}

const SIDES: Side[] = ['a', 'b']

/** "+1.5" for a plus index, "12.4" otherwise, "—" for none. */
const indexText = (n: number | null) => (n === null ? '—' : n < 0 ? `+${Math.abs(n)}` : String(n))

/**
 * The tie's page (docs/interclub.md, D353–D362): each club's players and
 * their interclub index, who plays whom, a match or the tie settled by hand,
 * and the playoff when it is level. Everything through /api/interclub; the
 * matches are scored on the event's own pages, by anybody with its link.
 */
export default function TieClient({ code }: { code: string }) {
  const [tie, setTie] = useState<TieView | null>(null)
  const [error, setError] = useState('')
  const [signedOut, setSignedOut] = useState(false)
  const [busy, setBusy] = useState(false)

  const act = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true); setError('')
    const r = await askInterclub({ ...body, code })
    setBusy(false)
    if (!r.ok) { setError(r.error); if (r.signedOut) setSignedOut(true); return false }
    if (r.tie) setTie(r.tie as TieView)
    return true
  }, [code])

  useEffect(() => { void act({ action: 'tie' }) }, [act])

  if (!tie) {
    return signedOut
      ? <EmptyState message="Sign in to your Green Dot account to run this match." actionLabel="Sign in" actionHref={`/account?next=/interclub/tie/${code}`} />
      : error ? <EmptyState message={error} /> : <p className="t-body text-ink/65 text-center py-12">Opening the match…</p>
  }

  const name = (s: Side) => tie.names[s]
  const playerOf = new Map(tie.players.map(p => [p.id, p]))
  const eventHome = tripBase(tie.code, 'tournament')
  const cardHref = (roundId: string, slot: number) => `${eventHome}/session/${roundId}/match/${slot}/card`

  return (
    <div className="space-y-8">
      <PageTitle
        back={{ href: `/interclub/${tie.competition.province}/${tie.competition.slug}`, label: tie.competition.name }}
        sub={[tie.date ? describeShortDate(tie.date) : null, formatLine(tie.format)].filter(Boolean).join(' · ')}
      >
        {tie.names.a} v {tie.names.b}
      </PageTitle>

      <section className={`${cardClass()} p-5`}>
        <p className="font-serif font-bold text-ink text-[22px] leading-snug">{tie.outcome.line}</p>
        {tie.settled?.note && <p className="t-cap text-ink/65 mt-1">{tie.settled.note} — {tie.settled.byName}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/${tie.code}`} className={buttonClass('primary', false)}>Open the match</a>
          <ShareLink code={tie.code} />
        </div>
        <p className="t-cap text-ink/65 mt-3">Anybody with the link can score — {`greendot.live/${tie.code}`}</p>
      </section>

      {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}

      {SIDES.map(s => (
        <SidePlayers key={s} side={s} tie={tie} busy={busy} act={act} />
      ))}

      <section>
        <SectionHeader hint={tie.may.a || tie.may.b ? 'Pick who plays whom from each side’s players.' : 'Who plays whom.'}>Matches</SectionHeader>
        <div className="space-y-3 mt-3">
          {tie.matches.map(m => (
            <MatchCard
              key={m.slot} m={m} tie={tie} busy={busy} act={act} playerOf={playerOf}
              scoreHref={cardHref(tie.roundId, m.slot)}
            />
          ))}
        </div>
      </section>

      {tie.may.run && (
        <Playoff tie={tie} busy={busy} act={act} playerOf={playerOf}
          scoreHref={tie.playoffRoundId ? cardHref(tie.playoffRoundId, 0) : null} />
      )}

      {tie.may.run && <SettleTie tie={tie} busy={busy} act={act} name={name} />}
    </div>
  )
}

function ShareLink({ code }: { code: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={buttonClass('secondary', false)}
      onClick={() => {
        const url = `${window.location.origin}/${code}`
        void (navigator.share ? navigator.share({ url }).catch(() => undefined) : navigator.clipboard?.writeText(url).then(() => setDone(true)))
      }}
    >
      {done ? 'Link copied' : 'Share the link'}
    </button>
  )
}

type Act = (body: Record<string, unknown>) => Promise<boolean>

/** One club's players: added typed or picked from the club's list, each with their interclub index (D355). */
function SidePlayers({ side, tie, busy, act }: { side: Side; tie: TieView; busy: boolean; act: Act }) {
  const players = tie.players.filter(p => p.side === side)
  const may = tie.may[side]
  const [name, setName] = useState('')
  const [index, setIndex] = useState('')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [found, setFound] = useState<{ id: string; name: string; index: number | null }[]>([])

  useEffect(() => {
    if (!may || !tie.taken[side] || name.trim().length < 2 || memberId) { setFound([]); return }
    let live = true
    const t = setTimeout(() => {
      void askInterclub({ action: 'members', code: tie.code, side, q: name.trim() }).then(r => {
        if (live && r.ok && Array.isArray(r.members)) setFound(r.members as typeof found)
      })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [name, may, side, tie.code, tie.taken, memberId])

  async function add() {
    if (await act({ action: 'player.add', side, name, index: index || null, memberId })) {
      setName(''); setIndex(''); setMemberId(null); setFound([])
    }
  }

  const hint = may ? (tie.taken[side] ? 'You fill this side.' : `${tie.names[side]} has no team captain on Green Dot yet — you can fill their side.`)
    : tie.taken[side] ? 'Their team captain fills this side.' : 'Not filled yet.'

  return (
    <section>
      <SectionHeader hint={hint}>{tie.names[side]}</SectionHeader>
      {players.length > 0 ? (
        <ListGroup className="mt-3">
          {players.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-4 min-h-14">
              <span className="flex-1 min-w-0 truncate t-label text-ink">{p.name}</span>
              {may ? (
                <div className="w-24 flex-shrink-0"><input
                  aria-label={`${p.name}’s index`}
                  className={`${FIELD} text-right`}
                  defaultValue={p.index === null ? '' : indexText(p.index)}
                  placeholder="Index"
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (p.index === null ? '' : indexText(p.index))) void act({ action: 'player.update', playerId: p.id, index: v || null }) }}
                /></div>
              ) : (
                <span className="font-serif t-data text-ink/80">{indexText(p.index)}</span>
              )}
              {may && (
                <button type="button" disabled={busy} aria-label={`Take ${p.name} off`} onClick={() => void act({ action: 'player.remove', playerId: p.id })} className={buttonClass('quiet', false, true)}>✕</button>
              )}
            </div>
          ))}
        </ListGroup>
      ) : (
        <p className="t-body text-ink/65 mt-3">No players yet.</p>
      )}
      {may && (
        <div className={`${cardClass('flat')} p-4 mt-3`}>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div className="relative">
              <label className={FIELD_LABEL} htmlFor={`add-${side}`}>Player</label>
              <input id={`add-${side}`} className={FIELD} value={name} maxLength={60} autoComplete="off"
                placeholder={tie.taken[side] ? 'Name, or search the club’s list' : 'Name'}
                onChange={e => { setName(e.target.value); setMemberId(null) }} />
              {found.length > 0 && (
                <ul className={`${cardClass('floating')} absolute left-0 right-0 mt-1 z-10 overflow-hidden divide-y divide-line`}>
                  {found.map(f => (
                    <li key={f.id}>
                      <button type="button" className="w-full text-left px-4 py-3 t-label text-ink hover:bg-tint"
                        onClick={() => { setName(f.name); setMemberId(f.id); setIndex(f.index === null ? '' : indexText(f.index)); setFound([]) }}>
                        {f.name} <span className="t-cap text-ink/65">{indexText(f.index)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor={`idx-${side}`}>Index</label>
              <input id={`idx-${side}`} className={FIELD} value={index} inputMode="decimal" placeholder="12.4" onChange={e => setIndex(e.target.value)} />
            </div>
          </div>
          <p className="t-cap text-ink/65 mt-2">Their inter-club eligibility index — change it any time.</p>
          <button type="button" disabled={busy || !name.trim()} onClick={() => void add()} className={`${buttonClass('secondary', false)} mt-3`}>Add player</button>
        </div>
      )}
    </section>
  )
}

/** One match: each side's player or pair, its result, the way to score it, and settling it by hand (D361). */
function MatchCard({ m, tie, busy, act, playerOf, scoreHref }: {
  m: Match; tie: TieView; busy: boolean; act: Act; playerOf: Map<string, Player>; scoreHref: string
}) {
  const need = tie.format.match === 'singles' ? 1 : 2
  const [settling, setSettling] = useState(false)
  const names = (ids: string[]) => ids.map(id => playerOf.get(id)?.name ?? 'A player').join(' & ')
  const result = m.result === 'halved' ? 'Halved' : m.result ? `${tie.names[m.result]} won${m.margin ? ` ${m.margin}` : ''}` : null
  const ready = m.a.length === need && m.b.length === need

  return (
    <div className={`${cardClass()} p-4`}>
      <div className="flex items-center gap-2">
        <p className="t-card text-ink flex-1">Match {m.slot + 1}</p>
        {result && <Pill tone={m.result === 'halved' ? 'neutral' : 'win'}>{result}</Pill>}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        {SIDES.map(s => (
          <div key={s}>
            <p className="t-cap text-ink/65 mb-1">{tie.names[s]}</p>
            {tie.may[s] && !m.result ? (
              <SidePicker side={s} m={m} tie={tie} need={need} busy={busy} act={act} />
            ) : (
              <p className="t-label text-ink">{(s === 'a' ? m.a : m.b).length ? names(s === 'a' ? m.a : m.b) : 'To be set'}</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ready && !m.result && <a href={scoreHref} className={buttonClass('secondary', false, true)}>Score it</a>}
        {tie.may.run && <button type="button" onClick={() => setSettling(v => !v)} className={buttonClass('quiet', false, true)}>{settling ? 'Close' : 'Settle'}</button>}
      </div>
      {settling && (
        <Settle
          sides={tie.names} allowHalf current={m.result} busy={busy}
          onSave={(winner, margin) => act({ action: 'match.settle', slot: m.slot, result: winner, margin }).then(ok => { if (ok) setSettling(false) })}
        />
      )}
    </div>
  )
}

/** A side of one match: one player for singles, a pair for fourball and foursomes — saved once whole. */
function SidePicker({ side, m, tie, need, busy, act }: { side: Side; m: Match; tie: TieView; need: number; busy: boolean; act: Act }) {
  const current = side === 'a' ? m.a : m.b
  const [draft, setDraft] = useState<string[]>(current)
  useEffect(() => { setDraft(current) }, [current])
  const usedElsewhere = new Set(tie.matches.filter(x => x.slot !== m.slot).flatMap(x => (side === 'a' ? x.a : x.b)))
  const choices = tie.players.filter(p => p.side === side && !usedElsewhere.has(p.id))
  const pick = (i: number, id: string) => {
    const next = [...draft]
    next[i] = id
    const clean = next.filter(Boolean)
    setDraft(next)
    if (clean.length === need || clean.length === 0) void act({ action: 'match.side', slot: m.slot, side, playerIds: clean })
  }
  return (
    <div className="space-y-2">
      {Array.from({ length: need }, (_, i) => (
        <select key={i} className={FIELD} value={draft[i] ?? ''} disabled={busy} aria-label={`${tie.names[side]}, player ${i + 1}`} onChange={e => pick(i, e.target.value)}>
          <option value="">Choose…</option>
          {choices.filter(p => !draft.includes(p.id) || draft[i] === p.id).map(p => (
            <option key={p.id} value={p.id}>{p.name} ({indexText(p.index)})</option>
          ))}
        </select>
      ))}
    </div>
  )
}

/** Who won, said by hand: a side, a half where it may be one, and how — "W/O", "3&2", "Conceded". */
function Settle({ sides, allowHalf, current, busy, onSave }: {
  sides: { a: string; b: string }; allowHalf: boolean; current: Match['result']; busy: boolean
  onSave: (winner: 'a' | 'b' | 'halved' | null, margin: string) => void
}) {
  const [winner, setWinner] = useState<'a' | 'b' | 'halved' | null>(current)
  const [margin, setMargin] = useState('')
  const options = [
    { value: 'a' as const, label: sides.a },
    ...(allowHalf ? [{ value: 'halved' as const, label: 'Halved' }] : []),
    { value: 'b' as const, label: sides.b },
  ]
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-3">
      <Segmented label="Who won" options={options} value={winner} onChange={setWinner} />
      <input className={FIELD} value={margin} maxLength={20} placeholder="How — W/O, 3&2, Conceded (optional)" onChange={e => setMargin(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" disabled={busy || !winner} onClick={() => onSave(winner, margin)} className={buttonClass('secondary', false, true)}>Save the result</button>
        {current && <button type="button" disabled={busy} onClick={() => onSave(null, '')} className={buttonClass('quiet', false, true)}>Take the result off</button>}
      </div>
    </div>
  )
}

/** D360: level after every match — a player or pair a side, from those who played, sudden death. */
function Playoff({ tie, busy, act, playerOf, scoreHref }: {
  tie: TieView; busy: boolean; act: Act; playerOf: Map<string, Player>; scoreHref: string | null
}) {
  const pairs = tie.format.match !== 'singles'
  const played = (s: Side) => tie.matches.map(m => (s === 'a' ? m.a : m.b)).filter(x => x.length > 0)
  const options = (s: Side) => pairs
    ? played(s).map(ids => ({ key: ids.join(','), ids, label: ids.map(id => playerOf.get(id)?.name ?? '').join(' & ') }))
    : played(s).flat().map(id => ({ key: id, ids: [id], label: playerOf.get(id)?.name ?? '' }))
  const [pick, setPick] = useState<{ a: string; b: string }>({ a: '', b: '' })
  const [settling, setSettling] = useState(false)
  const chosen = {
    a: options('a').find(o => o.key === pick.a)?.ids ?? [],
    b: options('b').find(o => o.key === pick.b)?.ids ?? [],
  }

  if (tie.playoff && scoreHref) {
    const p = tie.playoff
    const names = (ids: string[]) => ids.map(id => playerOf.get(id)?.name ?? 'A player').join(' & ')
    return (
      <section>
        <SectionHeader hint="Sudden death from the 1st — the first hole won takes the match.">Playoff</SectionHeader>
        <div className={`${cardClass()} p-4 mt-3`}>
          <p className="t-label text-ink">{names(p.a)} v {names(p.b)}</p>
          {p.result && p.result !== 'halved' && <Pill tone="win" className="mt-2">{tie.names[p.result]} won{p.margin ? ` ${p.margin}` : ''}</Pill>}
          <div className="mt-3 flex gap-2">
            {!p.result && <a href={scoreHref} className={buttonClass('secondary', false, true)}>Score it</a>}
            <button type="button" onClick={() => setSettling(v => !v)} className={buttonClass('quiet', false, true)}>{settling ? 'Close' : 'Settle'}</button>
          </div>
          {settling && (
            <Settle sides={tie.names} allowHalf={false} current={p.result} busy={busy}
              onSave={(winner, margin) => act({ action: 'match.settle', playoff: true, slot: 0, result: winner, margin }).then(ok => { if (ok) setSettling(false) })} />
          )}
        </div>
      </section>
    )
  }
  if (tie.outcome.state !== 'level') return null
  return (
    <section>
      <SectionHeader hint={pairs ? 'A pair a side, who played together in the match.' : 'A player a side, from those who played.'}>Playoff</SectionHeader>
      <div className={`${cardClass()} p-4 mt-3 space-y-3`}>
        {SIDES.map(s => (
          <div key={s}>
            <label className={FIELD_LABEL} htmlFor={`po-${s}`}>{tie.names[s]}</label>
            <select id={`po-${s}`} className={FIELD} value={pick[s]} onChange={e => setPick(v => ({ ...v, [s]: e.target.value }))}>
              <option value="">Choose…</option>
              {options(s).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        ))}
        <button type="button" disabled={busy || !chosen.a.length || !chosen.b.length}
          onClick={() => void act({ action: 'playoff', a: chosen.a, b: chosen.b })} className={buttonClass('primary', false)}>
          Start the playoff
        </button>
      </div>
    </section>
  )
}

/** D361: the tie settled by a captain — for anything the cards cannot say. */
function SettleTie({ tie, busy, act, name }: { tie: TieView; busy: boolean; act: Act; name: (s: Side) => string }) {
  const [winner, setWinner] = useState<Side | null>(tie.settled?.winner ?? null)
  const [note, setNote] = useState(tie.settled?.note ?? '')
  return (
    <section>
      <SectionHeader hint="For anything the cards can’t say — a concession, a ruling, an abandoned match.">Settle the match</SectionHeader>
      <div className={`${cardClass('flat')} p-4 mt-3 space-y-3`}>
        {tie.settled ? (
          <>
            <p className="t-body text-ink">Settled by {tie.settled.byName}: {name(tie.settled.winner)} go through.</p>
            <button type="button" disabled={busy} onClick={() => void act({ action: 'settle', winner: null })} className={buttonClass('quiet', false, true)}>Take it off</button>
          </>
        ) : (
          <>
            <Segmented label="Who goes through" options={SIDES.map(s => ({ value: s, label: name(s) }))} value={winner} onChange={setWinner} />
            <input className={FIELD} value={note} maxLength={200} placeholder="What happened (optional)" onChange={e => setNote(e.target.value)} />
            <button type="button" disabled={busy || !winner} onClick={() => void act({ action: 'settle', winner, note: note || null })} className={buttonClass('secondary', false)}>
              Settle it
            </button>
          </>
        )}
      </div>
      <p className="t-cap text-ink/65 mt-2">Score so far {points(tie.score.a)}–{points(tie.score.b)}{tie.format.holes ? ` · holes ${tie.score.holesA}–${tie.score.holesB}` : ''}.</p>
    </section>
  )
}
