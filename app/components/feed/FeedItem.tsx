'use client'

import { ago, ordinal } from '@/lib/feed'
import { cardClass } from '../ui'

/** An item as the server hands it to this viewer (app/api/feed/feed.ts `FeedView`). */
export interface FeedView {
  id: string
  kind: 'card' | 'highlight' | 'comment' | 'board_move' | 'match_result'
  at: string
  name: string
  line: string
  status: string | null
  gross: number | null
  points: number | null
  holes: number | null
  place: number | null
  highlights: string[]
  dots: number
  dotted: boolean
  comments: number
  latest: { name: string; text: string } | null
  mine: boolean
  audience: 'wide' | 'me' | null
  parentId: string | null
  on: string | null
  canDelete: boolean
  canReport: boolean
  code: string | null
}

/**
 * One item of the feed (D302). A signed card is a raised card: the name, the
 * context line, the status, a hairline, gross and points in Bespoke Serif,
 * the place (gold only for 1st — gold is for winning), the card's own
 * highlights, then its dots, comment count and latest comment. Everything
 * else — a comment, a leaderboard move, a result, a cut — is one line on a
 * flat card. Never an animated number (D9).
 */
export function FeedItem({ item, now, actions }: { item: FeedView; now: Date; actions?: React.ReactNode }) {
  if (item.kind !== 'card') {
    return (
      <article className={`${cardClass('flat')} px-4 py-3`}>
        <p className="flex items-baseline gap-2">
          <span className="flex-1 min-w-0 t-label text-ink break-words">
            {item.kind === 'comment' ? <>{item.name} {item.on ?? ''}: <span className="font-normal">{item.line}</span></> : item.line}
          </span>
          <time dateTime={item.at} className="t-cap text-ink/65 flex-shrink-0">{ago(item.at, now)}</time>
        </p>
        {actions}
      </article>
    )
  }
  const scores = [
    item.gross != null ? { v: item.gross, l: 'gross' } : null,
    item.points != null ? { v: item.points, l: 'pts' } : null,
  ].filter(Boolean) as { v: number; l: string }[]
  return (
    <article className={`${cardClass('raised')} px-4 py-4`}>
      <div className="flex items-baseline gap-2">
        <h3 className="flex-1 min-w-0 t-card text-ink break-words">{item.name}</h3>
        <time dateTime={item.at} className="t-cap text-ink/65 flex-shrink-0">{ago(item.at, now)}</time>
      </div>
      {item.line && <p className="t-label text-ink/65 mt-0.5 break-words">{item.line}</p>}
      {item.status && <p className="t-body text-ink mt-2 break-words">{item.status}</p>}
      {(scores.length > 0 || item.place) && (
        <div className="flex items-baseline gap-4 mt-3 pt-3 border-t border-line">
          {scores.map(s => (
            <span key={s.l} className="inline-flex items-baseline gap-1">
              <span className="t-data font-serif text-ink text-[20px]">{s.v}</span>
              <span className="t-cap text-ink/65">{s.l}</span>
            </span>
          ))}
          {item.place && (
            <span className={`ml-auto t-label ${item.place === 1 ? 'text-gold-deep' : 'text-ink/80'}`}>{ordinal(item.place)}</span>
          )}
        </div>
      )}
      {item.highlights.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {item.highlights.map(h => (
            <li key={h} className="t-cap text-accent-deep font-semibold flex items-center gap-1.5">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent-deep flex-shrink-0" />{h}
            </li>
          ))}
        </ul>
      )}
      {actions}
    </article>
  )
}
