'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { askFeed } from '@/lib/feedClient'
import { IconPlus, IconX } from '../icons'
import { buttonClass } from '../ui'

type StreamView = { key: string; kind: 'friends' | 'club' | 'comp' | 'team'; label: string; empty: string }

const ABOUT: Record<StreamView['kind'], string> = {
  friends: 'Your friends’ signed cards',
  club: 'The club’s competitions — shown only in its area',
  comp: 'A comp you’re in, or your club’s — pick from the recent ones',
  team: 'Your interclub team',
}

/**
 * The streams page (D300): the + at the end of the pill row. The member's
 * streams, each taken off with its ✕, then the ones they could add — kept
 * on the account, so every phone signed in to it agrees. Team waits for the
 * club's interclub teams and says so.
 */
export default function StreamsSheet({ streams, offered, here, onClose, onSaved }: {
  streams: StreamView[]
  offered: StreamView[]
  here: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [list, setList] = useState(streams)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const kept = new Set(list.map(s => s.key))
  const addable = offered.filter(s => !kept.has(s.key))
  const changed = list.map(s => s.key).join('|') !== streams.map(s => s.key).join('|')

  async function save() {
    setBusy(true); setError('')
    const r = await askFeed('streams', { streams: list.map(s => s.key) })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved()
  }

  const note = (s: StreamView) => s.kind === 'club' && here && s.key !== `club:${here}` ? 'Shown in that club’s area' : ABOUT[s.kind]

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby="streams-title" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40 page-enter" />
      <div className="relative isolate paper rounded-t-sheet shadow-floating-up max-h-[88vh] overflow-y-auto sheet-up px-5 pt-5 overflow-x-hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <h2 id="streams-title" className="t-h2 text-ink flex-1">Your streams</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink press flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {list.length === 0 && <li className="py-3 t-cap text-ink/65">None — add one below.</li>}
          {list.map(s => (
            <li key={s.key} className="flex items-center gap-3 min-h-14 py-1">
              <span className="flex-1 min-w-0">
                <span className="block text-[17px] font-medium text-ink truncate">{s.label}</span>
                <span className="block t-cap text-ink/65">{note(s)}</span>
              </span>
              <button type="button" aria-label={`Take ${s.label} off`} onClick={() => setList(l => l.filter(x => x.key !== s.key))}
                className="w-11 h-11 rounded-full flex items-center justify-center text-ink/65 press ch-focus flex-shrink-0">
                <IconX size={20} />
              </button>
            </li>
          ))}
        </ul>
        {addable.length > 0 && (
          <>
            <h3 className="t-label text-ink/80 mt-5">Add a stream</h3>
            <ul className="mt-1 divide-y divide-line">
              {addable.map(s => (
                <li key={s.key}>
                  <button type="button" onClick={() => setList(l => [...l, s])} className="w-full flex items-center gap-3 min-h-14 py-1 text-left press ch-focus">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[17px] font-medium text-ink truncate">{s.label}</span>
                      <span className="block t-cap text-ink/65">{note(s)}</span>
                    </span>
                    <IconPlus size={20} className="text-accent-deep flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="t-cap text-ink/65 mt-4">Team streams arrive once your club lists its interclub teams.</p>
        {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
        <button type="button" disabled={busy || !changed} onClick={() => void save()} className={`${buttonClass('primary')} mt-5`}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
