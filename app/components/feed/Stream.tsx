'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { askFeed } from '@/lib/feedClient'
import { COMMENT_MAX, OWN_STATUS_MAX, POST_MAX, chatTimeline, compMenu, pillsFor, readStreamKey, replyNote, shownComp, streamKey, type CompRef, type StreamRef } from '@/lib/feed'
import { reducedMotion } from '@/lib/motion'
import { IconCheck, IconPlus, IconReply, IconSettings, IconUsers, IconX } from '../icons'
import { LiveDot, PageTitle, buttonClass, cardClass, iconButtonClass } from '../ui'
import { popClose, popOpen } from '../popOut'
import { TABBAR_SPACE } from '../tabbarMetrics'
import { ChatReply, FeedItem, MiniCard, replyToComment, replyToItem, type FeedView, type ReplyTarget } from './FeedItem'
import ItemSheet, { warmCard } from './ItemSheet'
import StreamName from './StreamName'
import { ClubPostComposer, InlineComposer, StatusComposer } from './Composer'
import { GroupSettingsSheet, NewGroupSheet } from './GroupSheet'
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
  /** D343: the member's stream groups, and whether groups can be made yet (105). */
  groupsReady?: boolean
  groups?: { id: string; name: string; admin: boolean; members: number }[]
}
type Cursor = { at: string; id: string }
type Panel = { items: FeedView[]; next: Cursor | null; loading: boolean; error: string; players: { name: string; thru: number }[] | null; arriving: Set<string> }

const STREAM_KEY = 'gd.feed.stream.v1'
const COMP_KEY = 'gd.feed.comp.v1'
const MATCH_KEY = 'gd.feed.match.v1'
/** How near the foot of the chat counts as at the foot: a read again then keeps it there. */
const AT_FOOT = 160
/** How long a message jumped to stays lit (D346). */
const FLASH_MS = 1400

function remembered<T>(key: string): T | null {
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) as T : null } catch { return null }
}
function remember(key: string, v: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(v)) } catch { /* a convenience only */ }
}
const atFoot = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - AT_FOOT
const toFoot = (smooth = false) => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' })
const frames = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
/** Every message's id on a page, the replies too — what "new" is measured against. */
const messageIds = (items: FeedView[]) => items.flatMap(i => [i.id, ...i.thread.map(c => c.id)])

/**
 * The Stream tab (Streams v2, D318–D331), **a chat** (D346, Ross, 26 Nov
 * 2026: "Make it more like a chat. Default to bottom of chat. New entries on
 * the bottom"). The stream on show is named at the top, its title the
 * control (D340): a tap springs a menu out of it listing the member's
 * streams, then the choices inside the one on show (comp.stream's
 * competitions, D323; match.stream's matches, D326). Under it the chat,
 * oldest at the top: every item and every reply on it its own message
 * (`chatTimeline`), opened at the foot, earlier messages read in as the
 * chat is scrolled up to its head, the screen held still while they land.
 * **Swipe any message right to reply** (`SwipeReply`): the box at the foot
 * says what is being answered. A reply quotes a card as a small square, or
 * notes "Replying to Dave"; tapping either goes to that message, lit for a
 * moment with a green dot's pop on its initial. Tapping an item opens its
 * sheet as before, every reply at its foot (D330). The sideways swipe
 * between streams went (D295 → D346): sideways is the reply now. Read when
 * the tab opens, on coming back and after sending — never polled (M3).
 *
 * `club` is the club area it sits in — the only place club.stream shows (D294).
 * `settingsPath` is the gear's page, where the streams are chosen (D319).
 */
