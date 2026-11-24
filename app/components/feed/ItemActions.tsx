'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { askFeed } from '@/lib/feedClient'
import { OWN_STATUS_MAX, REPORT_REASON_MAX, STATUS_MAX, counter } from '@/lib/feed'
import { IconDots, IconX } from '../icons'
import { FIELD, buttonClass } from '../ui'
import type { FeedView } from './FeedItem'


/** The one-tap dot (D301): a dot, filled once you have given it, and the count in the emerald. */
export function DotButton({ item, onPatch }: { item: FeedView; onPatch: (p: Partial<FeedView>) => void }) {
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
    <button type="button" disabled={busy} onClick={e => { e.stopPropagation(); void tap() }} aria-pressed={item.dotted}
      aria-label={item.dotted ? `Take your dot off (${item.dots})` : `Give a dot (${item.dots})`}
      className="inline-flex items-center gap-1.5 min-h-11 pr-2 press ch-focus rounded-tile">
      <span aria-hidden="true" className={`dot-give w-3.5 h-3.5 rounded-full border-2 border-accent-deep ${item.dotted ? 'bg-accent-deep is-on' : ''}`} />
      <span className="t-label text-accent-deep">{item.dots > 0 ? item.dots : 'Dot'}</span>
    </button>
  )
}

/**
 * The ⋯ on an item (D299, D303, D325, D328): Report (never your own), your
 * card's status to edit, your own status to edit or delete, a club post to
 * take down for its poster and the club's Officers and Clubhouse. A sheet,
 * never a dropdown: a menu inside the swipe frame would be clipped.
 */
export function MoreMenu({ item, onPatch, onGone, className = '' }: {
  item: FeedView
  onPatch: (p: Partial<FeedView>) => void
  onGone: () => void
  className?: string
}) {
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<'report' | 'status' | null>(null)
  const [error, setError] = useState('')
  const items = [
    ...((item.kind === 'card' || item.kind === 'status') && item.mine ? [{ key: 'status', label: item.kind === 'status' ? 'Edit your status' : item.status ? 'Edit your status' : 'Add a status' }] : []),
    ...((item.kind === 'status' || item.kind === 'post') && item.canDelete ? [{ key: 'delete', label: item.kind === 'post' ? 'Take this post down' : 'Delete this status' }] : []),
    ...(item.canReport ? [{ key: 'report', label: 'Report' }] : []),
  ]
  if (items.length === 0) return null

  async function pick(key: string) {
    if (key === 'report') { setMenu(false); setSheet('report') }
    if (key === 'status') { setMenu(false); setSheet('status') }
    if (key === 'delete') {
      setError('')
      const r = await askFeed('item.delete', { itemId: item.id })
      if (!r.ok) { setError(r.error); return }
      setMenu(false)
      onGone()
    }
  }
  return (
    <>
      <button type="button" aria-label="More" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setMenu(true) }}
        className={`w-11 h-11 rounded-full flex items-center justify-center text-ink/65 press ch-focus flex-shrink-0 ${className}`}>
        <IconDots size={20} />
      </button>
      {menu && (
        <Sheet title={item.kind === 'card' ? `${item.name}’s card` : item.kind === 'post' ? 'This post' : 'This item'} onClose={() => setMenu(false)}>
          <ul className="mt-2 divide-y divide-line">
            {items.map(m => (
              <li key={m.key}>
                <button type="button" onClick={() => void pick(m.key)}
                  className={`w-full text-left min-h-14 text-[17px] press ch-focus ${m.key === 'report' || m.key === 'delete' ? 'text-rust-deep' : 'text-ink'}`}>{m.label}</button>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
        </Sheet>
      )}
      {sheet === 'report' && <ReportSheet item={item} onClose={() => setSheet(null)} />}
      {sheet === 'status' && <StatusSheet item={item} onClose={() => setSheet(null)} onSaved={status => { onPatch({ status }); setSheet(null) }} />}
    </>
  )
}

/** A sheet over the page — the club notes' own pattern, portalled past the footer. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
export function ReportSheet({ item, onClose }: { item: FeedView; onClose: () => void }) {
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
  // A card's status is 140 (D299); one on its own 280 (D328), and never emptied — it is deleted instead.
  const max = item.kind === 'status' ? OWN_STATUS_MAX : STATUS_MAX
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
      <input id="edit-status" type="text" value={text} maxLength={max} onChange={e => setText(e.target.value)} className={`${FIELD} mt-3`} autoComplete="off" placeholder={item.kind === 'status' ? 'What’s happening?' : 'How did it go?'} />
      <p className="t-cap text-ink/65 mt-1.5 text-right">{counter(text, max)}</p>
      {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void save(text)} className={`${buttonClass('primary')} mt-4`}>{busy ? 'Saving…' : 'Save'}</button>
      {item.status && item.kind === 'card' && (
        <button type="button" disabled={busy} onClick={() => void save('')} className={`${buttonClass('quiet')} mt-2 w-full`}>Delete the status</button>
      )}
    </Sheet>
  )
}
