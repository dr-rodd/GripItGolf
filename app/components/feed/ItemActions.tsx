'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askFeed } from '@/lib/feedClient'
import { COMMENT_MAX, REPORT_REASON_MAX, STATUS_MAX, ago, counter } from '@/lib/feed'
import { IconDots, IconX } from '../icons'
import { FIELD, buttonClass } from '../ui'
import type { FeedView } from './FeedItem'

type Comment = { id: string; name: string; text: string; at: string; mine: boolean; canDelete: boolean; canReport: boolean }

/** The one-tap dot (D301): a dot, filled once you have given it, and the count in the emerald. */
function DotButton({ item, onPatch }: { item: FeedView; onPatch: (p: Partial<FeedView>) => void }) {
  const [busy, setBusy] = useState(false)
  async function tap() {
    const on = !item.dotted
    setBusy(true)
    onPatch({ dotted: on, dots: Math.max(0, item.dots + (on ? 1 : -1)) })
    const r = await askFeed('dot', { itemId: item.id, on })
    setBusy(false)
    if (!r.ok) onPatch({ dotted: !on, dots: item.dots })
  }
  return (
    <button type="button" disabled={busy} onClick={() => void tap()} aria-pressed={item.dotted}
      aria-label={item.dotted ? `Take your dot off (${item.dots})` : `Give a dot (${item.dots})`}
      className="inline-flex items-center gap-1.5 min-h-11 pr-2 press ch-focus rounded-tile">
      <span aria-hidden="true" className={`w-3.5 h-3.5 rounded-full border-2 border-accent-deep ${item.dotted ? 'bg-accent-deep' : ''}`} />
      <span className="t-label text-accent-deep">{item.dots > 0 ? item.dots : 'Dot'}</span>
    </button>
  )
}

/**
 * What a reader can do with an item (D299, D301, D303): on a card, the dot,
 * its comments and the latest one; on anything, a ⋯ with Report (never your
 * own), and on your own card Edit status; on a comment, Delete for its
 * author or the card's owner.
 */
