'use client'

import { ago, ordinal } from '@/lib/feed'
import { IconLink } from '../icons'
import { cardClass } from '../ui'
import { DotButton, MoreMenu } from './ItemActions'

/** An item as the server hands it to this viewer (app/api/feed/feed.ts `FeedView`). */
export interface FeedView {
  id: string
  kind: 'card' | 'highlight' | 'comment' | 'board_move' | 'match_result' | 'status' | 'post'
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
  /** "2 comments · John and 1 other" (D329). */
  commentLine: { count: string; who: string } | null
  /** Why a card is in friends.stream when it is not a friend's own (D327). */
  why: string | null
  /** A club post's words and link (D325). */
  text: string | null
  link: string | null
  /** May be commented on and dotted (D329). */
  talk: boolean
  mine: boolean
  audience: 'wide' | 'me' | null
  parentId: string | null
  on: string | null
  canDelete: boolean
  canReport: boolean
  code: string | null
}

/** A link's host, for the line under a post — the whole address is the link itself. */
function hostOf(link: string): string {
  try { return new URL(link).hostname.replace(/^www\./, '') } catch { return link }
}

/**
 * One item of a stream (D302, D325–D329). **One item per card** (D329): its
 * comments are grouped on it — a comment row, "2 comments · John and 1
 * other", never items of their own — and a tap anywhere on it that is not a
 * control opens its sheet (D330). A signed card: the name, the context line,
 * the status, a hairline, gross and points in Bespoke Serif, the place (gold
 * only for 1st). A status: the name and what they said. A club post: the
 * club's word, its paragraphs and its link. Anything else — a leaderboard
 * move, a result, a cut — one line on a flat card. Never an animated number (D9).
 */
export function FeedItem({ item, now, onOpen, onPatch, onGone, arriving = false }: {
  item: FeedView
  now: Date
  /** Opens the item's sheet, from where it sits (D330). */
  onOpen?: (el: HTMLElement) => void
  onPatch: (p: Partial<FeedView>) => void
  onGone: () => void
  /** New since the stream was last read: it fades in at the top (M13). */
  arriving?: boolean
}) {
  const open = (e: React.MouseEvent<HTMLElement>) => {
    if (!onOpen || (e.target as HTMLElement).closest('button, a')) return
    onOpen(e.currentTarget)
  }
  const keyOpen = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!onOpen || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onOpen(e.currentTarget)
  }
  const opens = !!onOpen && item.talk
  const shell = (variant: 'raised' | 'flat', pad: string, children: React.ReactNode) => (
    <article data-item-id={item.id}
      className={`${cardClass(variant, opens)} ${pad} ${opens ? 'cursor-pointer' : ''} ${arriving ? 'stream-arrive' : ''}`}
      onClick={opens ? open : undefined} onKeyDown={opens ? keyOpen : undefined}
      tabIndex={opens ? 0 : undefined} role={opens ? 'button' : undefined}
      aria-label={opens ? `${item.name}${item.kind === 'card' ? '’s card' : ''} — open it, with its comments` : undefined}>
      {children}
    </article>
  )
  const talkRow = item.talk && (
    <div className="flex items-center gap-2 mt-3 pt-1 min-w-0">
      <DotButton item={item} onPatch={onPatch} />
      <span className="t-label text-bark min-w-0 truncate">
        {item.commentLine ? <>{item.commentLine.count} · {item.commentLine.who}</> : 'Comment'}
      </span>
      <MoreMenu item={item} onPatch={onPatch} onGone={onGone} className="ml-auto -mr-2" />
    </div>
  )
  const head = (
    <>
      {item.why && <p className="t-cap text-ink/65 mb-1">{item.why}</p>}
      <div className="flex items-baseline gap-2">
        <h3 className="flex-1 min-w-0 t-card text-ink break-words">{item.name}</h3>
        <time dateTime={item.at} className="t-cap text-ink/65 flex-shrink-0">{ago(item.at, now)}</time>
      </div>
    </>
  )

  if (item.kind === 'post') {
    return shell('raised', 'px-4 py-4', (
      <>
        {head}
        {item.line && <p className="t-label text-ink/65 mt-0.5 break-words">{item.line}</p>}
        {item.text && (
          <div className="mt-2 space-y-2">
            {item.text.split(/\n{2,}/).map((para, i) => <p key={i} className="t-body text-ink break-words whitespace-pre-line">{para}</p>)}
          </div>
        )}
        {item.link && (
          <a href={item.link} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 min-h-11 t-label text-accent-deep press ch-focus rounded-tile break-all">
            <IconLink size={16} className="flex-shrink-0" /> {hostOf(item.link)}
          </a>
        )}
        {talkRow}
      </>
    ))
  }

  if (item.kind === 'status') {
    return shell('raised', 'px-4 py-4', (
      <>
        {head}
        {item.status && <p className="t-body text-ink mt-1.5 break-words">{item.status}</p>}
        {talkRow}
      </>
    ))
  }

  if (item.kind !== 'card') {
    // A result can be talked about (D329); a move or a cut is one line.
    if (item.talk) {
      return shell('flat', 'px-4 py-3', (
        <>
          <div className="flex items-baseline gap-2">
            <p className="flex-1 min-w-0 t-label text-ink break-words">{item.line}</p>
            <time dateTime={item.at} className="t-cap text-ink/65 flex-shrink-0">{ago(item.at, now)}</time>
          </div>
          {talkRow}
        </>
      ))
    }
    return (
      <article data-item-id={item.id} className={`${cardClass('flat')} pl-4 pr-2 py-1.5 flex items-center gap-2 min-h-12 ${arriving ? 'stream-arrive' : ''}`}>
        <p className="flex-1 min-w-0 t-label text-ink break-words py-1.5">{item.line}</p>
        <time dateTime={item.at} className="t-cap text-ink/65 flex-shrink-0">{ago(item.at, now)}</time>
        <MoreMenu item={item} onPatch={onPatch} onGone={onGone} />
      </article>
    )
  }

  return shell('raised', 'px-4 py-4', (
    <>
      {head}
      {item.line && <p className="t-label text-ink/65 mt-0.5 break-words">{item.line}</p>}
      {item.status && <p className="t-body text-ink mt-2 break-words">{item.status}</p>}
      <CardFigures item={item} />
      {item.highlights.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {item.highlights.map(h => (
            <li key={h} className="t-cap text-accent-deep font-semibold flex items-center gap-1.5">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent-deep flex-shrink-0" />{h}
            </li>
          ))}
        </ul>
      )}
      {talkRow}
    </>
  ))
}

/** Gross and points in Bespoke Serif, and the place — gold only for 1st, gold being for winning. */
export function CardFigures({ item }: { item: Pick<FeedView, 'gross' | 'points' | 'place'> }) {
  const scores = [
    item.gross != null ? { v: item.gross, l: 'gross' } : null,
    item.points != null ? { v: item.points, l: 'pts' } : null,
  ].filter(Boolean) as { v: number; l: string }[]
  if (scores.length === 0 && !item.place) return null
  return (
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
  )
}
