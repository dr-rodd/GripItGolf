'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { askFeed } from '@/lib/feedClient'
import { compMenu, pillsFor, readStreamKey, shownComp, streamKey, type CompRef, type StreamRef } from '@/lib/feed'
import { reducedMotion } from '@/lib/motion'
import { IconCheck, IconChevronDown, IconSettings } from '../icons'
import { LiveDot, buttonClass, cardClass, iconButtonClass } from '../ui'
import { FeedItem, type FeedView } from './FeedItem'
import ItemSheet from './ItemSheet'
import StreamName from './StreamName'
import { ClubPostComposer, StatusComposer } from './Composer'
import { streamSeen } from './useStreamDot'

type StreamView = { key: string; kind: StreamRef['kind']; label: string; empty: string; about?: string }
type Home = {
  ready: boolean; junior?: boolean; v2?: boolean
  streams?: StreamView[]; offered?: StreamView[]
  here?: string | null
  canPost?: boolean
  follows?: { key: string; label: string }[]
  comps?: CompRef[]
  newComments?: number
  today?: string
}
type Panel = { items: FeedView[]; next: unknown; loading: boolean; error: string; players: { name: string; thru: number }[] | null; arriving: Set<string> }

const STREAM_KEY = 'gd.feed.stream.v1'
const COMP_KEY = 'gd.feed.comp.v1'
const MATCH_KEY = 'gd.feed.match.v1'
/** How far a pull must go to read the stream again (M13). */
const PULL_AT = 64

function remembered<T>(key: string): T | null {
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) as T : null } catch { return null }
}
function remember(key: string, v: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(v)) } catch { /* a convenience only */ }
}

/** A pill: a stream to switch to (D295) — chosen in the emerald wash, never the answer's solid emerald. */
const pillClass = (on: boolean) =>
  `inline-flex items-center gap-1.5 flex-shrink-0 min-h-11 px-3.5 rounded-full border text-[15px] font-semibold leading-tight press ch-focus ${
    on ? 'bg-accent-tint border-accent-deep text-accent-deep' : 'bg-surface border-line text-ink/80 hover:border-line-strong'}`

/**
 * The Stream tab (Streams v2, D318–D331). The stream on show is named at the
 * top — club•stream, comp•stream, match•stream, friends•stream (D321) — with
 * a chevron where there is a choice inside it: comp.stream's competitions by
 * heading (D323), match.stream's followed matches (D326). The member's
 * streams as pills, and a sideways swipe between them (D295, the browser's
 * own scroll snap; instant under Reduce Motion). Pull down to read again;
 * what is new fades in at the top; skeletons while it loads (M13). Tapping
 * an item opens its sheet (D330). Asked when the tab opens and when the
 * phone comes back to it — never polled, nothing on Home (M3).
 *
 * `club` is the club area it sits in — the only place club.stream shows (D294).
 * `settingsPath` is the gear's page, where the streams are chosen (D319).
 */
