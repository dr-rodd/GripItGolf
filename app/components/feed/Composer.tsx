'use client'

import { useState } from 'react'
import { askFeed } from '@/lib/feedClient'
import { OWN_STATUS_MAX, POST_MAX, counter } from '@/lib/feed'
import { FIELD, FIELD_LABEL, buttonClass, chipClass } from '../ui'
import { Sheet } from './ItemActions'
import StreamName from './StreamName'

/**
 * Post a status (D328, M9): a status on its own, up to 280, into
 * friends.stream or a match stream the member follows (none until interclub
 * teams exist — D332). Never club.stream (the club's word only) or
 * comp.stream (the cards are its content). The status at signing is a
 * different box, on the sign step, and stays as it was (D299, D306).
 */
export function StatusComposer({ follows, onPosted, onClose }: {
  follows: { key: string; label: string }[]
  onPosted: (stream: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [stream, setStream] = useState('friends')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const over = [...text].length > OWN_STATUS_MAX
  async function post() {
    setBusy(true); setError('')
    const r = await askFeed<{ id: string }>('status.post', { text, stream })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onPosted(stream)
  }
  return (
    <Sheet title="Post a status" onClose={onClose}>
      {follows.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3" role="radiogroup" aria-label="Where it goes">
          {[{ key: 'friends', label: '' }, ...follows].map(s => (
            <button key={s.key} type="button" role="radio" aria-checked={stream === s.key} onClick={() => setStream(s.key)} className={chipClass(stream === s.key, true)}>
              <StreamName kind={s.key === 'friends' ? 'friends' : 'match'} />{s.label && s.key !== 'friends' ? ` · ${s.label}` : ''}
            </button>
          ))}
        </div>
      )}
      {follows.length === 0 && <p className="t-cap text-ink/65 mt-2">Into <StreamName kind="friends" /> — your friends see it.</p>}
      <label htmlFor="status-text" className="sr-only">Your status</label>
      <textarea id="status-text" value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus
        className={`${FIELD} mt-3 resize-none`} placeholder="What’s happening?" />
      <p className={`t-cap mt-1.5 text-right ${over ? 'text-rust-deep' : 'text-ink/65'}`}>{counter(text, OWN_STATUS_MAX)}</p>
      {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
      <button type="button" disabled={busy || !text.trim() || over} onClick={() => void post()} className={`${buttonClass('primary')} mt-4`}>
        {busy ? 'Posting…' : 'Post'}
      </button>
    </Sheet>
  )
}

/**
 * Post to club.stream (D325, M5): the club's official word — a notice, the
 * newsletter, anything the club publishes. Its Officers and Clubhouse
 * holders only (lib/clubMay.ts `post_club_stream`). Words up to 1,000 with
 * their paragraphs, an optional heading and one link. No images (Ross, 24
 * Nov 2026: the overheads).
 */
export function ClubPostComposer({ clubId, onPosted, onClose }: {
  clubId: string
  onPosted: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const over = [...text].length > POST_MAX
  async function post() {
    setBusy(true); setError('')
    const r = await askFeed<{ id: string }>('post.club', { clubId, title, text, link })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onPosted()
  }
  return (
    <Sheet title="Post to the club" onClose={onClose}>
      <p className="t-cap text-ink/65 mt-1">Into <StreamName kind="club" /> — everybody on the club’s list sees it.</p>
      <label htmlFor="post-title" className={`${FIELD_LABEL} mt-4`}>Heading <span className="t-cap text-ink/65">· optional</span></label>
      <input id="post-title" type="text" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} className={FIELD} autoComplete="off" placeholder="Course update" />
      <label htmlFor="post-text" className={`${FIELD_LABEL} mt-4`}>What does the club want to say?</label>
      <textarea id="post-text" value={text} onChange={e => setText(e.target.value)} rows={6} className={`${FIELD} resize-y`} />
      <p className={`t-cap mt-1.5 text-right ${over ? 'text-rust-deep' : 'text-ink/65'}`}>{counter(text, POST_MAX)}</p>
      <label htmlFor="post-link" className={`${FIELD_LABEL} mt-2`}>Link <span className="t-cap text-ink/65">· optional</span></label>
      <input id="post-link" type="url" inputMode="url" value={link} onChange={e => setLink(e.target.value)} className={FIELD} autoComplete="off" placeholder="https://" />
      {error && <p role="alert" className="t-cap text-rust-deep mt-2">{error}</p>}
      <button type="button" disabled={busy || !text.trim() || over} onClick={() => void post()} className={`${buttonClass('primary')} mt-5`}>
        {busy ? 'Posting…' : 'Post'}
      </button>
    </Sheet>
  )
}
