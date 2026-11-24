'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { askFeed } from '@/lib/feedClient'
import { pillsFor, readStreamKey, shownComp, streamKey, type CompRef, type StreamRef } from '@/lib/feed'
import { reducedMotion } from '@/lib/motion'
import { IconPlus } from '../icons'
import { IconButton, LiveDot, buttonClass, cardClass } from '../ui'
import { FeedItem, type FeedView } from './FeedItem'
import StreamsSheet from './StreamsSheet'
import { CommentsSheet, ItemActions } from './ItemActions'

type StreamView = { key: string; kind: StreamRef['kind']; label: string; empty: string }
type Home = {
  ready: boolean; junior?: boolean
  streams?: StreamView[]; offered?: StreamView[]
  here?: string | null
  comps?: CompRef[]
  newComments?: number
  today?: string
}
type Panel = { items: FeedView[]; next: unknown; loading: boolean; error: string; players: { name: string; thru: number }[] | null }

const STREAM_KEY = 'gd.feed.stream.v1'
const COMP_KEY = 'gd.feed.comp.v1'

function remembered<T>(key: string): T | null {
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) as T : null } catch { return null }
}
function remember(key: string, v: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(v)) } catch { /* a convenience only */ }
}

/** A pill: a stream to switch to (D295) — 13px, chosen in the emerald wash, never the answer's solid emerald. */
const pillClass = (on: boolean) =>
  `inline-flex items-center gap-1.5 flex-shrink-0 min-h-11 px-3.5 rounded-full border text-[13px] font-semibold leading-tight press ch-focus ${
    on ? 'bg-accent-tint border-accent-deep text-accent-deep' : 'bg-surface border-line text-ink/80 hover:border-line-strong'}`

/**
 * The feed (D293–D307) on a member's Home: a pill row of their streams with
 * a + at its end (D300), a sideways swipe between them (the browser's own
 * scroll snap — D295; instant under Reduce Motion), the Comp stream's picker
 * of recent comps, the On the course strip, then the stream's items, twenty
 * at a time. Asked after the page paints, never inside Home's own answer
 * (D305); nothing at all before migration 102, or for a junior.
 *
 * `club` is the club area it sits in — the only place a Club stream shows (D294).
 */
