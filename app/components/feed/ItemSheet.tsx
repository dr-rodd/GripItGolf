'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askFeed } from '@/lib/feedClient'
import { COMMENT_MAX, ago, contextLine } from '@/lib/feed'
import { reducedMotion } from '@/lib/motion'
import { SHEET_OPEN_MS, SHEET_CLOSE_MS, openKeyframes } from '@/lib/sheetMotion'
import { IconX } from '../icons'
import { FIELD, buttonClass } from '../ui'
import { CardFigures, type FeedView } from './FeedItem'
import { DotButton, MoreMenu, ReportSheet } from './ItemActions'

type Comment = { id: string; name: string; text: string; at: string; mine: boolean; canDelete: boolean; canReport: boolean }
type Hole = { number: number; par: number; si: number | null; gross: number | null; net: number | null; points: number | null }
type Detail = { holes: Hole[]; course: string | null; tees: string | null; handicap: number | null }

/** The putt curve as the Web Animations API takes it — `--gd-ease`, which a script cannot read. */
const PUTT = 'cubic-bezier(0.16, 1, 0.3, 1)'

/**
 * An item opened (D330, M11, M12): the card grows out of where it sat into
 * this sheet — its scorecard (holes, gross, net, points), then its comments
 * oldest first, then a comment box held just above the keyboard, and the
 * dot. Closed by a swipe down, a tap outside, the ✕ or Escape.
 *
 * **The opening is the one settle the site allows** (D331, amending D8): the
 * sheet travels from the card's own place on the putt curve and lands a
 * hair past it — at most 2% — before it rests, all inside 400ms
 * (`lib/sheetMotion.ts`, held by test:branding). No library: the browser's
 * own Web Animations. Under Reduce Motion, a plain fade.
 */
export default function ItemSheet({ item, origin, onClose, onPatch, onGone }: {
  item: FeedView
  /** Where the item sat when it was tapped — the sheet grows out of it. */
  origin: HTMLElement | null
  onClose: () => void
  onPatch: (p: Partial<FeedView>) => void
  onGone: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [detail, setDetail] = useState<Detail | null | 'none'>(item.kind === 'card' ? null : 'none')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState<Comment | null>(null)
  const [keyboard, setKeyboard] = useState(0)
  const closing = useRef(false)
  const now = new Date()

  // Read once, on opening: the comments, and a card's holes.
  useEffect(() => {
    let live = true
    void askFeed<{ comments: Comment[] }>('comments', { itemId: item.id }).then(r => {
      if (!live) return
      if (!r.ok) { setError(r.error); setComments([]); return }
      setComments(r.comments)
    })
    if (item.kind === 'card') {
      void askFeed<{ detail: Detail | null }>('card.detail', { itemId: item.id }).then(r => {
        if (live) setDetail(r.ok && r.detail ? r.detail : 'none')
      })
    }
    return () => { live = false }
  }, [item.id, item.kind])

  // The opening (M12): from the card's place, the one settle; a fade under Reduce Motion.
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
    if (reducedMotion() || !origin || !el.animate) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' })
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
    backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SHEET_CLOSE_MS, easing: 'ease-out', fill: 'forwards' })
    const anim = reducedMotion()
      ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' })
      : el.animate([{ transform: el.style.transform || 'translateY(0)' }, { transform: 'translateY(100%)' }], { duration: SHEET_CLOSE_MS, easing: PUTT, fill: 'forwards' })
    anim.onfinish = () => onClose()
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    // The page under the sheet stays where it was.
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

  // A swipe down on the sheet's head closes it; short of the line, it settles back.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return
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
    // The newest comment is the last: bring it into view.
    requestAnimationFrame(() => panel.current?.querySelector('[data-comments-end]')?.scrollIntoView({ block: 'end', behavior: reducedMotion() ? 'auto' : 'smooth' }))
  }

  async function remove(c: Comment) {
    const r = await askFeed('comment.delete', { id: c.id })
    if (!r.ok) { setError(r.error); return }
    tell((comments ?? []).filter(x => x.id !== c.id))
  }

  const title = item.kind === 'card' ? `${item.name}’s card` : item.kind === 'post' ? item.line || 'Club notice' : item.name

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={backdrop} className="absolute inset-0 bg-ink/40" onClick={close} />
      <div ref={panel}
        className="absolute inset-x-0 mx-auto max-w-lg paper rounded-t-card shadow-floating flex flex-col overflow-hidden"
        style={{ bottom: keyboard, maxHeight: `calc(100dvh - ${keyboard}px - 24px)`, transformOrigin: 'top left' }}>
        {/* The head: a handle to swipe down, the title, the ⋯ and the ✕. */}
        <div className="px-4 pt-2 pb-2 touch-none select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span aria-hidden="true" className="block mx-auto w-10 h-1 rounded-full bg-line-strong" />
          <div className="flex items-center gap-1 mt-2">
            <div className="flex-1 min-w-0">
              <h2 className="t-card text-ink break-words">{title}</h2>
              {item.kind === 'card' && item.line && <p className="t-cap text-ink/65 break-words">{item.line}</p>}
            </div>
            <MoreMenu item={item} onPatch={onPatch} onGone={() => { onGone(); close() }} />
            <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink press ch-focus flex-shrink-0">
              <IconX size={22} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
          {item.status && <p className="t-body text-ink break-words">{item.status}</p>}
          {item.kind === 'post' && item.text && (
            <div className="space-y-2">{item.text.split(/\n{2,}/).map((p, i) => <p key={i} className="t-body text-ink break-words whitespace-pre-line">{p}</p>)}</div>
          )}
          {item.kind === 'post' && item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center t-label text-accent-deep press ch-focus break-all">{item.link}</a>
          )}
          {item.kind !== 'card' && item.kind !== 'post' && item.kind !== 'status' && <p className="t-label text-ink break-words">{item.line}</p>}

          {item.kind === 'card' && (
            <>
              <CardFigures item={item} />
              {detail === null && <div className="skeleton h-28 rounded-tile mt-3" aria-busy="true" />}
              {detail && detail !== 'none' && <Scorecard detail={detail} />}
            </>
          )}

          <h3 className="t-label text-ink/80 mt-6">Comments</h3>
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

        {/* The comment box, held above the keyboard (M11), with the dot beside it. */}
        <form className="border-t border-line px-4 pt-2 flex items-center gap-2 paper"
          style={{ paddingBottom: keyboard ? 8 : 'max(env(safe-area-inset-bottom), 8px)' }}
          onSubmit={e => { e.preventDefault(); void send() }}>
          <DotButton item={item} onPatch={onPatch} />
          <label htmlFor="sheet-comment" className="sr-only">Add a comment</label>
          <input id="sheet-comment" type="text" value={text} maxLength={COMMENT_MAX} onChange={e => setText(e.target.value)}
            className={`${FIELD} flex-1 min-w-0 rounded-field`} placeholder="Add a comment" autoComplete="off" enterKeyHint="send" />
          <button type="submit" disabled={busy || !text.trim()} className={buttonClass('primary', false, true)}>{busy ? '…' : 'Send'}</button>
        </form>
      </div>
      {reporting && <ReportSheet item={{ id: reporting.id, kind: 'comment' } as FeedView} onClose={() => setReporting(null)} />}
    </div>,
    document.body,
  )
}