export default function Stream({ club = null, settingsPath }: { club?: { slug: string } | null; settingsPath: string }) {
  const [home, setHome] = useState<Home | null>(null)
  const [homeError, setHomeError] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [panels, setPanels] = useState<Record<string, Panel>>({})
  const panelsRef = useRef(panels)
  panelsRef.current = panels
  const [compPick, setCompPick] = useState<{ code: string; over: string | null } | null>(null)
  const [matchPick, setMatchPick] = useState<string | null>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [sheet, setSheet] = useState<{ id: string; origin: HTMLElement | null } | null>(null)
  const [composer, setComposer] = useState<'status' | 'post' | null>(null)
  // D343: making a group, or a group's settings.
  const [groupSheet, setGroupSheet] = useState<{ kind: 'new' } | { kind: 'settings'; id: string } | null>(null)
  // D346: what the box at the foot is answering, and the message just jumped to.
  const [reply, setReply] = useState<ReplyTarget | null>(null)
  const [replyKey, setReplyKey] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  // Where the chat must be once the next page lands: at its foot, or held still while earlier messages arrive above.
  const placing = useRef<{ foot: boolean; smooth: boolean } | { anchor: { h: number; y: number } } | null>({ foot: true, smooth: false })
  const [settled, setSettled] = useState(false)
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
  // D334: the trip's scorecard, fetched ahead once the tab is idle, so a card pops out without waiting on it.
  useEffect(() => {
    const t = window.setTimeout(() => { void warmCard().catch(() => undefined) }, 1200)
    return () => window.clearTimeout(t)
  }, [])

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

  /** Read a stream's latest page, or (`more`) the page before the oldest read. */
  const load = useCallback(async (s: StreamRef, more = false) => {
    const key = panelKey(s)
    const was = panelsRef.current[key]
    if (more && (!was?.next || was.loading)) return
    const before = more ? was?.next ?? undefined : undefined
    const blankPanel: Panel = { items: [], next: null, players: null, loading: true, error: '', arriving: new Set() }
    setPanels(p => ({ ...p, [key]: { ...(p[key] ?? blankPanel), loading: true, error: '' } }))
    const body = { stream: streamKey(s), ...(s.kind === 'comp' ? { comp: comp?.code } : {}), ...(s.kind === 'match' ? { match } : {}) }
    const strips = s.kind === 'comp' || s.kind === 'friends' || s.kind === 'group'
    const [page, strip] = await Promise.all([
      askFeed<{ items: FeedView[]; next: Cursor | null }>('page', { ...body, before }),
      more || !strips ? Promise.resolve(null) : askFeed<{ players: { name: string; thru: number }[] }>('oncourse', body),
    ])
    setNow(new Date())
    // Earlier messages land above: the screen is held where it was. A read again at the foot stays at the foot.
    if (more) placing.current = { anchor: { h: document.documentElement.scrollHeight, y: window.scrollY } }
    else if (!placing.current && was && was.items.length > 0 && atFoot()) placing.current = { foot: true, smooth: true }
    setPanels(p => {
      const cur = p[key]
      if (!page.ok) return { ...p, [key]: { ...(cur ?? blankPanel), loading: false, error: page.error } }
      if (more) {
        const have = new Set((cur?.items ?? []).map(i => i.id))
        return { ...p, [key]: { ...(cur ?? blankPanel), items: [...(cur?.items ?? []), ...page.items.filter(i => !have.has(i.id))], next: page.next, loading: false, error: '', arriving: new Set() } }
      }
      // M13: what was not there before fades in — never on the first read. Earlier pages already read are kept.
      const seen = new Set(messageIds(cur?.items ?? []))
      const arriving = cur && cur.items.length > 0 ? new Set(messageIds(page.items).filter(id => !seen.has(id))) : new Set<string>()
      const fresh = new Set(page.items.map(i => i.id))
      // Pages already read further back stay read: a read again never shortens the chat.
      const deeper = !!cur && cur.items.length > 0 && !!page.next && (cur.next === null || cur.next.at < page.next.at)
      const older = deeper ? cur!.items.filter(i => !fresh.has(i.id)) : []
      return { ...p, [key]: {
        items: [...page.items, ...older],
        next: deeper ? cur!.next : page.next, loading: false, error: '', arriving,
        players: strip ? (strip.ok ? strip.players : []) : cur?.players ?? null,
      } }
    })
  }, [panelKey, comp, match])

  const activeRef = pills.find(p => streamKey(p) === active) ?? null
  const activePanelKey = activeRef ? panelKey(activeRef) : null
  useEffect(() => {
    if (!activeRef || !activePanelKey) return
    if (activeRef.kind === 'comp' && !comp) return
    // A stream opened opens at its foot.
    placing.current = { foot: true, smooth: false }
    setSettled(false)
    setReply(null)
    if (!panelsRef.current[activePanelKey]) void load(activeRef)
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

  // Once a page has landed: to the foot, or held still under earlier messages.
  const shown = activePanelKey ? panels[activePanelKey] : undefined
  useLayoutEffect(() => {
    const want = placing.current
    if (!want || !shown || shown.loading) return
    placing.current = null
    if ('anchor' in want) window.scrollTo({ top: want.anchor.y + (document.documentElement.scrollHeight - want.anchor.h), behavior: 'auto' })
    else toFoot(want.smooth)
    if (!settled) requestAnimationFrame(() => setSettled(true))
  }, [shown, settled])

  // One item changed (a dot, a status, a reply) — the same item wherever it is shown.
  const patchItem = useCallback((id: string, p: Partial<FeedView> | null) => {
    setPanels(all => Object.fromEntries(Object.entries(all).map(([k, v]) => [k, {
      ...v, items: p === null ? v.items.filter(i => i.id !== id) : v.items.map(i => (i.id === id ? { ...i, ...p } : i)),
    }])))
  }, [])
  // A reply deleted: off its item's thread, and its count down.
  const dropReply = useCallback((rootId: string, replyId: string) => {
    setPanels(all => Object.fromEntries(Object.entries(all).map(([k, v]) => [k, {
      ...v, items: v.items.map(i => (i.id === rootId ? { ...i, thread: i.thread.filter(c => c.id !== replyId), comments: Math.max(0, i.comments - 1) } : i)),
    }])))
  }, [])

  /** Go to a message (D346): read further back until it is there, then bring it to the middle and light it. */
  const jumpTo = useCallback(async (id: string) => {
    for (let i = 0; i < 12; i++) {
      const el = document.querySelector(`[data-msg="${CSS.escape(id)}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
        setFlash(id)
        window.setTimeout(() => setFlash(f => (f === id ? null : f)), FLASH_MS)
        return
      }
      const p = activePanelKey ? panelsRef.current[activePanelKey] : null
      if (!activeRef || !p?.next) return
      await load(activeRef, true)
      await frames()
    }
  }, [activeRef, activePanelKey, load])

  const startReply = useCallback((t: ReplyTarget) => { setReply(t); setReplyKey(k => k + 1) }, [])

  // D307, D320, D343: the dot on the Stream tab clears once the member has looked at a stream.
  const newComments = home?.newComments ?? 0
  const streamShown = !!shown && !shown.loading
  useEffect(() => {
    if (!streamShown || newComments === 0) return
    const t = window.setTimeout(() => {
      void askFeed('seen').then(r => { if (r.ok) { setHome(h => (h ? { ...h, newComments: 0 } : h)); streamSeen() } })
    }, 1500)
    return () => window.clearTimeout(t)
  }, [streamShown, newComments])

  const sheetItem = sheet ? Object.values(panels).flatMap(p => p.items).find(i => i.id === sheet.id) ?? null : null

  if (homeError && !home) {
    return (
      <section className="mt-6">
        <PageTitle>Stream</PageTitle>
        <p role="alert" className="t-cap text-rust-deep mt-3">{homeError}</p>
        <button type="button" onClick={() => void loadHome()} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
      </section>
    )
  }
  if (!home) {
    return (
      <section className="mt-6" aria-busy="true">
        <div className="skeleton h-[60px] rounded-card" />
        <div className="space-y-3 mt-4"><div className="skeleton h-40 rounded-card" /><div className="skeleton h-40 rounded-card" /></div>
      </section>
    )
  }
  if (!home.ready || home.junior) {
    return (
      <section className="mt-6">
        <PageTitle sub={home.junior ? 'The stream isn’t open to junior members.' : 'The stream isn’t set up yet.'}>Stream</PageTitle>
      </section>
    )
  }

  const go = (key: string) => {
    setActive(key)
    remember(`${STREAM_KEY}:${where}`, key)
  }

  const pickComp = (c: CompRef) => {
    const def = home.today ? shownComp(comps, home.today, null) : null
    const pick = { code: c.code, over: def?.code ?? null }
    setCompPick(pick)
    remember(COMP_KEY, pick)
  }
  const label = (s: StreamRef) => home.streams?.find(v => v.key === streamKey(s))
  const chooser = activeRef?.kind === 'comp' ? comps.length > 0 : activeRef?.kind === 'match' ? follows.length > 1 : false
  // The title opens the menu whenever there is anything to choose: another stream, a choice inside this one, or a group to make.
  const hasMenu = pills.length > 1 || chooser || !!home.groupsReady
  const group = activeRef?.kind === 'group' ? (home.groups ?? []).find(g => g.id === activeRef.id) ?? null : null
  const titleOf = (s: StreamRef) => (s.kind === 'group' ? label(s)?.label ?? 'Group' : <StreamName kind={s.kind} />)
  // A group made or left: the streams asked again, a new group opened on.
  const afterGroups = async (open?: string) => {
    if (open) { setActive(`group:${open}`); remember(`${STREAM_KEY}:${where}`, `group:${open}`) }
    await loadHome()
  }
  const shortDate = (d: string) => new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

  // The box at the foot (D342, D346): a group's members and a club's posters write here; anybody replying does.
  const posts = !!activeRef && !!home.v2 && (activeRef.kind === 'group' || (activeRef.kind === 'club' && !!home.canPost && !!home.here))
  const send = async (text: string): Promise<string | null> => {
    if (!activeRef) return 'Choose a stream first.'
    if (reply) {
      const r = await askFeed('comment', { itemId: reply.rootId, text, ...(reply.commentId ? { replyTo: reply.commentId } : {}) })
      if (!r.ok) return r.error
      setReply(null)
    } else if (activeRef.kind === 'group') {
      const r = await askFeed<{ id: string }>('status.post', { text, stream: streamKey(activeRef) })
      if (!r.ok) return r.error
    } else if (activeRef.kind === 'club' && home.here) {
      const r = await askFeed<{ id: string }>('post.club', { clubId: home.here, title: '', text, link: '' })
      if (!r.ok) return r.error
    } else return 'This stream takes replies only — swipe a message right to answer it.'
    // What was sent lands at the foot, and the chat goes down to it.
    placing.current = { foot: true, smooth: true }
    void load(activeRef)
    return null
  }
  const placeholder = reply
    ? (reply.mine ? 'Reply to yourself…' : `Reply to ${reply.name.trim().split(/\s+/)[0]}…`)
    : activeRef?.kind === 'group' ? `Message ${label(activeRef)?.label ?? 'the group'}…` : 'Post to the club…'

  return (
    <section className="mt-4 relative" aria-labelledby="stream-title">
      <div className="relative z-30">
        {/* D339, D340: the stream's name is the page's title, on its opaque box; the title is the control. */}
        <PageTitle
          menu={hasMenu ? { open: !!menu, label: 'Choose what the stream shows', onToggle: el => setMenu(m => m ?? el) } : undefined}
          action={<>
            {group && (
              <button type="button" onClick={() => setGroupSheet({ kind: 'settings', id: group.id })} aria-label={`${group.name}: who’s in it${group.admin ? ', and its settings' : ''}`}
                className={iconButtonClass(true)}><IconUsers size={20} /></button>
            )}
            <Link href={settingsPath} aria-label="Choose your streams" className={iconButtonClass(true)}><IconSettings size={20} /></Link>
          </>}
          sub={activeRef?.kind === 'comp' && comp
            ? <span className="flex items-center gap-1.5 min-w-0">{comp.live && <LiveDot />}<span className="truncate">{comp.name}{comp.clubName ? ` · ${comp.clubName}` : ''}</span></span>
            : activeRef?.kind === 'club' ? label(activeRef)?.label
            : group ? `Group · ${group.members} ${group.members === 1 ? 'person' : 'people'}` : undefined}>
          <span id="stream-title" className="inline-flex items-center gap-2">
            {activeRef ? titleOf(activeRef) : 'Stream'}
          </span>
        </PageTitle>
        {menu && (
          <StreamMenu origin={menu} onClose={() => setMenu(null)} label="What the stream shows">
              <>
                {pills.length > 1 && (
                  <div role="group" aria-label="Streams">
                    <p className="t-label text-ink/65 px-3 pt-3 pb-1">Streams</p>
                    {pills.map(p => {
                      const key = streamKey(p)
                      const live = p.kind === 'comp' && comps.some(c => c.playing && c.live)
                      return (
                        <button key={key} type="button" role="menuitemradio" aria-checked={key === active}
                          onClick={() => go(key)}
                          className="w-full flex items-center gap-2 px-3 min-h-12 text-left rounded-tile press ch-focus">
                          {live && <LiveDot />}
                          <span className="flex-1 min-w-0 t-card text-ink truncate">{titleOf(p)}</span>
                          {p.kind === 'group' && <span className="t-cap text-ink/65 flex-shrink-0">Group</span>}
                          {key === active && <IconCheck size={18} className="text-accent-deep flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )}
                {home.groupsReady && (
                  <button type="button" role="menuitem" onClick={() => setGroupSheet({ kind: 'new' })}
                    className="w-full flex items-center gap-2 px-3 min-h-12 text-left rounded-tile press ch-focus t-label text-accent-deep">
                    <IconPlus size={18} /> New group
                  </button>
                )}
                {activeRef?.kind === 'comp' && home.today && comps.length > 0 && compMenu(comps, home.today).map(h => (
                  <div key={h.key} role="group" aria-label={h.label} className={pills.length > 1 ? 'border-t border-line mt-1' : ''}>
                    <p className="t-label text-ink/65 px-3 pt-3 pb-1">{h.label}</p>
                    {h.comps.map(c => (
                      <button key={c.code} type="button" role="menuitemradio" aria-checked={c.code === comp?.code} onClick={() => pickComp(c)}
                        className="w-full flex items-center gap-2 px-3 min-h-12 text-left rounded-tile press ch-focus">
                        {c.live && <LiveDot />}
                        <span className="flex-1 min-w-0">
                          <span className="block text-[16px] text-ink truncate">{c.name}</span>
                          <span className="block t-cap text-ink/65 truncate">{[c.clubName, c.date && shortDate(c.date)].filter(Boolean).join(' · ')}</span>
                        </span>
                        {c.code === comp?.code && <IconCheck size={18} className="text-accent-deep flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                ))}
                {activeRef?.kind === 'match' && follows.length > 1 && (
                  <div role="group" aria-label="Matches" className={pills.length > 1 ? 'border-t border-line mt-1' : ''}>
                    <p className="t-label text-ink/65 px-3 pt-3 pb-1">Matches</p>
                    {follows.map(f => (
                      <button key={f.key} type="button" role="menuitemradio" aria-checked={f.key === match}
                        onClick={() => { setMatchPick(f.key); remember(MATCH_KEY, f.key) }}
                        className="w-full flex items-center gap-2 px-3 min-h-12 text-left rounded-tile press ch-focus">
                        <span className="flex-1 min-w-0 text-[16px] text-ink truncate">{f.label}</span>
                        {f.key === match && <IconCheck size={18} className="text-accent-deep flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </>
          </StreamMenu>
        )}
      </div>

      {pills.length === 0 || !activeRef ? (
        <div className={`${cardClass()} px-4 py-6 mt-3 text-center`}>
          <p className="t-body text-ink/80">No streams on.</p>
          <Link href={settingsPath} className={`${buttonClass('quiet', false)} mt-1`}>Choose your streams</Link>
        </div>
      ) : (
        <>
          <ChatPanel key={activePanelKey ?? ''} stream={activeRef} panel={shown} now={now} empty={label(activeRef)?.empty ?? ''}
            comp={activeRef.kind === 'comp' ? comp : null} settingsPath={settingsPath} settled={settled} flash={flash}
            onMore={() => void load(activeRef, true)} onRetry={() => void load(activeRef)}
            onPatch={patchItem} onDropReply={dropReply} onOpen={(id, el) => setSheet({ id, origin: el })}
            onReply={startReply} onJump={id => void jumpTo(id)} />
          {(posts || reply) && (
            <div className="chat-composer sticky z-20 -mx-4 px-4 pt-2 pb-2 paper" style={{ '--chat-bottom': TABBAR_SPACE } as React.CSSProperties}>
              {reply && <ReplyBar reply={reply} onJump={() => void jumpTo(reply.commentId ?? reply.rootId)} onCancel={() => setReply(null)} />}
              <InlineComposer label={`stream-${activePanelKey}`} placeholder={placeholder} max={reply ? COMMENT_MAX : activeRef.kind === 'club' ? POST_MAX : OWN_STATUS_MAX}
                focusKey={reply ? replyKey : 0} onSend={send} className=""
                extra={!reply && activeRef.kind === 'club' ? <button type="button" onClick={() => setComposer('post')} className="min-h-10 px-2 rounded-[18px] t-cap text-ink/65 press ch-focus">Heading or link</button> : undefined} />
            </div>
          )}
        </>
      )}

      {sheet && sheetItem && (
        <ItemSheet key={sheet.id} item={sheetItem} origin={sheet.origin} onClose={() => setSheet(null)}
          onPatch={p => patchItem(sheetItem.id, p)} onGone={() => patchItem(sheetItem.id, null)} />
      )}
      {groupSheet?.kind === 'new' && (
        <NewGroupSheet onClose={() => setGroupSheet(null)} onMade={id => { setGroupSheet(null); void afterGroups(id) }} />
      )}
      {groupSheet?.kind === 'settings' && (
        <GroupSettingsSheet groupId={groupSheet.id} onClose={() => setGroupSheet(null)}
          onChanged={() => void loadHome()} onLeft={() => { setGroupSheet(null); void afterGroups() }} />
      )}
      {composer === 'status' && (
        <StatusComposer follows={follows} onClose={() => setComposer(null)}
          onPosted={() => { setComposer(null); const f = pills.find(p => p.kind === 'friends'); if (f) void load(f) }} />
      )}
      {composer === 'post' && home.here && (
        <ClubPostComposer clubId={home.here} onClose={() => setComposer(null)}
          onPosted={() => { setComposer(null); const c = pills.find(p => p.kind === 'club'); if (c) { placing.current = { foot: true, smooth: true }; void load(c) } }} />
      )}
    </section>
  )
}

/**
 * What the box at the foot is answering (D346): the card's square or the
 * reply arrow, "Replying to Dave" and the first words — a tap goes to it —
 * and ✕ to write to the stream instead.
 */
function ReplyBar({ reply, onJump, onCancel }: { reply: ReplyTarget; onJump: () => void; onCancel: () => void }) {
  const said = reply.quote === 'card' ? (reply.mine ? 'Replying to your card' : `${replyNote(reply)}’s card`) : replyNote(reply)
  return (
    <div className="flex items-center gap-2 mb-2 pl-2 pr-1 py-1.5 rounded-tile bg-surface border border-line">
      {reply.quote === 'card' && reply.card
        ? <MiniCard item={reply.card} stuck={false} />
        : <span className="w-8 h-8 flex items-center justify-center text-accent-deep flex-shrink-0"><IconReply size={18} /></span>}
      <button type="button" onClick={onJump} className="flex-1 min-w-0 text-left press ch-focus rounded-tile py-1">
        <span className="block t-cap font-semibold text-accent-deep truncate">{said}</span>
        {reply.text && <span className="block t-cap text-ink/65 truncate">{reply.text}</span>}
      </button>
      <button type="button" onClick={onCancel} aria-label="Stop replying" className={iconButtonClass(true)}><IconX size={18} /></button>
    </div>
  )
}

/** "Today", "Yesterday", else the day — the line a chat puts between days. */
function dayLine(at: string, now: Date): { key: string; label: string } {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(d)
  const key = day(new Date(at))
  const today = day(now)
  const yesterday = day(new Date(now.getTime() - 86_400_000))
  const label = key === today ? 'Today' : key === yesterday ? 'Yesterday'
    : new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Dublin' }).format(new Date(at))
  return { key, label }
}

/**
 * One stream as a chat (D346): oldest at the top, the latest at the foot,
 * a line between days. Its head reads earlier messages in as it comes into
 * view — only once the chat has opened at its foot — with a button there
 * too. Live players on the course are a line at the foot, as a chat says
 * who is typing (D302).
 */
function ChatPanel({ stream, panel, now, empty, comp, settingsPath, settled, flash, onMore, onRetry, onPatch, onDropReply, onOpen, onReply, onJump }: {
  stream: StreamRef; panel: Panel | undefined; now: Date; empty: string; comp: CompRef | null; settingsPath: string
  settled: boolean; flash: string | null
  onMore: () => void; onRetry: () => void
  onPatch: (id: string, p: Partial<FeedView> | null) => void
  onDropReply: (rootId: string, replyId: string) => void
  onOpen: (id: string, el: HTMLElement) => void
  onReply: (t: ReplyTarget) => void
  onJump: (id: string) => void
}) {
  const head = useRef<HTMLDivElement>(null)
  const more = useRef(onMore)
  useEffect(() => { more.current = onMore })
  const next = panel?.next ?? null
  // Earlier messages read in as the head comes into view — never before the chat has opened at its foot.
  useEffect(() => {
    const el = head.current
    if (!el || !settled || !next || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more.current() }, { rootMargin: '240px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [settled, next])
  const items = useMemo(() => panel?.items ?? [], [panel])
  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const timeline = useMemo(() => chatTimeline(items, next?.at ?? null), [items, next])

  if (stream.kind === 'comp' && !comp) {
    return <div className={`${cardClass()} px-4 py-6 mt-3 text-center`}><p className="t-body text-ink/80">No competitions in the last month.</p></div>
  }
  if (!panel || (panel.loading && panel.items.length === 0)) {
    return (
      <div className="space-y-3 mt-3" aria-busy="true">
        <div className="skeleton h-40 rounded-card w-[72%]" />
        <div className="skeleton h-12 rounded-card w-[60%] ml-auto" />
        <div className="skeleton h-12 rounded-card w-[50%]" />
      </div>
    )
  }
  return (
    <div className="flex flex-col justify-end min-h-[55vh] pt-3 pb-3">
      <div ref={head} className="flex justify-center">
        {next && (
          <button type="button" disabled={panel.loading} onClick={onMore} className={buttonClass('quiet', false, true)}>
            {panel.loading ? 'Loading earlier messages…' : 'Earlier messages'}
          </button>
        )}
      </div>
      {panel.error && (
        <div className={`${cardClass()} px-4 py-3 my-2`}>
          <p role="alert" className="t-cap text-rust-deep">{panel.error}</p>
          <button type="button" onClick={onRetry} className={buttonClass('quiet', false, true)}>Try again</button>
        </div>
      )}
      {!panel.error && timeline.length === 0 && !next && (
        <div className={`${cardClass()} px-4 py-6 text-center`}>
          <p className="t-body text-ink/80">{empty}</p>
          {stream.kind === 'friends' && <Link href={settingsPath} className={`${buttonClass('quiet', false)} mt-1`}>Find friends</Link>}
        </div>
      )}
      <div className="space-y-4" role="log" aria-label="Messages" aria-live="polite">
        {timeline.map((m, i) => {
          const day = dayLine(m.at, now)
          const sep = i === 0 || dayLine(timeline[i - 1].at, now).key !== day.key
            ? <p key={`day-${day.key}`} className="t-cap text-ink/65 text-center pt-2">{day.label}</p> : null
          if (m.kind === 'item') {
            const it = byId.get(m.id)!
            return [sep, (
              <FeedItem key={it.id} item={it} now={now} arriving={panel.arriving.has(it.id)} flash={flash === it.id}
                onOpen={it.talk ? el => onOpen(it.id, el) : undefined}
                onReply={it.talk ? () => onReply(replyToItem(it)) : undefined}
                onPatch={p => onPatch(it.id, p)} onGone={() => onPatch(it.id, null)} />
            )]
          }
          const root = byId.get(m.rootId)!
          const c = root.thread.find(x => x.id === m.id)!
          return [sep, (
            <ChatReply key={c.id} item={root} reply={c} now={now} arriving={panel.arriving.has(c.id)} flash={flash === c.id}
              onJump={onJump} onReply={() => onReply(replyToComment(root, c))} onGone={() => onDropReply(root.id, c.id)} />
          )]
        })}
      </div>
      {panel.players && panel.players.length > 0 && (
        <p className="flex items-center justify-center gap-2 t-cap text-ink/65 text-center mt-4">
          <LiveDot />
          <span><span className="sr-only">On the course: </span>{panel.players.map(p => `${p.name.split(/\s+/)[0]} thru ${p.thru}`).join(' · ')}</span>
        </p>
      )}
    </div>
  )
}

/**
 * The title's menu (D323, D340): under the stream's name, the way a social
 * app lists what it can show — headings, then the choices, the one shown
 * ticked. It springs out of the title and back into it (the pop-out,
 * `app/components/popOut.ts`). Above the chat, so nothing clips
 * it. Escape or a tap elsewhere closes it.
 */
function StreamMenu({ label, origin, onClose, children }: {
  label: string
  origin: HTMLElement
  onClose: () => void
  children: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    void popClose(box.current, origin).then(onClose)
  }, [origin, onClose])
  useLayoutEffect(() => { popOpen(box.current, origin) }, [origin])
  useEffect(() => {
    // A tap on the title too: it closes the menu it opened (the title only ever opens one).
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [close, origin])
  return (
    // A choice made closes it, back into the title.
    <div ref={box} role="menu" aria-label={label} onClick={e => { if ((e.target as HTMLElement).closest('[role^="menuitem"]')) close() }}
      className={`${cardClass('floating')} bg-surface absolute left-0 right-0 top-full mt-2 z-30 p-1 max-h-[60vh] overflow-y-auto`}>
      {children}
    </div>
  )
}
