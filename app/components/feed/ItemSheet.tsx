'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askFeed } from '@/lib/feedClient'
import { COMMENT_MAX, ago } from '@/lib/feed'
import { reducedMotion } from '@/lib/motion'
import { SHEET_CLOSE_MS, SHEET_OPEN_MS, closeKeyframes, openKeyframes } from '@/lib/sheetMotion'
import { SC_CARD } from '../scorecardStyle'
import { IconX } from '../icons'
import { FIELD, buttonClass } from '../ui'
import type { FeedView } from './FeedItem'
import { DotButton, MoreMenu, ReportSheet } from './ItemActions'

type Comment = { id: string; name: string; text: string; at: string; mine: boolean; canDelete: boolean; canReport: boolean }
type Detail = {
  player: { id: string; name: string; handicap: number | null; gender: string }
  round: { id: string; round_number: number; courses: { id: string; name: string } }
  holes: { id: string; hole_number: number; par: number; stroke_index: number; course_id: string; par_ladies?: number | null; stroke_index_ladies?: number | null }[]
  resolved: { playerId: string; roundId: string; holeId: string; holeNumber: number; gross: number | null; points: number; noReturn: boolean; live: boolean }[]
  handicap: number | null
}

/** The putt curve as the Web Animations API takes it — `--gd-ease`, which a script cannot read. */
const PUTT = 'cubic-bezier(0.16, 1, 0.3, 1)'

/**
 * The trip's own pop-up scorecard (`ScorecardSheet`), loaded only when a card
 * is first opened — and warmed by the Stream tab once it is idle (`warmCard`),
 * so the pop-out never waits on it. One card for the whole site (D334): the
 * stream draws no second copy.
 */
type CardComponent = typeof import('@/app/golf/[root]/[tripCode]/leaderboard/TripLeaderboardClient').ScorecardSheet
let cardComponent: CardComponent | null = null
let cardLoading: Promise<CardComponent> | null = null
export function warmCard(): Promise<CardComponent> {
  if (cardComponent) return Promise.resolve(cardComponent)
  cardLoading ??= import('@/app/golf/[root]/[tripCode]/leaderboard/TripLeaderboardClient').then(m => (cardComponent = m.ScorecardSheet))
  return cardLoading
}

/**
 * An item popped out of the stream (D330, amended D334). A signed card is
 * **the trip's scorecard**, its title bar the player and the round — cream
 * rows, the colour-coded score shapes, Out, In and Total — and under it, in
 * the same card, the comments oldest first, a comment box held above the
 * keyboard, and the dot. A status, a post or a result is the same card with
 * its own words in place of the scorecard. Closed by a swipe down on its
 * handle, a tap outside, the ✕ or Escape.
 *
 * **It grows out of the tile** the way X's menus do (Ross, 24 Nov 2026): soft
 * and blurred as it leaves the tile, sharp as it lands a hair past its place
 * and rests — about a fifth of a second (`lib/sheetMotion.ts`, the site's one
 * settle, D331, held by test:branding). It shrinks back into the tile when
 * closed. No library: the browser's Web Animations. Reduce Motion: a fade.
 */