export default function Stream({ club = null, settingsPath }: { club?: { slug: string } | null; settingsPath: string }) {
  const [home, setHome] = useState<Home | null>(null)
  const [homeError, setHomeError] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [panels, setPanels] = useState<Record<string, Panel>>({})
  const [compPick, setCompPick] = useState<{ code: string; over: string | null } | null>(null)
  const [matchPick, setMatchPick] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<{ id: string; origin: HTMLElement | null } | null>(null)
  const [composer, setComposer] = useState<'status' | 'post' | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [pull, setPull] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const section = useRef<HTMLElement>(null)
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [height, setHeight] = useState<number | null>(null)
  const where = club?.slug ?? 'home'

  const loadHome = useCallback(async () => {
    setHomeError('')
    const r = await askFeed<Home>('home', club ? { club: club.slug } : {})
    if (r.ok) setHome(r)
    else setHomeError(r.error)
  }, [club])

  useEffect(() => {
    void loadHome()
    setCompPick(remembered(COMP_KEY))
    setMatchPick(remembered(MATCH_KEY))
  }, [loadHome])

  const comps = useMemo(() => home?.comps ?? [], [home])
  const follows = useMemo(() => home?.follows ?? [], [home])
  const comp = home?.today ? shownComp(comps, home.today, compPick) : null
  const match = follows.find(f => f.key === matchPick)?.key ?? follows[0]?.key ?? null
  const refs = useMemo(() => (home?.streams ?? []).map(s => readStreamKey(s.key)).filter((s): s is StreamRef => !!s), [home])
  const pills = useMemo(() => pillsFor(refs, { here: home?.here ?? null, compLive: comps.some(c => c.playing && c.live) }), [refs, home, comps])
  const panelKey = useCallback((s: StreamRef) => (
    s.kind === 'comp' ? `comp:${comp?.code ?? ''}` : s.kind === 'match' ? `match:${match ?? ''}` : streamKey(s)
  ), [comp, match])

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
    const blankPanel: Panel = { items: [], next: null, players: null, loading: true, error: '', arriving: new Set() }
    setPanels(p => ({ ...p, [key]: { ...(p[key] ?? blankPanel), loading: true, error: '' } }))
    const body = { stream: streamKey(s), ...(s.kind === 'comp' ? { comp: comp?.code } : {}), ...(s.kind === 'match' ? { match } : {}) }
    const strips = s.kind === 'comp' || s.kind === 'friends'
    const [page, strip] = await Promise.all([
      askFeed<{ items: FeedView[]; next: unknown }>('page', { ...body, before }),
      more || !strips ? Promise.resolve(null) : askFeed<{ players: { name: string; thru: number }[] }>('oncourse', body),
    ])
    setNow(new Date())
    setPanels(p => {
      const was = p[key]
      if (!page.ok) return { ...p, [key]: { ...(was ?? blankPanel), loading: false, error: page.error } }
      // M13: what was not there before fades in at the top — never on the first read.
      const seen = new Set((was?.items ?? []).map(i => i.id))
      const arriving = !more && was && was.items.length > 0 ? new Set(page.items.filter(i => !seen.has(i.id)).map(i => i.id)) : new Set<string>()
      return { ...p, [key]: {
        items: more ? [...(was?.items ?? []), ...page.items] : page.items,
        next: page.next, loading: false, error: '', arriving,
        players: strip ? (strip.ok ? strip.players : []) : was?.players ?? null,
      } }
    })
  }, [panelKey, panels, comp, match])

  const activeRef = pills.find(p => streamKey(p) === active) ?? null
  const activePanelKey = activeRef ? panelKey(activeRef) : null
  useEffect(() => {
    if (!activeRef || !activePanelKey) return
    if (activeRef.kind === 'comp' && !comp) return
    if (!panels[activePanelKey]) void load(activeRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanelKey])
  // Read again on coming back to the page, never polled.
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
    setMenu(false)
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
      if (key && key !== active) { setActive(key); setMenu(false); remember(`${STREAM_KEY}:${where}`, key) }
    }
    const onScroll = () => { window.clearTimeout(t); t = window.setTimeout(settle, 120) }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); window.clearTimeout(t) }
  }, [pills, active, where])
  useLayoutEffect(() => {
    const el = scroller.current
    const i = pills.findIndex(p => streamKey(p) === active)
    if (el && i >= 0 && Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) !== i) el.scrollTo({ left: i * el.clientWidth, behavior: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pills.length, active === null])

  // Pull to read again (M13): from the top of the page, a pull down past the line.
  const refresh = useRef<() => void>(() => undefined)
  refresh.current = () => { if (activeRef) void load(activeRef) }
  useEffect(() => {
    const el = section.current
    if (!el) return
    let start: number | null = null
    let dist = 0
    const down = (e: TouchEvent) => { start = window.scrollY <= 0 && !(e.target as HTMLElement).closest('.feed-pills') ? e.touches[0].clientY : null; dist = 0 }
    const move = (e: TouchEvent) => {
      if (start === null) return
      dist = Math.max(0, e.touches[0].clientY - start)
      setPull(Math.min(96, dist * 0.5))
    }
    const up = () => {
      if (start !== null && dist * 0.5 >= PULL_AT) refresh.current()
      start = null
      setPull(0)
    }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', up)
    el.addEventListener('touchcancel', up)
    return () => {
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
      el.removeEventListener('touchcancel', up)
    }
  }, [])

  // One item changed (a dot, a status, a comment) — the same item wherever it is shown.
  const patchItem = useCallback((id: string, p: Partial<FeedView> | null) => {
    setPanels(all => Object.fromEntries(Object.entries(all).map(([k, v]) => [k, {
      ...v, items: p === null ? v.items.filter(i => i.id !== id) : v.items.map(i => (i.id === id ? { ...i, ...p } : i)),
    }])))
  }, [])

  // D307, D320: the dot on the Stream tab clears once the member has looked at friends.stream.
  const newComments = home?.newComments ?? 0
  const friendsShown = active === 'friends' && !!panels.friends && !panels.friends.loading
  useEffect(() => {
    if (!friendsShown || newComments === 0) return
    const t = window.setTimeout(() => {
      void askFeed('seen').then(r => { if (r.ok) { setHome(h => (h ? { ...h, newComments: 0 } : h)); streamSeen() } })
    }, 1500)
    return () => window.clearTimeout(t)
  }, [friendsShown, newComments])

  const sheetItem = sheet ? Object.values(panels).flatMap(p => p.items).find(i => i.id === sheet.id) ?? null : null

  if (homeError && !home) {
    return (
      <section className="mt-6">
        <h1 className="t-h1 text-ink">Stream</h1>
        <p role="alert" className="t-cap text-rust-deep mt-3">{homeError}</p>
        <button type="button" onClick={() => void loadHome()} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
      </section>
    )
  }
  if (!home) {
    return (
      <section className="mt-6" aria-busy="true">
        <div className="skeleton h-8 w-44 rounded-tile" />
        <div className="skeleton h-11 mt-4 rounded-full" />
        <div className="space-y-3 mt-4"><div className="skeleton h-40 rounded-card" /><div className="skeleton h-40 rounded-card" /></div>
      </section>
    )
  }
  if (!home.ready || home.junior) {
    return (
      <section className="mt-6">
        <h1 className="t-h1 text-ink">Stream</h1>
        <p className="t-body text-ink/80 mt-2">{home.junior ? 'The stream isn’t open to junior members.' : 'The stream isn’t set up yet.'}</p>
      </section>
    )
  }

  const pickComp = (c: CompRef) => {
    const def = home.today ? shownComp(comps, home.today, null) : null
    const pick = { code: c.code, over: def?.code ?? null }
    setCompPick(pick)
    remember(COMP_KEY, pick)
    setMenu(false)
  }
  const label = (s: StreamRef) => home.streams?.find(v => v.key === streamKey(s))
  const chooser = activeRef?.kind === 'comp' ? comps.length > 0 : activeRef?.kind === 'match' ? follows.length > 1 : false

  return (
    <section ref={section} className="mt-4 relative" aria-labelledby="stream-title">
      {/* Pull to read again: the stream's dot grows with the pull, and breathes while it reads. */}
      <div aria-hidden={pull === 0} className="stream-pull flex items-center justify-center overflow-hidden" style={{ height: pull }}>
        {pull > 0 && (
          reducedMotion()
            ? <span className="t-cap text-ink/65">{pull >= PULL_AT ? 'Let go to refresh' : 'Pull to refresh'}</span>
            : <span className="rounded-full bg-accent" style={{ width: 8 + Math.min(1, pull / PULL_AT) * 8, height: 8 + Math.min(1, pull / PULL_AT) * 8 }} />
        )}
      </div>

      <div className="relative">
        <div className="flex items-center gap-1">
          <h1 id="stream-title" className="t-h2 text-ink min-w-0">
            {activeRef ? <StreamName kind={activeRef.kind} /> : 'Stream'}
          </h1>
          {chooser && (
            <button type="button" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu}
              aria-label={activeRef?.kind === 'comp' ? 'Choose a competition' : 'Choose a match'}
              className="w-11 h-11 rounded-full flex items-center justify-center text-ink/80 press ch-focus">
              <IconChevronDown size={22} className={`transition-transform duration-200 ${menu ? 'rotate-180' : ''}`} />
            </button>
          )}
          <Link href={settingsPath} aria-label="Choose your streams" className={`${iconButtonClass(true)} ml-auto flex-shrink-0`}>
            <IconSettings size={20} />
          </Link>
        </div>
        {activeRef?.kind === 'comp' && comp && (
          <p className="t-cap text-ink/65 flex items-center gap-1.5 min-w-0">
            {comp.live && <LiveDot />}<span className="truncate">{comp.name}{comp.clubName ? ` · ${comp.clubName}` : ''}</span>
          </p>
        )}
        {activeRef?.kind === 'club' && <p className="t-cap text-ink/65">{label(activeRef)?.label}</p>}
        {menu && activeRef?.kind === 'comp' && home.today && (
          <StreamMenu onClose={() => setMenu(false)} label="Competitions">
            {compMenu(comps, home.today).map(h => (
              <div key={h.key} role="group" aria-label={h.label}>
                <p className="t-label text-ink/65 px-3 pt-3 pb-1">{h.label}</p>
                {h.comps.map(c => (
                  <button key={c.code} type="button" role="menuitemradio" aria-checked={c.code === comp?.code} onClick={() => pickComp(c)}
                    className="w-full flex items-center gap-2 px-3 min-h-12 text-left rounded-tile press ch-focus">
                    {c.live && <LiveDot />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] text-ink truncate">{c.name}</span>
                      <span className="block t-cap text-ink/65 truncate">{[c.clubName, c.date && new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${c.date}T12:00:00Z`))].filter(Boolean).join(' · ')}</span>
                    </span>
                    {c.code === comp?.code && <IconCheck size={18} className="text-accent-deep flex-shrink-0" />}
                  </button>
                ))}
              </div>
            ))}
          </StreamMenu>
        )}
        {menu && activeRef?.kind === 'match' && (
          <StreamMenu onClose={() => setMenu(false)} label="Matches">
            {follows.map(f => (
              <button key={f.key} type="button" role="menuitemradio" aria-checked={f.key === match}
                onClick={() => { setMatchPick(f.key); remember(MATCH_KEY, f.key); setMenu(false) }}
                className="w-full flex items-center gap-2 px-3 min-h-12 text-left rounded-tile press ch-focus">
                <span className="flex-1 min-w-0 text-[16px] text-ink truncate">{f.label}</span>
                {f.key === match && <IconCheck size={18} className="text-accent-deep flex-shrink-0" />}
              </button>
            ))}
          </StreamMenu>
        )}
      </div>

      {pills.length > 1 && (
        <div className="mt-3 -mx-4 px-4 flex items-center gap-2 overflow-x-auto feed-pills" role="tablist" aria-label="Streams">
          {pills.map(p => {
            const key = streamKey(p)
            const on = key === active
            const live = p.kind === 'comp' && comps.some(c => c.playing && c.live)
            return (
              <button key={key} type="button" role="tab" aria-selected={on} aria-controls={`stream-${key}`} onClick={() => go(key)} className={pillClass(on)}>
                {live && <LiveDot />}
                <StreamName kind={p.kind} />
                {p.kind === 'friends' && newComments > 0 && <span className="w-1.5 h-1.5 rounded-full bg-accent-deep" aria-label="new comments" role="img" />}
              </button>
            )
          })}
        </div>
      )}

      {pills.length === 0 ? (
        <div className={`${cardClass('flat')} px-4 py-6 mt-3 text-center`}>
          <p className="t-body text-ink/80">No streams on.</p>
          <Link href={settingsPath} className={`${buttonClass('quiet', false)} mt-1`}>Choose your streams</Link>
        </div>
      ) : (
        <div ref={scroller} className="feed-streams relative mt-3 -mx-4 flex overflow-x-auto items-start" style={height ? { height } : undefined}>
          {pills.map(p => {
            const key = streamKey(p)
            const panel = panels[panelKey(p)]
            const view = label(p)
            return (
              <div key={key} id={`stream-${key}`} role="tabpanel" aria-label={`${p.kind} stream`}
                ref={el => { panelRefs.current[key] = el }} className="feed-stream relative w-full flex-shrink-0 px-4 pb-1">
                {p.kind === 'friends' && home.v2 && (
                  <ComposeButton onClick={() => setComposer('status')} label="Post a status" hint="What’s happening?" />
                )}
                {p.kind === 'club' && home.v2 && home.canPost && (
                  <ComposeButton onClick={() => setComposer('post')} label="Post to the club" hint="A notice, the newsletter, news" />
                )}
                <StreamPanel stream={p} panel={panel} now={now} empty={view?.empty ?? ''}
                  comp={p.kind === 'comp' ? comp : null} settingsPath={settingsPath}
                  onMore={() => void load(p, true)} onRetry={() => void load(p)}
                  onPatch={patchItem} onOpen={(id, el) => setSheet({ id, origin: el })} />
              </div>
            )
          })}
        </div>
      )}

      {sheet && sheetItem && (
        <ItemSheet key={sheet.id} item={sheetItem} origin={sheet.origin} onClose={() => setSheet(null)}
          onPatch={p => patchItem(sheetItem.id, p)} onGone={() => patchItem(sheetItem.id, null)} />
      )}
      {composer === 'status' && (
        <StatusComposer follows={follows} onClose={() => setComposer(null)}
          onPosted={() => { setComposer(null); const f = pills.find(p => p.kind === 'friends'); if (f) void load(f) }} />
      )}
      {composer === 'post' && home.here && (
        <ClubPostComposer clubId={home.here} onClose={() => setComposer(null)}
          onPosted={() => { setComposer(null); const c = pills.find(p => p.kind === 'club'); if (c) void load(c) }} />
      )}
    </section>
  )
}

/** A field-shaped button that opens a composer — the stream's own "what's happening?". */
function ComposeButton({ onClick, label, hint }: { onClick: () => void; label: string; hint: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`${cardClass('flat', true)} w-full mb-3 px-4 min-h-12 flex items-center gap-3 text-left`}>
      <span aria-hidden="true" className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
      <span className="t-body text-ink/65 flex-1 min-w-0 truncate">{hint}</span>
      <span aria-hidden="true" className="t-label text-accent-deep flex-shrink-0">Post</span>
    </button>
  )
}

/**
 * The chevron's menu (D323): a drop-down under the stream's name, the way a
 * social app lists what it can show — headings, then the choices, the one
 * shown ticked. Outside the swipe frame, so nothing clips it. Escape or a tap
 * elsewhere closes it.
 */
function StreamMenu({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-haspopup="menu"]')) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div ref={box} role="menu" aria-label={label}
      className={`${cardClass('floating')} paper menu-drop absolute left-0 right-0 top-full mt-1 z-30 p-1 max-h-[60vh] overflow-y-auto`}>
      {children}
    </div>
  )
}

function StreamPanel({ stream, panel, now, empty, comp, settingsPath, onMore, onRetry, onPatch, onOpen }: {
  stream: StreamRef; panel: Panel | undefined; now: Date; empty: string; comp: CompRef | null; settingsPath: string
  onMore: () => void; onRetry: () => void
  onPatch: (id: string, p: Partial<FeedView> | null) => void
  onOpen: (id: string, el: HTMLElement) => void
}) {
  if (stream.kind === 'comp' && !comp) {
    return <div className={`${cardClass('flat')} px-4 py-6 text-center`}><p className="t-body text-ink/80">No competitions in the last month.</p></div>
  }
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
          {stream.kind === 'friends' && <Link href={settingsPath} className={`${buttonClass('quiet', false)} mt-1`}>Find friends</Link>}
        </div>
      )}
      {panel.items.map(it => (
        <FeedItem key={it.id} item={it} now={now} arriving={panel.arriving.has(it.id)}
          onOpen={it.talk ? el => onOpen(it.id, el) : undefined}
          onPatch={p => onPatch(it.id, p)} onGone={() => onPatch(it.id, null)} />
      ))}
      {panel.next != null && (
        <button type="button" disabled={panel.loading} onClick={onMore} className={`${buttonClass('secondary', true, true)}`}>
          {panel.loading ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  )
}