export function ItemActions({ item, onPatch, onGone, onOpenComments }: {
  item: FeedView
  onPatch: (p: Partial<FeedView>) => void
  onGone: () => void
  onOpenComments: (cardId: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<'report' | 'status' | null>(null)
  const isCard = item.kind === 'card'

  const menuItems = [
    ...(isCard && item.mine ? [{ key: 'status', label: item.status ? 'Edit your status' : 'Add a status' }] : []),
    ...(item.kind === 'comment' && item.canDelete ? [{ key: 'delete', label: 'Delete this comment' }] : []),
    ...(item.canReport ? [{ key: 'report', label: 'Report' }] : []),
  ]

  async function pick(key: string) {
    setMenu(false)
    if (key === 'report') setSheet('report')
    if (key === 'status') setSheet('status')
    if (key === 'delete') {
      const r = await askFeed('comment.delete', { id: item.id })
      if (r.ok) onGone()
    }
  }

  // The ⋯ opens a sheet, never a dropdown: a menu inside the swipe frame would be clipped at its edge.
  const more = menuItems.length > 0 && (
    <button type="button" aria-label="More" aria-haspopup="dialog" onClick={() => setMenu(true)}
      className={`w-11 h-11 rounded-full flex items-center justify-center text-ink/65 press ch-focus flex-shrink-0 ${isCard ? 'ml-auto -mr-2' : ''}`}>
      <IconDots size={20} />
    </button>
  )
  const menuSheet = menu && (
    <Sheet title={isCard ? `${item.name}’s card` : 'This item'} onClose={() => setMenu(false)}>
      <ul className="mt-2 divide-y divide-line">
        {menuItems.map(m => (
          <li key={m.key}>
            <button type="button" onClick={() => void pick(m.key)}
              className={`w-full text-left min-h-14 text-[17px] press ch-focus ${m.key === 'report' || m.key === 'delete' ? 'text-rust-deep' : 'text-ink'}`}>{m.label}</button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
  // A one-line item: only its ⋯, on its own line — the words open the card's comments (FeedItem).
  if (!isCard) {
    return (
      <>
        {more}
        {menuSheet}
        {sheet === 'report' && <ReportSheet item={item} onClose={() => setSheet(null)} />}
      </>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3 mt-3 pt-1">
        <DotButton item={item} onPatch={onPatch} />
        <button type="button" onClick={() => onOpenComments(item.id)} className="t-label text-ink/80 min-h-11 press ch-focus rounded-tile">
          {item.comments === 0 ? 'Comment' : item.comments === 1 ? '1 comment' : `${item.comments} comments`}
        </button>
        {more}
      </div>
      {item.latest && (
        <button type="button" onClick={() => onOpenComments(item.id)} className="block w-full text-left t-cap text-ink/80 press ch-focus rounded-tile break-words">
          <span className="font-semibold text-ink">{item.latest.name}</span> {item.latest.text}
        </button>
      )}
      {menuSheet}
      {sheet === 'report' && <ReportSheet item={item} onClose={() => setSheet(null)} />}
      {sheet === 'status' && <StatusSheet item={item} onClose={() => setSheet(null)} onSaved={status => { onPatch({ status }); setSheet(null) }} />}
    </>
  )
}

/** A sheet over the page — the club notes' own pattern, portalled past the footer. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40 page-enter" />
      <div className="relative isolate paper rounded-t-sheet shadow-floating-up max-h-[88vh] overflow-y-auto sheet-up px-5 pt-5 overflow-x-hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <h2 className="t-h2 text-ink flex-1">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink press flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Report (D303): where it goes said before it is sent; nothing is hidden until somebody takes it down. */
function ReportSheet({ item, onClose }: { item: FeedView; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState('')
  async function send() {
    setState('busy'); setError('')
    const r = await askFeed<{ to: 'club' | 'green_dot' }>('report', { itemId: item.id, reason })
    if (!r.ok) { setState('idle'); setError(r.error); return }
    setState('sent')
  }
  return (
    <Sheet title="Report" onClose={onClose}>
      {state === 'sent' ? (
        <>
          <p className="t-body text-ink mt-3">Thanks — it’s been passed on.</p>
          <button type="button" onClick={onClose} className={`${buttonClass('secondary')} mt-5`}>Done</button>
        </>
      ) : (
        <>
          <p className="t-cap text-ink/80 mt-2">A club’s card goes to the club’s office; anything else to Green Dot. It stays up until they decide.</p>
          <label htmlFor="report-reason" className="block t-label text-ink/80 mt-4 mb-2">Why? <span className="t-cap text-ink/65">· optional</span></label>
          <input id="report-reason" type="text" value={reason} maxLength={REPORT_REASON_MAX} onChange={e => setReason(e.target.value)} className={FIELD} autoComplete="off" />
          {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
          <button type="button" disabled={state === 'busy'} onClick={() => void send()} className={`${buttonClass('danger')} mt-5`}>{state === 'busy' ? 'Sending…' : 'Report'}</button>
        </>
      )}
    </Sheet>
  )
}

/** Your own status, changed or taken off afterwards (D299). */
function StatusSheet({ item, onClose, onSaved }: { item: FeedView; onClose: () => void; onSaved: (status: string | null) => void }) {
  const [text, setText] = useState(item.status ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(next: string) {
    setBusy(true); setError('')
    const r = await askFeed<{ status: string | null }>('status.edit', { itemId: item.id, text: next })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved(r.status)
  }
  return (
    <Sheet title="Your status" onClose={onClose}>
      <label htmlFor="edit-status" className="sr-only">Your status</label>
      <input id="edit-status" type="text" value={text} maxLength={STATUS_MAX} onChange={e => setText(e.target.value)} className={`${FIELD} mt-3`} autoComplete="off" placeholder="How did it go?" />
      <p className="t-cap text-ink/65 mt-1.5 text-right">{counter(text)}</p>
      {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void save(text)} className={`${buttonClass('primary')} mt-4`}>{busy ? 'Saving…' : 'Save'}</button>
      {item.status && (
        <button type="button" disabled={busy} onClick={() => void save('')} className={`${buttonClass('quiet')} mt-2 w-full`}>Delete the status</button>
      )}
    </Sheet>
  )
}

/**
 * A card's comments (D301), oldest first, and a box to add one. Each a
 * delete for its author or the card's owner, and a report for anybody else.
 */
export function CommentsSheet({ cardId, title, onClose, onChanged }: { cardId: string; title: string; onClose: () => void; onChanged: (count: number, latest: { name: string; text: string } | null) => void }) {
  const [list, setList] = useState<Comment[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState<Comment | null>(null)
  const changed = useRef(onChanged)
  changed.current = onChanged
  const now = new Date()

  useEffect(() => {
    let live = true
    void askFeed<{ comments: Comment[] }>('comments', { itemId: cardId }).then(r => {
      if (!live) return
      if (!r.ok) { setError(r.error); setList([]); return }
      setList(r.comments)
    })
    return () => { live = false }
  }, [cardId])

  const tell = (next: Comment[]) => {
    setList(next)
    const last = next[next.length - 1]
    changed.current(next.length, last ? { name: last.name, text: last.text } : null)
  }

  async function send() {
    const t = text.trim()
    if (!t) return
    setBusy(true); setError('')
    const r = await askFeed<{ comment: Comment }>('comment', { itemId: cardId, text: t })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setText('')
    tell([...(list ?? []), r.comment])
  }

  async function remove(c: Comment) {
    const r = await askFeed('comment.delete', { id: c.id })
    if (!r.ok) { setError(r.error); return }
    tell((list ?? []).filter(x => x.id !== c.id))
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {!list && <div className="space-y-2 mt-4">{[0, 1].map(i => <div key={i} className="skeleton h-12 rounded-tile" />)}</div>}
      {list && list.length === 0 && !error && <p className="t-cap text-ink/65 mt-3">No comments yet.</p>}
      {list && list.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {list.map(c => (
            <li key={c.id} className="py-2 flex items-start gap-2">
              <p className="flex-1 min-w-0 text-[15px] text-ink break-words">
                <span className="font-semibold">{c.name}</span> {c.text}
                <span className="t-cap text-ink/65"> · {ago(c.at, now)}</span>
              </p>
              {c.canDelete && <button type="button" onClick={() => void remove(c)} className="t-cap text-ink/65 min-h-11 px-1 press ch-focus">Delete</button>}
              {c.canReport && <button type="button" onClick={() => setReporting(c)} className="t-cap text-ink/65 min-h-11 px-1 press ch-focus">Report</button>}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
      <form className="mt-4 flex items-end gap-2" onSubmit={e => { e.preventDefault(); void send() }}>
        <div className="flex-1 min-w-0">
          <label htmlFor="new-comment" className="sr-only">Add a comment</label>
          <input id="new-comment" type="text" value={text} maxLength={COMMENT_MAX} onChange={e => setText(e.target.value)} className={FIELD} placeholder="Add a comment" autoComplete="off" enterKeyHint="send" />
        </div>
        <button type="submit" disabled={busy || !text.trim()} className={buttonClass('primary', false)}>{busy ? '…' : 'Send'}</button>
      </form>
      {reporting && (
        <ReportSheet item={{ id: reporting.id, kind: 'comment' } as FeedView} onClose={() => setReporting(null)} />
      )}
    </Sheet>
  )
}
