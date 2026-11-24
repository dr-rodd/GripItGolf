'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { askFeed } from '@/lib/feedClient'
import { AUDIENCES, SEARCH_MIN, type Audience, type Standing } from '@/lib/feed'
import { FIELD, ListGroup, buttonClass, cardClass, optionClass } from '../ui'

type Person = { id: string; name: string; club: string | null }
type Hit = { rowId: string; name: string; club: string; standing: Standing }

/**
 * The feed's settings on Me and Your page (D296, D297): who sees your cards
 * in the feed, your friends and their requests, and Find friends — a search
 * of your own clubs' lists, two characters at least, name and club only.
 * Nothing is drawn before migration 102, or for a junior (D304).
 */
export default function FeedSettings({ className = '' }: { className?: string }) {
  const [audience, setAudience] = useState<Audience | null>(null)
  const [people, setPeople] = useState<{ friends: Person[]; incoming: Person[]; outgoing: Person[] } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadFriends = useCallback(async () => {
    const r = await askFeed<{ friends: Person[]; incoming: Person[]; outgoing: Person[] }>('friends')
    if (r.ok) setPeople({ friends: r.friends, incoming: r.incoming, outgoing: r.outgoing })
  }, [])

  useEffect(() => {
    let live = true
    askFeed<{ ready: boolean; junior?: boolean; audience?: Audience }>('home').then(r => {
      if (!live || !r.ok || !r.ready || r.junior) return
      setAudience(r.audience ?? 'wide')
      void loadFriends()
    })
    return () => { live = false }
  }, [loadFriends])

  if (!audience) return null

  async function choose(a: Audience) {
    if (a === audience) return
    const was = audience
    setAudience(a); setBusy(true); setError('')
    const r = await askFeed('audience', { audience: a })
    setBusy(false)
    if (!r.ok) { setAudience(was); setError(r.error) }
  }

  async function act(action: 'respond' | 'unfriend', id: string, accept?: boolean) {
    setBusy(true); setError('')
    const r = await askFeed(action, { id, accept })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    await loadFriends()
  }

  return (
    <div className={className}>
      <div className={`${cardClass()} px-4 py-4`}>
        <p className="t-label text-ink">Who sees your cards in the feed</p>
        <p className="t-cap text-ink/65">The feed only — leaderboards, scorecards and tee sheets are unchanged.</p>
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="Who sees your cards in the feed">
          {AUDIENCES.map(a => (
            <button key={a.key} type="button" role="radio" aria-checked={audience === a.key} disabled={busy}
              onClick={() => void choose(a.key)} className={optionClass(audience === a.key, 'card')}>
              <span className="block t-label text-ink">{a.label}</span>
              <span className="block t-cap text-ink/65 mt-0.5">{a.line}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`${cardClass()} px-4 py-4 mt-4`}>
        <p className="t-label text-ink">Friends</p>
        <p className="t-cap text-ink/65">Their cards land in your Friends stream, and yours in theirs.</p>
        {people && people.incoming.length > 0 && (
          <>
            <h3 className="t-cap text-ink/65 mt-3">Asked to be your friend</h3>
            <ul className="mt-1 divide-y divide-line">
              {people.incoming.map(p => (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <PersonLine p={p} />
                  <button type="button" disabled={busy} onClick={() => void act('respond', p.id, true)}
                    className={buttonClass('quiet', false, true)}>Accept</button>
                  <button type="button" disabled={busy} onClick={() => void act('respond', p.id, false)}
                    className="t-label text-ink/65 min-h-11 px-2 press ch-focus">Decline</button>
                </li>
              ))}
            </ul>
          </>
        )}
        {people && people.friends.length === 0 && people.incoming.length === 0 && (
          <p className="text-ink/80 text-[15px] mt-3">No friends yet — find them below.</p>
        )}
        {people && people.friends.length > 0 && (
          <ul className="mt-2 divide-y divide-line">
            {people.friends.map(p => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <PersonLine p={p} />
                <button type="button" disabled={busy} onClick={() => void act('unfriend', p.id)}
                  className="t-cap text-ink/65 min-h-11 px-2 press ch-focus">Remove</button>
              </li>
            ))}
          </ul>
        )}
        {people && people.outgoing.length > 0 && (
          <>
            <h3 className="t-cap text-ink/65 mt-3">Waiting for them to accept</h3>
            <ul className="mt-1 divide-y divide-line">
              {people.outgoing.map(p => (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <PersonLine p={p} />
                  <button type="button" disabled={busy} onClick={() => void act('unfriend', p.id)}
                    className="t-cap text-ink/65 min-h-11 px-2 press ch-focus">Cancel</button>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
      </div>

      <FindFriends className="mt-4" onChanged={loadFriends} />
    </div>
  )
}

function PersonLine({ p }: { p: { name: string; club: string | null } }) {
  return (
    <span className="flex-1 min-w-0">
      <span className="block text-[15px] font-medium text-ink truncate">{p.name}</span>
      {p.club && <span className="block t-cap text-ink/65 truncate">{p.club}</span>}
    </span>
  )
}

/** Find friends (D297): your own clubs' lists, two characters at least, never browsable. */
function FindFriends({ className = '', onChanged }: { className?: string; onChanged: () => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const asked = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if ([...term].length < SEARCH_MIN) { setHits(null); setError(''); return }
    const n = ++asked.current
    const t = window.setTimeout(async () => {
      const r = await askFeed<{ results: Hit[] }>('search', { q: term })
      if (n !== asked.current) return
      if (!r.ok) { setError(r.error); setHits(null); return }
      setError(''); setHits(r.results)
    }, 300)
    return () => window.clearTimeout(t)
  }, [q])

  async function add(h: Hit) {
    setBusy(h.rowId); setError('')
    const r = await askFeed<{ standing: Standing }>('request', { rowId: h.rowId })
    setBusy(null)
    if (!r.ok) { setError(r.error); return }
    setHits(list => (list ?? []).map(x => (x.rowId === h.rowId ? { ...x, standing: r.standing } : x)))
    onChanged()
  }

  return (
    <div className={`${cardClass()} px-4 py-4 ${className}`}>
      <label htmlFor="find-friends" className="t-label text-ink block">Find friends</label>
      <p className="t-cap text-ink/65">Search your clubs’ members by name.</p>
      <input id="find-friends" type="search" value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
        placeholder="A name — two letters at least" className={`${FIELD} mt-3`} enterKeyHint="search" />
      {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
      {hits && hits.length === 0 && <p className="text-ink/80 text-[15px] mt-3">Nobody by that name on your clubs’ lists.</p>}
      {hits && hits.length > 0 && (
        <ListGroup className="mt-3" as="ul">
          {hits.map(h => (
            <li key={h.rowId} className="flex items-center gap-2 px-4 py-2 min-h-14">
              <PersonLine p={h} />
              {h.standing === 'friend' ? <span className="t-cap text-ink/65">Friends</span>
                : h.standing === 'asked' ? <span className="t-cap text-ink/65">Asked</span>
                : (
                  <button type="button" disabled={busy === h.rowId} onClick={() => void add(h)} className={buttonClass('secondary', false, true)}>
                    {h.standing === 'asks_you' ? 'Accept' : 'Add'}
                  </button>
                )}
            </li>
          ))}
        </ListGroup>
      )}
    </div>
  )
}
