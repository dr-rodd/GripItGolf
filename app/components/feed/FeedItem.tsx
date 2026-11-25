'use client'

import { ago, ordinal } from '@/lib/feed'
import { IconLink } from '../icons'
import Initials from '../Initials'
import { SC_SF } from '../scorecardStyle'
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
  /** The latest four comments, oldest first (D342). */
  recent: { id: string; name: string; text: string; mine: boolean; at: string }[]
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

/** A chat bubble's shape (D342): rounded, opaque; yours in the emerald wash, everybody else's white. */
const bubble = (mine: boolean) =>
  `rounded-[22px] px-4 py-2.5 ${mine ? 'bg-accent-tint text-ink' : 'bg-surface text-ink border border-line'}`

/**
 * One item of a stream, laid out like a group chat (D342, Ross, 25 Nov 2026:
 * "Instagram chat format is the design inspiration"): everybody else's on
 * the left at about seven tenths of the width, under their initial and
 * name; **yours on the right**, no initial. A signed card is a **square**
 * (`CardSquare`) — the event and course, the points and the strokes large in
 * the scorecard's own bold serif (`SC_SF`), the place and the first
 * highlight — with its status as a caption bubble beneath, as a shared post
 * carries its caption. A status or a club post is a **chat bubble**. A
 * leaderboard move or a cut is a line across the middle, as a chat says
 * the time. Under each, the dot, when, the ⋯, and **the latest four
 * comments** as small replies; "View all" — or a tap on any of them —
 * springs the item's sheet out of where it was tapped (the pop-out, D330).
 * Never an animated number (D9).
 */
