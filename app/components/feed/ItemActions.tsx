'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askFeed } from '@/lib/feedClient'
import { OWN_STATUS_MAX, REACTIONS, REPORT_REASON_MAX, STATUS_MAX, counter, withReaction, type Reaction, type ReactionCount } from '@/lib/feed'
import { reducedMotion } from '@/lib/motion'
import { PUTT_EASING } from '@/lib/popOut'
import { IconDots, IconX } from '../icons'
import { FIELD, buttonClass } from '../ui'
import type { FeedView, ThreadComment } from './FeedItem'


type Summary = { reactions: ReactionCount[]; myReaction: Reaction | null }

/**
 * React to a message (D348): shown at once (`withReaction`), then sent; put
 * back as it was if the server says no, with its words. `next` the same as
 * yours takes it off.
 */
export async function reactTo(itemId: string, now: Summary, next: Reaction, patch: (s: Summary) => void): Promise<string | null> {
  const after = withReaction(now, next)
  patch(after)
  const r = await askFeed('react', { itemId, emoji: after.myReaction })
  if (r.ok) return null
  patch({ reactions: [...now.reactions], myReaction: now.myReaction })
  return r.error
}

/** The six in a row, yours in the emerald wash (D348) — the long-press bar's and the ⋯ sheet's. */
export function EmojiRow({ mine, onPick, className = '' }: { mine: Reaction | null; onPick: (e: Reaction) => void; className?: string }) {
  return (
    <div role="group" aria-label="React" className={`flex items-center justify-between gap-1 ${className}`}>
      {REACTIONS.map(e => (
        <button key={e} type="button" onClick={ev => { ev.stopPropagation(); onPick(e) }} aria-pressed={mine === e}
          aria-label={mine === e ? `Take your ${e} off` : `React ${e}`}
          className={`react-emoji w-11 h-11 rounded-full flex items-center justify-center text-[26px] leading-none press ch-focus ${mine === e ? 'bg-accent-tint' : ''}`}>
          <span aria-hidden="true">{e}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * A message's reactions, as WhatsApp hangs them on the bubble's foot (D348):
 * up to three emoji and the count, on a small opaque tag. A tap opens who
 * reacted with what. Changed while you watch, it pops.
 */
export function ReactionChip({ itemId, reactions, myReaction, onTake }: Summary & { itemId: string; onTake: () => void }) {
  const [who, setWho] = useState(false)
  const chip = useRef<HTMLButtonElement>(null)
  const sig = reactions.map(r => `${r.emoji}${r.count}`).join('')
  const was = useRef(sig)
  useEffect(() => {
    if (was.current === sig) return
    was.current = sig
    if (chip.current?.animate && !reducedMotion()) chip.current.animate([{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], { duration: 220, easing: PUTT_EASING })
  }, [sig])
  if (reactions.length === 0) return null
  const total = reactions.reduce((n, r) => n + r.count, 0)
  return (
    <>
      <button ref={chip} type="button" onClick={e => { e.stopPropagation(); setWho(true) }}
        aria-label={`Reactions: ${reactions.map(r => `${r.emoji} ${r.count}`).join(', ')}${myReaction ? `, yours ${myReaction}` : ''}`}
        className={`react-chip relative z-[2] -mt-2.5 mx-2 inline-flex items-center gap-0.5 h-7 px-1.5 rounded-tag bg-surface border shadow-raised press ch-focus ${myReaction ? 'border-accent' : 'border-line'}`}>
        <span aria-hidden="true" className="text-[15px] leading-none">{reactions.slice(0, 3).map(r => r.emoji).join('')}</span>
        {total > 1 && <span className="t-cap text-ink/80 tabular-nums pl-0.5">{total}</span>}
      </button>
      {who && <ReactionsSheet itemId={itemId} onClose={() => setWho(false)} onTake={() => { setWho(false); onTake() }} />}
    </>
  )
}

/** Who reacted with what (D348), your own first — tapped, it comes off. */
function ReactionsSheet({ itemId, onClose, onTake }: { itemId: string; onClose: () => void; onTake: () => void }) {
  const [people, setPeople] = useState<{ name: string; emoji: Reaction; mine: boolean }[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    void askFeed<{ people: { name: string; emoji: Reaction; mine: boolean }[] }>('reactions', { itemId }).then(r => {
      if (!live) return
      if (r.ok) setPeople(r.people)
      else setError(r.error)
    })
    return () => { live = false }
  }, [itemId])
  return (
    <Sheet title="Reactions" onClose={onClose}>
      {!people && !error && <div className="skeleton h-28 rounded-card mt-3" aria-busy="true" />}
      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
      {people && (
        <ul className="mt-2 divide-y divide-line">
          {people.map((p, i) => (
            <li key={i}>
              {p.mine ? (
                <button type="button" onClick={onTake} className="w-full flex items-center gap-3 min-h-14 text-left press ch-focus">
                  <span className="flex-1 min-w-0"><span className="block text-[16px] text-ink">You</span><span className="block t-cap text-ink/65">Tap to take it off</span></span>
                  <span aria-hidden="true" className="text-[24px]">{p.emoji}</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 min-h-14">
                  <span className="flex-1 min-w-0 text-[16px] text-ink truncate">{p.name}</span>
                  <span aria-label={`reacted ${p.emoji}`} className="text-[24px]">{p.emoji}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

/**
 * The ⋯ on an item (D299, D303, D325, D328): Report (never your own), your
 * card's status to edit, your own status to edit or delete, a club post to
 * take down for its poster and the club's Officers and Clubhouse. A sheet,
 * never a dropdown: a menu inside the swipe frame would be clipped.
 */
export function MoreMenu({ item, onPatch, onGone, onReply, onReact, className = '' }: {
  item: FeedView
  onPatch: (p: Partial<FeedView>) => void
  onGone: () => void
  /** D346: Reply, for anybody who would rather not swipe. */
  onReply?: () => void
  /** D348: the six at the head of the sheet, for anybody who would rather not hold. */
  onReact?: (e: Reaction) => void
  className?: string
}) {
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<'report' | 'status' | null>(null)
  const [error, setError] = useState('')
  const items = [
    ...(onReply ? [{ key: 'reply', label: 'Reply' }] : []),
    ...((item.kind === 'card' || item.kind === 'status') && item.mine ? [{ key: 'status', label: item.kind === 'status' ? 'Edit your status' : item.status ? 'Edit your status' : 'Add a status' }] : []),
    ...((item.kind === 'status' || item.kind === 'post') && item.canDelete ? [{ key: 'delete', label: item.kind === 'post' ? 'Take this post down' : 'Delete this status' }] : []),
    ...(item.canReport ? [{ key: 'report', label: 'Report' }] : []),
  ]
  if (items.length === 0 && !onReact) return null

  async function pick(key: string) {
    if (key === 'reply') { setMenu(false); onReply?.() }
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
          {onReact && <EmojiRow mine={item.myReaction} onPick={e => { setMenu(false); onReact(e) }} className="mt-3 pb-3 border-b border-line" />}
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

/**
 * The ⋯ on a reply in the chat (D346): Reply, Delete (its author, or the
 * owner of what it is on — D301) and Report (never your own).
 */
export function ReplyMenu({ reply, onReply, onGone, onReact }: { reply: ThreadComment; onReply?: () => void; onGone: () => void; onReact?: (e: Reaction) => void }) {
  const [menu, setMenu] = useState(false)
  const [report, setReport] = useState(false)
  const [error, setError] = useState('')
  const items = [
    ...(onReply ? [{ key: 'reply', label: 'Reply' }] : []),
    ...(reply.canDelete ? [{ key: 'delete', label: 'Delete this reply' }] : []),
    ...(reply.canReport ? [{ key: 'report', label: 'Report' }] : []),
  ]
  if (items.length === 0 && !onReact) return null
  async function pick(key: string) {
    if (key === 'reply') { setMenu(false); onReply?.() }
    if (key === 'report') { setMenu(false); setReport(true) }
    if (key === 'delete') {
      setError('')
      const r = await askFeed('comment.delete', { id: reply.id })
      if (!r.ok) { setError(r.error); return }
      setMenu(false)
      onGone()
    }
  }
  return (
    <>
      <button type="button" aria-label="More" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setMenu(true) }}
        className="!w-9 !h-9 w-11 h-11 rounded-full flex items-center justify-center text-ink/65 press ch-focus flex-shrink-0">
        <IconDots size={20} />
      </button>
      {menu && (
        <Sheet title={reply.mine ? 'Your reply' : `${reply.name}’s reply`} onClose={() => setMenu(false)}>
          {onReact && <EmojiRow mine={reply.myReaction} onPick={e => { setMenu(false); onReact(e) }} className="mt-3 pb-3 border-b border-line" />}
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
      {report && <ReportSheet item={reply} onClose={() => setReport(false)} />}
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
export function ReportSheet({ item, onClose }: { item: Pick<FeedView, 'id'>; onClose: () => void }) {
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