/**
 * The card, hole by hole (D330): two nines across, par, gross, net and
 * points, each nine's total. Dense — 13px, 4px cells — in Bespoke Serif for
 * the figures, as every scorecard on the site reads.
 */
function Scorecard({ detail }: { detail: Detail }) {
  const nines = [detail.holes.filter(h => h.number <= 9), detail.holes.filter(h => h.number > 9)].filter(n => n.length > 0)
  const sum = (hs: Hole[], k: 'par' | 'gross' | 'net' | 'points') => {
    const v = hs.map(h => h[k])
    return v.every(x => x != null) ? v.reduce((a, b) => (a as number) + (b as number), 0) : null
  }
  const rows: { k: 'par' | 'gross' | 'net' | 'points'; label: string }[] = [
    { k: 'par', label: 'Par' }, { k: 'gross', label: 'Gross' }, { k: 'net', label: 'Net' }, { k: 'points', label: 'Pts' },
  ]
  return (
    <div className="mt-3">
      <p className="t-cap text-ink/65">
        {contextLine({ course: detail.course, round: detail.tees ? `${detail.tees} tees` : null })}{detail.handicap != null ? ` · plays off ${detail.handicap}` : ''}
      </p>
      {nines.map((nine, i) => (
        <div key={i} className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums border-collapse">
            <caption className="sr-only">{i === 0 ? 'Front nine' : 'Back nine'}</caption>
            <thead>
              <tr className="text-ink/65">
                <th scope="col" className="text-left font-normal px-1 py-1">Hole</th>
                {nine.map(h => <th key={h.number} scope="col" className="font-normal px-1 py-1 text-center">{h.number}</th>)}
                <th scope="col" className="font-semibold px-1 py-1 text-center">{i === 0 && nines.length > 1 ? 'Out' : nines.length > 1 ? 'In' : 'Tot'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.k} className="border-t border-line">
                  <th scope="row" className="text-left font-normal text-ink/80 px-1 py-1">{r.label}</th>
                  {nine.map(h => (
                    <td key={h.number} className={`px-1 py-1 text-center font-serif ${r.k === 'par' ? 'text-ink/65' : 'text-ink'}`}>{h[r.k] ?? '–'}</td>
                  ))}
                  <td className="px-1 py-1 text-center font-serif font-semibold text-ink">{sum(nine, r.k) ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