export function FeedItem({ item, now, onOpen, onPatch, onGone, arriving = false }: {
  item: FeedView
  now: Date
  /** Opens the item's sheet, out of the element tapped (D330). */
  onOpen?: (el: HTMLElement) => void
  onPatch: (p: Partial<FeedView>) => void
  onGone: () => void
  /** New since the stream was last read: it fades in at the top (M13). */
  arriving?: boolean
}) {
  const opens = !!onOpen && item.talk
  const open = (e: React.MouseEvent<HTMLElement>) => {
    if (!opens || (e.target as HTMLElement).closest('button, a')) return
    onOpen!(e.currentTarget)
  }
  const keyOpen = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!opens || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onOpen!(e.currentTarget)
  }
  const tappable = (label: string) => opens
    ? { onClick: open, onKeyDown: keyOpen, role: 'button' as const, tabIndex: 0, 'aria-label': label, 'data-pop-origin': '' }
    : {}

  // A leaderboard move, a cut: one line across the middle, as a chat says the time.
  if (!item.talk) {
    return (
      <article data-item-id={item.id} className={`flex items-center justify-center gap-1 py-1 ${arriving ? 'stream-arrive' : ''}`}>
        <p className="t-cap text-ink/65 text-center break-words min-w-0">
          {item.line} · <time dateTime={item.at}>{ago(item.at, now)}</time>
        </p>
        <MoreMenu item={item} onPatch={onPatch} onGone={onGone} className="!w-9 !h-9 -my-2" />
      </article>
    )
  }

  const mine = item.mine
  const isCard = item.kind === 'card'
  return (
    <article data-item-id={item.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''} ${arriving ? 'stream-arrive' : ''}`}>
      {/* Their initial beside the bubble, under their name's line. */}
      {!mine && <span className="flex-shrink-0 mt-5"><Initials name={item.name} size={28} /></span>}
      <div className={`flex flex-col min-w-0 ${mine ? 'items-end' : 'items-start'} ${isCard ? 'w-[72%]' : 'max-w-[72%]'}`}>
        {!mine && <p className="t-cap text-ink/65 px-3 mb-1 truncate max-w-full">{item.name}</p>}
        {item.why && <p className="t-cap text-ink/65 px-3 mb-1">{item.why}</p>}

        {isCard ? (
          <>
            <div {...tappable(`${item.name}’s card — open it, with its comments`)} className={`w-full ${opens ? 'cursor-pointer press ch-focus rounded-[22px]' : ''}`}>
              <CardSquare item={item} />
            </div>
            {item.status && <p className={`${bubble(mine)} mt-1 text-[15px] leading-snug break-words max-w-full`}>{item.status}</p>}
          </>
        ) : (
          <div {...tappable(`${item.name}’s ${item.kind === 'post' ? 'post' : 'status'} — open it, with its comments`)}
            className={`${bubble(mine)} max-w-full ${opens ? 'cursor-pointer press ch-focus' : ''}`}>
            {item.kind === 'post' && item.line && <p className="t-label text-ink break-words">{item.line}</p>}
            {item.kind === 'post' && item.text && (
              <div className={`${item.line ? 'mt-1 ' : ''}space-y-2`}>
                {item.text.split(/\n{2,}/).map((para, i) => <p key={i} className="text-[16px] leading-snug break-words whitespace-pre-line">{para}</p>)}
              </div>
            )}
            {item.kind === 'post' && item.link && (
              <a href={item.link} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 min-h-11 t-label text-accent-deep press ch-focus rounded-tile break-all">
                <IconLink size={16} className="flex-shrink-0" /> {hostOf(item.link)}
              </a>
            )}
            {item.kind === 'status' && item.status && <p className="text-[16px] leading-snug break-words">{item.status}</p>}
            {item.kind === 'match_result' && <p className="text-[16px] leading-snug break-words">{item.line}</p>}
          </div>
        )}

        {/* The dot, when, the ⋯ — small, under the bubble, as a chat's reactions hang. */}
        <div className={`flex items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
          <DotButton item={item} onPatch={onPatch} />
          <time dateTime={item.at} className="t-cap text-ink/65 px-1">{ago(item.at, now)}</time>
          <MoreMenu item={item} onPatch={onPatch} onGone={onGone} className="!w-9 !h-9" />
        </div>

        {/* The latest four comments as small replies; all of them in the sheet (D342). */}
        {item.recent.length > 0 && (
          <div {...tappable(`${item.commentLine?.count ?? 'Comments'} — open them all`)}
            className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'} max-w-full ${opens ? 'cursor-pointer rounded-[18px] ch-focus' : ''}`}>
            {item.comments > item.recent.length && (
              <p className="t-label text-accent-deep px-3 min-h-8 flex items-center">View all {item.comments} comments</p>
            )}
            {item.recent.map(c => (
              <p key={c.id} className={`rounded-[18px] px-3 py-1.5 text-[14px] leading-snug break-words max-w-full ${c.mine ? 'bg-accent-tint' : 'bg-surface border border-line'}`}>
                <span className="font-semibold">{c.mine ? 'You' : c.name}</span> {c.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * A signed card as a square (D342, Ross: "scorecards should be roughly
 * square, with clear points / strokes total… the old trip typeface for the
 * totals"): the event and course at the top; the points large, the strokes
 * under them, both in the scorecard's own bold serif (`SC_SF`, the trip
 * card's totals); the holes, the place (gold only for 1st, gold being for
 * winning) and the first highlight at the foot.
 */
export function CardSquare({ item }: { item: Pick<FeedView, 'line' | 'gross' | 'points' | 'place' | 'holes' | 'highlights'> }) {
  const lead = item.points != null ? { v: item.points, l: 'points' } : item.gross != null ? { v: item.gross, l: 'strokes' } : null
  const second = item.points != null && item.gross != null ? { v: item.gross, l: 'strokes' } : null
  return (
    <div className="aspect-square w-full rounded-[22px] bg-surface border border-line shadow-raised p-4 flex flex-col overflow-hidden">
      {item.line && <p className="t-cap text-ink/65 line-clamp-2 break-words">{item.line}</p>}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        {lead ? (
          <>
            <span className="font-bold text-ink leading-none text-[56px] tabular-nums" style={SC_SF}>{lead.v}</span>
            <span className="t-label text-ink/65 mt-1">{lead.l}</span>
            {second && (
              <span className="mt-3 inline-flex items-baseline gap-1.5">
                <span className="font-bold text-ink leading-none text-[26px] tabular-nums" style={SC_SF}>{second.v}</span>
                <span className="t-cap text-ink/65">{second.l}</span>
              </span>
            )}
          </>
        ) : <span className="t-cap text-ink/65">No total yet</span>}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        {item.highlights[0] && <span className="t-cap text-accent-deep font-semibold truncate min-w-0">{item.highlights[0]}</span>}
        {!item.highlights[0] && item.holes != null && item.holes < 18 && <span className="t-cap text-ink/65">{item.holes} holes</span>}
        {item.place && (
          <span className={`ml-auto t-label flex-shrink-0 ${item.place === 1 ? 'text-gold-deep' : 'text-ink/80'}`}>{ordinal(item.place)}</span>
        )}
      </div>
    </div>
  )
}