export default function Feed({ club = null, mePath, onFindFriends }: { club?: { slug: string } | null; mePath: string; onFindFriends?: () => void }) {
  const [home, setHome] = useState<Home | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [panels, setPanels] = useState<Record<string, Panel>>({})
  const [compPick, setCompPick] = useState<{ code: string; over: string | null } | null>(null)
  const [sheet, setSheet] = useState(false)
  const [comments, setComments] = useState<{ cardId: string; title: string } | null>(null)
  const [now, setNow] = useState(() => new Date())
  const scroller = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [height, setHeight] = useState<number | null>(null)
  const where = club?.slug ?? 'home'

  const loadHome = useCallback(async () => {
    const r = await askFeed<Home>('home', club ? { club: club.slug } : {})
    if (r.ok) setHome(r)
  }, [club])

  useEffect(() => {
    void loadHome()
    setCompPick(remembered(COMP_KEY))
  }, [loadHome])

  const comps = useMemo(() => home?.comps ?? [], [home])
  const comp = home?.today ? shownComp(comps, home.today, compPick) : null
  const refs = useMemo(() => (home?.streams ?? []).map(s => readStreamKey(s.key)).filter((s): s is StreamRef => !!s), [home])
  const pills = useMemo(() => pillsFor(refs, {
    here: home?.here ?? null,
    compLive: comps.some(c => c.playing && c.live),
    hasComps: comps.length > 0,
  }), [refs, home, comps])
  const label = (s: StreamRef) => home?.streams?.find(v => v.key === streamKey(s))
  const panelKey = useCallback((s: StreamRef) => (s.kind === 'comp' ? `comp:${comp?.code ?? ''}` : streamKey(s)), [comp])

  // The stream to open on: the one last looked at here, else the first (D295).
  useEffect(() => {
    if (pills.length === 0) { setActive(null); return }
    setActive(was => {
      if (was && pills.some(p => streamKey(p) === was)) return was
      const kept = remembered<string>(`${STREAM_KEY}:${where}`)
      return kept && pills.some(p => streamKey(p) === kept) ? kept : streamKey(pills[0])
    })
  }, [pills, where])

  const load = useCallback(async (s: StreamRef, more = false) => {
    const key = panelKey(s)
    const before = more ? panels[key]?.next : undefined
    setPanels(p => ({ ...p, [key]: { items: p[key]?.items ?? [], next: p[key]?.next ?? null, players: p[key]?.players ?? null, loading: true, error: '' } }))
    const body = { stream: streamKey(s), ...(s.kind === 'comp' ? { comp: comp?.code } : {}) }
    const [page, strip] = await Promise.all([
      askFeed<{ items: FeedView[]; next: unknown }>('page', { ...body, before }),
      more ? Promise.resolve(null) : askFeed<{ players: { name: string; thru: number }[] }>('oncourse', body),
    ])
    setNow(new Date())
    setPanels(p => {
      const was = p[key]
      if (!page.ok) return { ...p, [key]: { items: was?.items ?? [], next: was?.next ?? null, players: was?.players ?? null, loading: false, error: page.error } }
      return { ...p, [key]: {
        items: more ? [...(was?.items ?? []), ...page.items] : page.items,
        next: page.next, loading: false, error: '',
        players: strip ? (strip.ok ? strip.players : []) : was?.players ?? null,
      } }
    })
  }, [panelKey, panels, comp])

  // The active stream is read when first shown, and again on coming back to the page — never polled.
  const activeRef = pills.find(p => streamKey(p) === active) ?? null
  const activePanelKey = activeRef ? panelKey(activeRef) : null
  useEffect(() => {
    if (!activeRef || !activePanelKey) return
    if (activeRef.kind === 'comp' && !comp) return
    if (!panels[activePanelKey]) void load(activeRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanelKey])
  useEffect(() => {
    let last = Date.now()
    const back = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60_000 || !activeRef) return
      last = Date.now()
      void load(activeRef)
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [activeRef, load])

  // The frame follows the stream on show, so a short one never sits over a tall one's gap.
  useLayoutEffect(() => {
    const el = active ? panelRefs.current[active] : null
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    setHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [active, panels])

  // A tapped pill scrolls to its stream; a swipe that settles on one lights its pill.
  const go = (key: string) => {
    const i = pills.findIndex(p => streamKey(p) === key)
    const el = scroller.current
    if (i < 0 || !el) return
    setActive(key)
    remember(`${STREAM_KEY}:${where}`, key)
    el.scrollTo({ left: i * el.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let t: number | undefined
    const settle = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
      const key = pills[i] ? streamKey(pills[i]) : null
      if (key && key !== active) { setActive(key); remember(`${STREAM_KEY}:${where}`, key) }
    }
    const onScroll = () => { window.clearTimeout(t); t = window.setTimeout(settle, 120) }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); window.clearTimeout(t) }
  }, [pills, active, where])
  // On first showing, the scroller starts on the remembered stream, with no motion.
  useLayoutEffect(() => {
    const el = scroller.current
    const i = pills.findIndex(p => streamKey(p) === active)
    if (el && i >= 0 && Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) !== i) el.scrollTo({ left: i * el.clientWidth, behavior: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pills.length, active === null])

  // One item changed (a dot, a status, a comment) — the same item wherever it is shown.
  const patchItem = useCallback((id: string, p: Partial<FeedView> | null) => {
    setPanels(all => Object.fromEntries(Object.entries(all).map(([k, v]) => [k, {
      ...v, items: p === null ? v.items.filter(i => i.id !== id) : v.items.map(i => (i.id === id ? { ...i, ...p } : i)),
    }])))
  }, [])
  const openComments = useCallback((cardId: string) => {
    const card = Object.values(panels).flatMap(p => p.items).find(i => i.id === cardId)
    setComments({ cardId, title: card ? `${card.name}’s card` : 'Comments' })
  }, [panels])

  // D307: the Home dot is cleared once the member has looked at their own cards — the Friends stream holds them.
  const newComments = home?.newComments ?? 0
  const friendsShown = active === 'friends' && !!panels.friends && !panels.friends.loading
  useEffect(() => {
    if (!friendsShown || newComments === 0) return
    const t = window.setTimeout(() => {
      void askFeed('seen').then(r => { if (r.ok) setHome(h => (h ? { ...h, newComments: 0 } : h)) })
    }, 1500)
    return () => window.clearTimeout(t)
  }, [friendsShown, newComments])

  if (!home || !home.ready || home.junior) return null

  const pickComp = (c: CompRef) => {
    const def = home.today ? shownComp(comps, home.today, null) : null
    const pick = { code: c.code, over: def?.code ?? null }
    setCompPick(pick)
    remember(COMP_KEY, pick)
  }

  return (
    <section className="mt-6" aria-labelledby="feed-title">
      <h2 id="feed-title" className="t-h2 text-ink flex items-center gap-2">
        Feed
        {(home.newComments ?? 0) > 0 && <span className="w-2 h-2 rounded-full bg-accent-deep" aria-label="New comments on your cards" role="img" />}
      </h2>

      <div className="mt-3 -mx-4 px-4 flex items-center gap-2 overflow-x-auto feed-pills" role="tablist" aria-label="Streams">
        {pills.map(p => {
          const key = streamKey(p)
          const on = key === active
          const live = p.kind === 'comp' && comps.some(c => c.playing && c.live)
          return (
            <button key={key} type="button" role="tab" aria-selected={on} aria-controls={`feed-${key}`} onClick={() => go(key)} className={pillClass(on)}>
              {live && <LiveDot />}
              {label(p)?.label ?? key}
              {p.kind === 'friends' && (home.newComments ?? 0) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-accent-deep" aria-hidden="true" />}
            </button>
          )
        })}
        <IconButton label="Add or remove streams" dense onClick={() => setSheet(true)} className="flex-shrink-0">
          <IconPlus size={20} />
        </IconButton>
      </div>

      {activeRef?.kind === 'comp' && comps.length > 1 && (
        <div className="mt-2 -mx-4 px-4 flex gap-2 overflow-x-auto feed-pills" role="listbox" aria-label="Recent comps">
          {comps.map(c => (
            <button key={c.code} type="button" role="option" aria-selected={c.code === comp?.code} onClick={() => pickComp(c)}
              className={`${pillClass(c.code === comp?.code)} max-w-[14rem]`}>
              {c.live && <LiveDot />}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {pills.length === 0 ? (
        <div className={`${cardClass('flat')} px-4 py-6 mt-3 text-center`}>
          <p className="t-body text-ink/80">No streams yet.</p>
          <button type="button" onClick={() => setSheet(true)} className={`${buttonClass('quiet', false)} mt-1`}>Add a stream</button>
        </div>
      ) : (
        <div ref={scroller} className="feed-streams relative mt-3 -mx-4 flex overflow-x-auto items-start"
          style={height ? { height } : undefined}>
          {pills.map(p => {
            const key = streamKey(p)
            const panel = panels[panelKey(p)]
            const view = label(p)
            return (
              <div key={key} id={`feed-${key}`} role="tabpanel" aria-label={view?.label ?? key}
                ref={el => { panelRefs.current[key] = el }}
                className="feed-stream relative w-full flex-shrink-0 px-4 pb-1">
                <StreamPanel stream={p} panel={panel} now={now} empty={view?.empty ?? ''}
                  comp={p.kind === 'comp' ? comp : null} mePath={mePath} onFindFriends={onFindFriends}
                  onMore={() => void load(p, true)} onRetry={() => void load(p)}
                  onPatch={patchItem} onOpenComments={openComments} />
              </div>
            )
          })}
        </div>
      )}

      {comments && (
        <CommentsSheet cardId={comments.cardId} title={comments.title} onClose={() => setComments(null)}
          onChanged={(count, latest) => patchItem(comments.cardId, { comments: count, latest })} />
      )}

      {sheet && (
        <StreamsSheet streams={home.streams ?? []} offered={home.offered ?? []} here={home.here ?? null}
          onClose={() => setSheet(false)} onSaved={() => { setSheet(false); setPanels({}); void loadHome() }} />
      )}
    </section>
  )
}

function StreamPanel({ stream, panel, now, empty, comp, mePath, onFindFriends, onMore, onRetry, onPatch, onOpenComments }: {
  stream: StreamRef; panel: Panel | undefined; now: Date; empty: string; comp: CompRef | null; mePath: string; onFindFriends?: () => void
  onMore: () => void; onRetry: () => void
  onPatch: (id: string, p: Partial<FeedView> | null) => void; onOpenComments: (cardId: string) => void
}) {
  if (stream.kind === 'comp' && !comp) return <p className="t-cap text-ink/65 py-4">No comps in the last month.</p>
  if (!panel || (panel.loading && panel.items.length === 0)) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="skeleton h-12 rounded-card" />
        <div className="skeleton h-40 rounded-card" />
        <div className="skeleton h-40 rounded-card" />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {panel.players && panel.players.length > 0 && (
        <div className={`${cardClass('flat')} px-4 py-3 flex items-center gap-2`}>
          <LiveDot />
          <p className="t-label text-ink min-w-0">
            <span className="sr-only">On the course: </span>
            {panel.players.map(p => `${p.name.split(/\s+/)[0]} thru ${p.thru}`).join(' · ')}
          </p>
        </div>
      )}
      {panel.error && (
        <div className={`${cardClass('flat')} px-4 py-3`}>
          <p role="alert" className="t-cap text-rust-deep">{panel.error}</p>
          <button type="button" onClick={onRetry} className={buttonClass('quiet', false, true)}>Try again</button>
        </div>
      )}
      {!panel.error && panel.items.length === 0 && (
        <div className={`${cardClass('flat')} px-4 py-6 text-center`}>
          <p className="t-body text-ink/80">{empty}</p>
          {stream.kind === 'friends' && (onFindFriends
            ? <button type="button" onClick={onFindFriends} className={`${buttonClass('quiet', false)} mt-1`}>Find friends</button>
            : <Link href={mePath} className={`${buttonClass('quiet', false)} mt-1`}>Find friends</Link>)}
        </div>
      )}
      {panel.items.map(it => (
        <FeedItem key={it.id} item={it} now={now}
          onOpen={it.kind === 'comment' && it.parentId ? () => onOpenComments(it.parentId!) : undefined}
          actions={<ItemActions item={it} onPatch={p => onPatch(it.id, p)} onGone={() => onPatch(it.id, null)} onOpenComments={onOpenComments} />} />
      ))}
      {panel.next != null && (
        <button type="button" disabled={panel.loading} onClick={onMore} className={`${buttonClass('secondary', true, true)}`}>
          {panel.loading ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  )
}
