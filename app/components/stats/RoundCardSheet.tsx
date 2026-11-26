'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askCareer } from '@/lib/careerClient'
import type { CardDetail } from '@/app/api/feed/feed'
import { popClose, popOpen } from '../popOut'
import { SC_CARD } from '../scorecardStyle'
import { warmCard } from '../feed/ItemSheet'
import { IconX } from '../icons'

type CardComponent = Awaited<ReturnType<typeof warmCard>>

/**
 * One of your rounds' scorecards, popped out of its row on the stats page —
 * **the trip's own scorecard** (`ScorecardSheet`, drawn `bare` as the
 * stream's pop-out draws it, D334), never a second copy, and **the site's
 * pop-out** motion (D335: `popOpen`/`popClose`). Read on opening, through
 * the feed's one read of a card, and only ever the account's own. Closed by a
 * tap outside, the ✕ or Escape.
 */
export default function RoundCardSheet({ roundId, title, line, origin, onClose }: {
  roundId: string
  title: string
  line: string
  origin: HTMLElement | null
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const [detail, setDetail] = useState<CardDetail | null | 'none'>(null)
  const [Card, setCard] = useState<CardComponent | null>(null)

  useEffect(() => {
    let live = true
    void askCareer<{ detail: CardDetail | null }>('card', { roundId }).then(r => {
      if (live) setDetail(r.ok && r.detail ? r.detail : 'none')
    })
    void warmCard().then(c => { if (live) setCard(() => c) }).catch(() => { if (live) setDetail('none') })
    return () => { live = false }
  }, [roundId])

  useLayoutEffect(() => {
    popOpen(panel.current, origin, backdrop.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    void popClose(panel.current, origin, backdrop.current).then(onClose)
  }, [onClose, origin])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = was }
  }, [close])

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${title} scorecard`}>
      <div ref={backdrop} className="absolute inset-0 bg-ink/50" onClick={close} />
      <div className="absolute inset-0 flex items-center justify-center p-3 pointer-events-none"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div ref={panel} className={`${SC_CARD} pointer-events-auto relative w-full max-w-lg max-h-full flex flex-col overflow-hidden`}
          style={{ transformOrigin: 'top left' }}>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {detail && detail !== 'none' && Card ? (
              <Card bare inline title={title} subtitle={line}
                players={[detail.player]} round={detail.round} holes={detail.holes} resolved={detail.resolved}
                handicapFor={() => detail.handicap} onClose={close} />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-3">
                  <div className="min-w-0">
                    <p className="t-h2 text-ink break-words">{title}</p>
                    {line && <p className="text-ink/65 text-base truncate">{line}</p>}
                  </div>
                  <button type="button" onClick={close} aria-label="Close"
                    className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink/65 press ch-focus flex-shrink-0">
                    <IconX size={22} />
                  </button>
                </div>
                {detail === 'none'
                  ? <p className="t-cap text-ink/65 px-4 pb-4">Could not load this scorecard — try again.</p>
                  : <div className="px-4 pb-4 space-y-2" aria-busy="true">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-9 rounded-tile" />)}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