export default function ItemSheet({ item, origin, onClose, onPatch, onGone }: {
  item: FeedView
  /** The tile it was opened from — the card grows out of it and goes back into it. */
  origin: HTMLElement | null
  onClose: () => void
  onPatch: (p: Partial<FeedView>) => void
  onGone: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const isCard = item.kind === 'card'
  const [detail, setDetail] = useState<Detail | null | 'none'>(isCard ? null : 'none')
  const [Card, setCard] = useState<CardComponent | null>(() => cardComponent)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState<Comment | null>(null)
  const [keyboard, setKeyboard] = useState(0)
  const closing = useRef(false)
  const now = new Date()

  // Read once, on opening: the comments, and a card's scorecard.
  useEffect(() => {
    let live = true
    void askFeed<{ comments: Comment[] }>('comments', { itemId: item.id }).then(r => {
      if (!live) return
      if (!r.ok) { setError(r.error); setComments([]); return }
      setComments(r.comments)
    })
    if (isCard) {
      void askFeed<{ detail: Detail | null }>('card.detail', { itemId: item.id }).then(r => {
        if (live) setDetail(r.ok && r.detail ? r.detail : 'none')
      })
      if (!cardComponent) void warmCard().then(c => { if (live) setCard(() => c) }).catch(() => { if (live) setDetail('none') })
    }
    return () => { live = false }
  }, [item.id, isCard])

  // The opening (M12, D334): out of the tile, soft to sharp, the one settle; a fade under Reduce Motion.
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    backdrop.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: SHEET_OPEN_MS, easing: 'ease-out' })
    if (reducedMotion() || !origin || !el.animate) {
      el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' })
      return
    }
    const from = origin.getBoundingClientRect()
    const to = el.getBoundingClientRect()
    if (!to.width || !to.height) return
    el.animate(openKeyframes(from, to), { duration: SHEET_OPEN_MS, easing: PUTT })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    const el = panel.current
    if (!el?.animate) { onClose(); return }
    backdrop.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: SHEET_CLOSE_MS, easing: 'ease-out', fill: 'forwards' })
    let anim: Animation
    if (reducedMotion()) {
      anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' })
    } else {
      // Back into the tile it came out of, if it is still on screen.
      const tile = origin && origin.isConnected ? origin.getBoundingClientRect() : null
      const seen = tile && tile.bottom > 0 && tile.top < window.innerHeight ? tile : null
      el.style.transform = ''
      anim = el.animate(closeKeyframes(seen, el.getBoundingClientRect()), { duration: SHEET_CLOSE_MS, easing: PUTT, fill: 'forwards' })
    }
    anim.onfinish = () => onClose()
  }, [onClose, origin])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    // The page under the card stays where it was.
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = was }
  }, [close])

  // The comment box sits on the keyboard, never under it (M11).
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const fit = () => setKeyboard(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) }
  }, [])

  // A swipe down on the handle closes it; short of the line, it settles back.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    const el = panel.current
    if (!d || !el) return
    d.dy = Math.max(0, e.clientY - d.y)
    el.style.transform = `translateY(${d.dy}px)`
  }
  const onUp = () => {
    const d = drag.current
    const el = panel.current
    drag.current = null
    if (!d || !el) return
    const speed = d.dy / Math.max(1, performance.now() - d.t)
    if (d.dy > 110 || speed > 0.7) { close(); return }
    if (d.dy > 0 && el.animate && !reducedMotion()) el.animate([{ transform: `translateY(${d.dy}px)` }, { transform: 'translateY(0)' }], { duration: 200, easing: PUTT })
    el.style.transform = ''
  }

  const tell = (next: Comment[]) => {
    setComments(next)
    const names: { name: string; mine: boolean }[] = []
    for (const c of [...next].reverse()) if (!names.some(n => n.name === c.name)) names.push({ name: c.name, mine: c.mine })
    const lead = names[0]
    onPatch({
      comments: next.length,
      latest: next.length ? { name: next[next.length - 1].name, text: next[next.length - 1].text } : null,
      commentLine: lead ? {
        count: `${next.length} comment${next.length === 1 ? '' : 's'}`,
        who: `${lead.mine ? 'You' : lead.name}${names.length > 1 ? ` and ${names.length - 1} other${names.length === 2 ? '' : 's'}` : ''}`,
      } : null,
    })
  }

  async function send() {
    const t = text.trim()
    if (!t) return
    setBusy(true); setError('')
    const r = await askFeed<{ comment: Comment }>('comment', { itemId: item.id, text: t })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setText('')
    tell([...(comments ?? []), r.comment])
    requestAnimationFrame(() => panel.current?.querySelector('[data-comments-end]')?.scrollIntoView({ block: 'end', behavior: reducedMotion() ? 'auto' : 'smooth' }))
  }

  async function remove(c: Comment) {
    const r = await askFeed('comment.delete', { id: c.id })
    if (!r.ok) { setError(r.error); return }
    tell((comments ?? []).filter(x => x.id !== c.id))
  }

  const title = isCard ? item.name : item.kind === 'post' ? item.line || 'Club notice' : item.name
  const handle = (
    <div className="flex-shrink-0 pt-2 pb-1 flex justify-center touch-none cursor-grab"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden="true">
      <span className="block w-10 h-1 rounded-full bg-line-strong" />
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={isCard ? `${item.name}’s card` : title}>
      <div ref={backdrop} className="absolute inset-0 bg-ink/50" onClick={close} />
      <div className="absolute inset-x-0 top-0 flex items-center justify-center p-3 pointer-events-none"
        style={{ bottom: keyboard, paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: keyboard ? 8 : 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div ref={panel} className={`${SC_CARD} pointer-events-auto relative w-full max-w-lg max-h-full flex flex-col overflow-hidden`}
          style={{ transformOrigin: 'top left' }}>
          {handle}

          {!isCard && <SheetTitle title={title} line="" onClose={close} />}

          {/* One scroll: a card's scorecard — the trip's own, its title bar the
              player and the round (D334) — then what was said, then the comments. */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {isCard && (
            detail && detail !== 'none' && Card ? (
              <Card bare inline title={item.name} subtitle={item.line}
                players={[detail.player]} round={detail.round} holes={detail.holes} resolved={detail.resolved}
                handicapFor={() => detail.handicap} onClose={close} />
            ) : (
              <>
                <SheetTitle title={item.name} line={item.line} onClose={close} />
                {detail === 'none'
                  ? <p className="t-cap text-ink/65 px-4 pb-3">The scorecard isn’t to hand — the comments are below.</p>
                  : <div className="px-4 pb-3 space-y-2" aria-busy="true">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-9 rounded-tile" />)}</div>}
              </>
            )
          )}

          <div className={`px-4 pb-3 ${isCard ? 'border-t border-line' : ''}`}>
            {item.status && <p className="t-body text-ink break-words pt-3">{item.status}</p>}
            {item.kind === 'post' && item.text && (
              <div className="space-y-2 pt-3">{item.text.split(/\n{2,}/).map((p, i) => <p key={i} className="t-body text-ink break-words whitespace-pre-line">{p}</p>)}</div>
            )}
            {item.kind === 'post' && item.link && (
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center t-label text-accent-deep press ch-focus break-all">{item.link}</a>
            )}
            {!isCard && item.kind !== 'post' && item.kind !== 'status' && <p className="t-label text-ink break-words pt-3">{item.line}</p>}

            <h3 className="t-label text-ink/80 mt-4">Comments</h3>
            {!comments && <div className="space-y-2 mt-3">{[0, 1].map(i => <div key={i} className="skeleton h-12 rounded-tile" />)}</div>}
            {comments && comments.length === 0 && !error && <p className="t-cap text-ink/65 mt-2">No comments yet — say something.</p>}
            {comments && comments.length > 0 && (
              <ul className="mt-1 divide-y divide-line">
                {comments.map(c => (
                  <li key={c.id} className="py-3 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] leading-snug text-ink break-words"><span className="font-semibold">{c.mine ? 'You' : c.name}</span> {c.text}</p>
                      <p className="t-cap text-ink/65 mt-0.5">{ago(c.at, now)}</p>
                    </div>
                    {c.canDelete && <button type="button" onClick={() => void remove(c)} className="t-cap text-ink/65 min-h-11 px-1 press ch-focus">Delete</button>}
                    {c.canReport && <button type="button" onClick={() => setReporting(c)} className="t-cap text-ink/65 min-h-11 px-1 press ch-focus">Report</button>}
                  </li>
                ))}
              </ul>
            )}
            <span data-comments-end />
            {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
          </div>
          </div>

          {/* The comment box, held above the keyboard (M11), the dot and the ⋯ beside it. */}
          <form className="flex-shrink-0 border-t border-line px-3 py-2 flex items-center gap-2 bg-surface"
            onSubmit={e => { e.preventDefault(); void send() }}>
            <DotButton item={item} onPatch={onPatch} />
            <label htmlFor="sheet-comment" className="sr-only">Add a comment</label>
            <input id="sheet-comment" type="text" value={text} maxLength={COMMENT_MAX} onChange={e => setText(e.target.value)}
              className={`${FIELD} flex-1 min-w-0`} placeholder="Add a comment" autoComplete="off" enterKeyHint="send" />
            <button type="submit" disabled={busy || !text.trim()} className={buttonClass('primary', false, true)}>{busy ? '…' : 'Send'}</button>
            <MoreMenu item={item} onPatch={onPatch} onGone={() => { onGone(); close() }} />
          </form>
        </div>
      </div>
      {reporting && <ReportSheet item={{ id: reporting.id, kind: 'comment' } as FeedView} onClose={() => setReporting(null)} />}
    </div>,
    document.body,
  )
}

/** The card's title bar where there is no scorecard to carry it — the scorecard's own look (t-h2 and its line, the ✕). */
function SheetTitle({ title, line, onClose }: { title: string; line: string; onClose: () => void }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 pt-1 pb-3">
      <div className="min-w-0 flex items-baseline gap-3 flex-wrap">
        <p className="t-h2 text-ink break-words">{title}</p>
        {line && <p className="text-ink/65 text-base truncate">{line}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close"
        className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink/65 press ch-focus flex-shrink-0">
        <IconX size={22} />
      </button>
    </div>
  )
}
